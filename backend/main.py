import os
import json
import datetime
from pathlib import Path
from typing import List, Optional
from contextlib import asynccontextmanager

from fastapi import FastAPI, Depends, HTTPException, Query, UploadFile, File
from fastapi.responses import FileResponse, StreamingResponse
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session
from pydantic import BaseModel

from database import Base, engine, get_db, COVERS_DIR
from models import (
    Item, Progress, Tag, Setting,
    ItemResponse, ItemUpdate, ProgressResponse,
    ProgressCreate, TagResponse
)
from scanner import scan_library_folder, SUPPORTED_EXTENSIONS
from metadata import process_file_metadata_and_cover
from metadata_service import (
    get_api_key,
    processar_lote_com_progresso,
    mapear_metadados_para_item,
    MetadataServiceError,
)

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Initialize SQLite database tables on startup
    Base.metadata.create_all(bind=engine)
    yield

app = FastAPI(
    title="Librarian Backend API", 
    description="API para gerenciar a biblioteca pessoal do aplicativo Krumer", 
    version="0.1.0",
    lifespan=lifespan
)

# Enable CORS for Electron/Frontend integration
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- Request Payloads ---

class ScanPayload(BaseModel):
    path: str

class SettingsUpdatePayload(BaseModel):
    pass

class ApiKeyPayload(BaseModel):
    api_key: str

class ProgressUpdatePayload(BaseModel):
    file_path: str
    progress_pct: float
    current_page: int
    total_pages: Optional[int] = None
    cfi: Optional[str] = None

class MetadataFetchPayload(BaseModel):
    item_ids: List[int]

class MetadataApplyItem(BaseModel):
    item_id: int
    metadados: Optional[dict] = None

class MetadataApplyPayload(BaseModel):
    results: List[MetadataApplyItem]


# --- Helper Functions ---

def _enrich_item(item: Item, db: Session) -> ItemResponse:
    res = ItemResponse.model_validate(item)
    if item.type == "series":
        children = db.query(Item).filter(Item.parent_id == item.id).all()
        res.children_count = len(children)
        if len(children) > 0:
            child_ids = [c.id for c in children]
            progs = db.query(Progress).filter(Progress.item_id.in_(child_ids)).all()
            # Capítulos ainda na 1ª página não contam para o progresso
            prog_map = {
                p.item_id: (p.progress_pct if (p.current_page or 0) > 1 else 0.0)
                for p in progs
            }
            total_pct = sum(prog_map.get(cid, 0.0) for cid in child_ids)
            res.overall_progress = round(total_pct / len(children), 1)
        else:
            res.overall_progress = 0.0
    else:
        res.children_count = 0
        if item.progress:
            prog = item.progress[0]
            # Só conta o progresso se passou da 1ª página
            res.overall_progress = prog.progress_pct if (prog.current_page or 0) > 1 else 0.0
        else:
            res.overall_progress = 0.0
    return res


# --- API Routes ---

def _validate_gemini_key(api_key: str) -> None:
    """
    Valida a chave da API Gemini fazendo uma requisição HTTP direta ao endpoint
    de listagem de modelos. Não depende do SDK google-genai nem de chamadas
    de generate_content, evitando erros de interpretação de conteúdo.
    """
    import urllib.request
    import urllib.error
    import json as _json

    url = f"https://generativelanguage.googleapis.com/v1beta/models?key={api_key}"
    try:
        req = urllib.request.Request(url)
        with urllib.request.urlopen(req, timeout=10) as resp:
            data = _json.loads(resp.read().decode())
            if "models" not in data:
                raise HTTPException(
                    status_code=400,
                    detail="Resposta inesperada da API Gemini. A chave pode ser inválida.",
                )
    except urllib.error.HTTPError as e:
        if e.code in (403, 401):
            raise HTTPException(
                status_code=400,
                detail="Chave do Gemini inválida ou sem permissão. Verifique o valor informado.",
            )
        raise HTTPException(
            status_code=400,
            detail=f"Erro ao validar a chave (HTTP {e.code}): {e.reason}",
        )
    except urllib.error.URLError:
        raise HTTPException(
            status_code=400,
            detail="Não foi possível conectar à API Gemini. Verifique sua conexão de rede.",
        )


@app.get("/settings/api-key")
def get_api_key_status():
    """
    Retorna apenas se a chave do Gemini está configurada, sem expor o valor.
    """
    from metadata_service import get_api_key as _get_key
    key = _get_key()
    return {"configured": bool(key)}


@app.put("/settings/api-key")
def update_api_key(payload: ApiKeyPayload):
    """
    Grava a chave do Gemini no arquivo .env do backend após validar via
    chamada teste à API. Não expõe o valor gravado.
    """
    api_key = (payload.api_key or "").strip()
    if not api_key:
        raise HTTPException(status_code=400, detail="A chave da API não pode ser vazia.")

    # Valida a chave antes de persistir
    _validate_gemini_key(api_key)

    from metadata_service import ENV_PATH

    # (Re)escreve o arquivo .env preservando outras variáveis existentes
    lines = []
    found = False
    if ENV_PATH.exists():
        with open(ENV_PATH, "r", encoding="utf-8") as f:
            for raw_line in f:
                stripped = raw_line.strip()
                if stripped.startswith("GEMINI_API_KEY="):
                    lines.append(f"GEMINI_API_KEY={api_key}\n")
                    found = True
                else:
                    lines.append(raw_line if raw_line.endswith("\n") else raw_line + "\n")

    if not found:
        if lines and lines[-1] and not lines[-1].endswith("\n"):
            lines[-1] += "\n"
        lines.append(f"GEMINI_API_KEY={api_key}\n")

    with open(ENV_PATH, "w", encoding="utf-8") as f:
        f.writelines(lines)

    # Recarrega a variável no processo atual para uso imediato
    os.environ["GEMINI_API_KEY"] = api_key

    return {"status": "success", "message": "Chave do Gemini salva e validada com sucesso."}


@app.post("/scan")
def scan_directory_route(payload: ScanPayload, db: Session = Depends(get_db)):
    """Scans a directory on the host computer, indexing files and generating covers."""
    try:
        scan_library_folder(db, payload.path)
        return {"status": "success", "message": f"Scan completed successfully for: {payload.path}"}
    except ValueError as ve:
        raise HTTPException(status_code=400, detail=str(ve))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Scan failed: {str(e)}")

@app.get("/tags", response_model=List[TagResponse])
def get_all_tags(db: Session = Depends(get_db)):
    """Lists all tags defined in the database."""
    return db.query(Tag).order_by(Tag.name.asc()).all()

@app.get("/items", response_model=List[ItemResponse])
def get_items(
    parent_id: Optional[int] = None,
    type: Optional[str] = None,
    search: Optional[str] = None,
    tag: Optional[str] = None,
    sort_by: str = "title",
    order: str = "asc",
    skip: int = 0,
    limit: int = 100,
    db: Session = Depends(get_db)
):
    """Lists items in the library. Returns root items by default unless parent_id/type is provided."""
    query = db.query(Item)
    
    if parent_id is not None:
        query = query.filter(Item.parent_id == parent_id)
    else:
        if type != "chapter" and parent_id is None:
            query = query.filter(Item.parent_id == None)
            
    if type:
        query = query.filter(Item.type == type)
        
    if tag:
        query = query.join(Item.tags).filter(Tag.name == tag)
        
    if search:
        query = query.filter(
            (Item.title.ilike(f"%{search}%")) | (Item.author.ilike(f"%{search}%"))
        )
        
    sort_attr = getattr(Item, sort_by, Item.title)
    if order.lower() == "desc":
        query = query.order_by(sort_attr.desc())
    else:
        query = query.order_by(sort_attr.asc())
        
    items = query.offset(skip).limit(limit).all()
    return [_enrich_item(item, db) for item in items]

@app.get("/items/{id}", response_model=ItemResponse)
def get_item_by_id(id: int, db: Session = Depends(get_db)):
    """Retrieves full details of a specific library item."""
    item = db.query(Item).filter(Item.id == id).first()
    if not item:
        raise HTTPException(status_code=404, detail="Item not found")
    return _enrich_item(item, db)

@app.put("/items/{id}", response_model=ItemResponse)
def update_item_metadata(id: int, payload: ItemUpdate, db: Session = Depends(get_db)):
    """Allows manual editing of item details, ratings, and tags.
    
    Empty strings are treated as 'user wants to clear this field' and are
    stored as NULL in the database.  A field set to None in the payload
    means 'not sent / not changed' and is left untouched.
    """
    item = db.query(Item).filter(Item.id == id).first()
    if not item:
        raise HTTPException(status_code=404, detail="Item not found")

    # Helper: normalise blank / whitespace-only strings to None (NULL in DB)
    def _clean(value):
        if isinstance(value, str):
            stripped = value.strip()
            return stripped if stripped else None
        return value

    # Only update fields that were explicitly sent (not None).
    # An empty string "" is intentional — the user cleared the field.
    if payload.title is not None:
        cleaned_title = _clean(payload.title)
        if cleaned_title:                    # title must never be blank
            item.title = cleaned_title
    if payload.author is not None:
        item.author = _clean(payload.author)
    if payload.publisher is not None:
        item.publisher = _clean(payload.publisher)
    if payload.year is not None:
        item.year = payload.year if payload.year else None  # 0 = clear
    if payload.description is not None:
        item.description = _clean(payload.description)
        
    if payload.rating is not None:
        if payload.rating < 1 or payload.rating > 5:
            raise HTTPException(status_code=400, detail="Rating must be between 1 and 5")
        item.rating = payload.rating
        
    if payload.tags is not None:
        item.tags = []
        for tag_name in payload.tags:
            tag_name_clean = tag_name.strip()
            if not tag_name_clean:
                continue
            tag = db.query(Tag).filter(Tag.name == tag_name_clean).first()
            if not tag:
                tag = Tag(name=tag_name_clean)
                db.add(tag)
                db.flush()
            item.tags.append(tag)
            
    db.commit()
    db.refresh(item)
    return item

@app.post("/items/{id}/cover", response_model=ItemResponse)
async def upload_custom_book_cover(id: int, file: UploadFile = File(...), db: Session = Depends(get_db)):
    """Uploads and updates a custom cover image for a library item."""
    item = db.query(Item).filter(Item.id == id).first()
    if not item:
        raise HTTPException(status_code=404, detail="Item not found")
        
    import hashlib
    from PIL import Image
    import io
    
    contents = await file.read()
    if not contents:
        raise HTTPException(status_code=400, detail="Empty image file uploaded")
        
    try:
        image = Image.open(io.BytesIO(contents))
        image.thumbnail((400, 600))
        
        cover_hash = hashlib.sha256(item.path.encode('utf-8')).hexdigest()
        cover_path = COVERS_DIR / f"{cover_hash}.png"
        image.save(cover_path, format="PNG")
        
        item.cover_path = str(cover_path)
        db.commit()
        db.refresh(item)
        return _enrich_item(item, db)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Invalid image format: {str(e)}")



@app.delete("/items/{id}")
def remove_item_from_library(id: int, db: Session = Depends(get_db)):
    """
    Remove o item da biblioteca (banco de dados) sem apagar o arquivo do disco.
    Se for uma série, remove também todos os capítulos filhos e seus progressos.
    """
    item = db.query(Item).filter(Item.id == id).first()
    if not item:
        raise HTTPException(status_code=404, detail="Item not found")

    item_title = item.title

    if item.type == "series":
        # Remove progresso de todos os capítulos filhos
        children = db.query(Item).filter(Item.parent_id == id).all()
        for child in children:
            db.query(Progress).filter(Progress.item_id == child.id).delete()
            db.delete(child)

    # Remove o progresso do próprio item
    db.query(Progress).filter(Progress.item_id == id).delete()

    # Remove o item (cascade de tags é tratado pelo ORM)
    db.delete(item)
    db.commit()

    return {"status": "removed", "message": f"'{item_title}' foi removido da biblioteca. O arquivo original não foi alterado."}

@app.get("/items/{id}/progress", response_model=List[ProgressResponse])
def get_reading_progress(id: int, db: Session = Depends(get_db)):
    """
    Returns reading progress. 
    If a book or chapter, returns its single progress item.
    If a series, returns the progress records of all its chapters.
    """
    item = db.query(Item).filter(Item.id == id).first()
    if not item:
        raise HTTPException(status_code=404, detail="Item not found")
    
    if item.type == "series":
        child_ids = [child.id for child in item.children]
        return db.query(Progress).filter(Progress.item_id.in_(child_ids)).all()
    else:
        return item.progress

@app.put("/items/{id}/progress", response_model=ProgressResponse)
def save_reading_progress(id: int, payload: ProgressUpdatePayload, db: Session = Depends(get_db)):
    """Saves or updates reading progress for a book or chapter, and updates last_read timestamps."""
    item = db.query(Item).filter(Item.id == id).first()
    if not item:
        raise HTTPException(status_code=404, detail="Item not found")
        
    progress_record = db.query(Progress).filter(
        Progress.item_id == id,
        Progress.file_path == payload.file_path
    ).first()
    
    if progress_record:
        progress_record.progress_pct = payload.progress_pct
        progress_record.current_page = payload.current_page
        if payload.total_pages is not None:
            progress_record.total_pages = payload.total_pages
        if payload.cfi is not None:
            progress_record.cfi = payload.cfi
        progress_record.updated_at = datetime.datetime.utcnow()
    else:
        progress_record = Progress(
            item_id=id,
            file_path=payload.file_path,
            progress_pct=payload.progress_pct,
            current_page=payload.current_page,
            total_pages=payload.total_pages,
            cfi=payload.cfi
        )
        db.add(progress_record)
        
    # Update last read timestamp
    item.last_read = datetime.datetime.utcnow()
    if item.parent_id:
        parent = db.query(Item).filter(Item.id == item.parent_id).first()
        if parent:
            parent.last_read = datetime.datetime.utcnow()
            
    db.commit()
    db.refresh(progress_record)
    return progress_record

@app.get("/items/{id}/cover")
def get_book_cover_image(id: int, db: Session = Depends(get_db)):
    """Serves the cover image file. Re-generates it on the fly if cached file was deleted."""
    item = db.query(Item).filter(Item.id == id).first()
    if not item or not item.cover_path:
        raise HTTPException(status_code=404, detail="Cover not found")
        
    if not os.path.exists(item.cover_path):
        try:
            process_file_metadata_and_cover(item.path, 'filename')
        except Exception:
            raise HTTPException(status_code=404, detail="Cover file missing and auto-regeneration failed")
            
    return FileResponse(item.cover_path, media_type="image/png")

@app.get("/files")
def serve_media_file(path: str):
    """Serves the actual book/chapter media file (EPUB/PDF) supporting HTTP Range requests."""
    if not os.path.exists(path):
        raise HTTPException(status_code=404, detail="File not found")
    if not os.path.isfile(path):
        raise HTTPException(status_code=400, detail="Path is not a file")
        
    suffix = Path(path).suffix.lower()
    if suffix not in SUPPORTED_EXTENSIONS:
        raise HTTPException(status_code=400, detail="Unsupported file format")
        
    media_type = "application/epub+zip" if suffix == ".epub" else "application/pdf"
    return FileResponse(path, media_type=media_type)

@app.get("/browse-folder")
def browse_folder_native_dialog():
    """Abre o diálogo nativo do sistema operacional (Windows/Linux/Mac) para seleção de diretório e retorna o caminho absoluto completo."""
    try:
        import tkinter as tk
        from tkinter import filedialog
        root = tk.Tk()
        root.withdraw()
        root.attributes("-topmost", True)
        selected_dir = filedialog.askdirectory(title="Selecionar pasta de livros")
        root.destroy()
        if selected_dir:
            norm_path = os.path.normpath(selected_dir)
            return {"status": "success", "path": norm_path}
        return {"status": "cancelled", "path": None}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erro ao abrir seletor nativo: {str(e)}")

@app.get("/settings")
def get_global_settings(db: Session = Depends(get_db)):
    """Fetches key-value configuration flags."""
    last_scanned = db.query(Setting).filter(Setting.key == "last_scanned_path").first()
    return {
        "use_filename_as_title": True,
        "last_scanned_path": last_scanned.value if last_scanned else None
    }

@app.put("/settings")
def update_global_settings(payload: SettingsUpdatePayload, db: Session = Depends(get_db)):
    """Saves key-value configuration flags."""
    return get_global_settings(db)

@app.post("/rescan")
def rescan_directory_route(db: Session = Depends(get_db)):
    """Reescaneia a última pasta configurada sem abrir seletores ou diálogos (implementacoes.md §1)."""
    last_setting = db.query(Setting).filter(Setting.key == "last_scanned_path").first()
    if not last_setting or not last_setting.value:
        raise HTTPException(
            status_code=400,
            detail="Nenhum diretório foi escaneado anteriormente. Escaneie uma pasta primeiro."
        )

    path = last_setting.value
    if not os.path.exists(path):
        raise HTTPException(
            status_code=400,
            detail=f"O diretório '{path}' não existe mais no disco."
        )

    try:
        scan_library_folder(db, path)
        return {
            "status": "success",
            "message": f"Reescaneamento concluído com sucesso para: {path}",
            "path": path
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erro ao reescanear: {str(e)}")


@app.post("/metadata/fetch")
def fetch_metadata_stream(payload: MetadataFetchPayload, db: Session = Depends(get_db)):
    """
    Busca metadados via Gemini para até 10 itens, emitindo progresso via SSE.
    Não altera arquivos originais — apenas retorna resultados para preview.
    """
    if not get_api_key():
        raise HTTPException(
            status_code=400,
            detail="GEMINI_API_KEY não configurada. Defina a variável de ambiente antes de buscar metadados.",
        )

    if not payload.item_ids:
        raise HTTPException(status_code=400, detail="Nenhum item selecionado.")
    if len(payload.item_ids) > 10:
        raise HTTPException(status_code=400, detail="Máximo de 10 obras por lote.")

    items = db.query(Item).filter(Item.id.in_(payload.item_ids)).all()
    if len(items) != len(payload.item_ids):
        raise HTTPException(status_code=404, detail="Um ou mais itens não foram encontrados.")

    id_order = {item_id: idx for idx, item_id in enumerate(payload.item_ids)}
    items.sort(key=lambda i: id_order[i.id])

    lote = []
    for item in items:
        if item.type == "series":
            # Séries já têm um título limpo — usa diretamente como query,
            # sem passar pelo limpador de nome de arquivo.
            lote.append({
                "item_id": item.id,
                "nome_arquivo": item.title,
                "query_direta": item.title,
            })
        else:
            lote.append({
                "item_id": item.id,
                "nome_arquivo": os.path.basename(item.path),
            })

    def event_stream():
        try:
            for atual, total, resultado in processar_lote_com_progresso(lote):
                yield f"data: {json.dumps({'type': 'progress', 'atual': atual, 'total': total}, ensure_ascii=False)}\n\n"
                yield f"data: {json.dumps({'type': 'result', 'data': resultado}, ensure_ascii=False)}\n\n"
            yield f"data: {json.dumps({'type': 'done'})}\n\n"
        except MetadataServiceError as e:
            yield f"data: {json.dumps({'type': 'error', 'message': str(e)}, ensure_ascii=False)}\n\n"
        except Exception as e:
            yield f"data: {json.dumps({'type': 'error', 'message': f'Erro ao buscar metadados: {str(e)}'}, ensure_ascii=False)}\n\n"

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


@app.post("/metadata/apply", response_model=List[ItemResponse])
def apply_metadata(payload: MetadataApplyPayload, db: Session = Depends(get_db)):
    """
    Aplica metadados encontrados ao registro interno do app (SQLite).
    Arquivos originais no disco não são alterados.
    """
    updated_items = []

    for entry in payload.results:
        if not entry.metadados:
            continue

        item = db.query(Item).filter(Item.id == entry.item_id).first()
        if not item:
            continue

        mapped = mapear_metadados_para_item(entry.metadados)

        if mapped.get("title"):
            item.title = mapped["title"]
            item.metadata_title = mapped["metadata_title"]
        if mapped.get("author") is not None:
            item.author = mapped["author"]
        if mapped.get("year") is not None:
            item.year = mapped["year"]
        if mapped.get("description") is not None:
            item.description = mapped["description"]

        updated_items.append(item)

    db.commit()
    for item in updated_items:
        db.refresh(item)

    return [_enrich_item(item, db) for item in updated_items]



# Run direct script
if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="127.0.0.1", port=8765, reload=True)
