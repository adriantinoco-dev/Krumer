import os
import json
import io
import zipfile
import mimetypes
import datetime
from pathlib import Path
from typing import List, Optional
from contextlib import asynccontextmanager

from fastapi import FastAPI, Depends, HTTPException, Query, UploadFile, File, Request
from fastapi.responses import FileResponse, StreamingResponse
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session
from sqlalchemy import text
from pydantic import BaseModel

from database import Base, engine, get_db, COVERS_DIR
from models import (
    Item, Progress, Tag, Setting, UserList, list_items,
    ItemResponse, ItemUpdate, ProgressResponse,
    ProgressCreate, TagResponse,
    UserListCreate, UserListUpdate, UserListResponse, ListItemsPayload
)
from scanner import scan_library_folder, SUPPORTED_EXTENSIONS, count_files_in_path
from archive import archive_item, try_restore_item
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

    # Migrations inline — adiciona colunas novas em bancos de dados existentes
    with engine.connect() as conn:
        # Verificar e adicionar coluna is_read (v2)
        try:
            conn.execute(text("ALTER TABLE items ADD COLUMN is_read BOOLEAN NOT NULL DEFAULT 0"))
            conn.commit()
        except Exception:
            pass  # Coluna já existe — ignorar

        # Verificar e adicionar coluna cover_original_path (v3)
        try:
            conn.execute(text("ALTER TABLE items ADD COLUMN cover_original_path TEXT"))
            conn.commit()
        except Exception:
            pass  # Coluna já existe — ignorar

        # Verificar e adicionar coluna file_size (v4 - arquivo morto de metadados)
        try:
            conn.execute(text("ALTER TABLE items ADD COLUMN file_size INTEGER"))
            conn.commit()
        except Exception:
            pass  # Coluna já existe — ignorar

        # Migração — tabela archived_items (arquivo morto de metadados)
        try:
            conn.execute(text("""
                CREATE TABLE IF NOT EXISTS archived_items (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    fingerprint TEXT NOT NULL UNIQUE,
                    item_type TEXT NOT NULL,
                    snapshot TEXT,
                    archived_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            """))
            conn.commit()
        except Exception:
            pass

        # Migração — tabela user_lists
        try:
            conn.execute(text("""
                CREATE TABLE IF NOT EXISTS user_lists (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    name TEXT NOT NULL,
                    sort_order INTEGER DEFAULT 0,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            """))
            conn.commit()
        except Exception:
            pass

        # Migração — tabela list_items (associação)
        try:
            conn.execute(text("""
                CREATE TABLE IF NOT EXISTS list_items (
                    list_id INTEGER NOT NULL REFERENCES user_lists(id) ON DELETE CASCADE,
                    item_id INTEGER NOT NULL REFERENCES items(id) ON DELETE CASCADE,
                    added_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    PRIMARY KEY (list_id, item_id)
                )
            """))
            conn.commit()
        except Exception:
            pass

        # Migração — coluna is_default em user_lists
        try:
            conn.execute(text("ALTER TABLE user_lists ADD COLUMN is_default BOOLEAN NOT NULL DEFAULT 0"))
            conn.commit()
        except Exception:
            pass

        # Seed — lista padrão "Favoritos"
        try:
            with Session(bind=engine) as session:
                existing = session.query(UserList).filter(UserList.name == "Favoritos").first()
                if not existing:
                    session.add(UserList(name="Favoritos", sort_order=-1, is_default=True))
                    session.commit()
                else:
                    # Garantir que listas "Favoritos" existentes tenham a flag
                    if not existing.is_default:
                        existing.is_default = True
                        existing.sort_order = -1
                        session.commit()
        except Exception:
            pass

        # Backfill file_size for existing items whose files still exist
        try:
            with Session(bind=engine) as session:
                items_missing_size = session.query(Item).filter(Item.file_size == None).all()
                for item in items_missing_size:
                    if item.type != "series" and os.path.exists(item.path):
                        try:
                            item.file_size = os.path.getsize(item.path)
                        except OSError:
                            pass
                session.commit()
        except Exception:
            pass

        # Backfill cover_original_path for existing files
        try:
            with Session(bind=engine) as session:
                items_to_migrate = session.query(Item).filter(
                    Item.cover_original_path == None,
                    Item.type.in_(["book", "chapter"])
                ).all()
                if items_to_migrate:
                    import hashlib
                    from PIL import Image
                    from metadata import get_epub_metadata, get_pdf_metadata
                    
                    for item in items_to_migrate:
                        if not os.path.exists(item.path):
                            continue
                        cover_hash = hashlib.sha256(item.path.encode('utf-8')).hexdigest()
                        orig_path = COVERS_DIR / f"{cover_hash}_original.png"

                        # Se a capa de exibição (ou o arquivo original) for idêntica à
                        # extração original, aponta cover_path para a mesma imagem para
                        # que o estado do botão "Restaurar capa original" fique correto.
                        display_path = Path(item.cover_path) if item.cover_path else None
                        original_saved = False

                        if orig_path.exists():
                            item.cover_original_path = str(orig_path)
                            original_saved = True
                        else:
                            suffix = Path(item.path).suffix.lower()
                            cover_bytes = None
                            if suffix == '.epub':
                                _, _, cover_bytes = get_epub_metadata(item.path)
                            elif suffix == '.pdf':
                                _, _, _, cover_bytes = get_pdf_metadata(item.path)

                            if cover_bytes:
                                try:
                                    image = Image.open(io.BytesIO(cover_bytes))
                                    target_w, target_h = 450, 600
                                    img_ratio = image.width / image.height
                                    target_ratio = target_w / target_h
                                    if img_ratio > target_ratio:
                                        new_w = int(image.height * target_ratio)
                                        left = (image.width - new_w) // 2
                                        image = image.crop((left, 0, left + new_w, image.height))
                                    else:
                                        new_h = int(image.width / target_ratio)
                                        top = (image.height - new_h) // 2
                                        image = image.crop((0, top, image.width, top + new_h))
                                    image = image.resize((target_w, target_h), Image.LANCZOS)
                                    image.save(orig_path, format="PNG")
                                    item.cover_original_path = str(orig_path)
                                    original_saved = True
                                except Exception:
                                    pass

                        if original_saved and display_path is not None:
                            if not display_path.exists():
                                item.cover_path = str(orig_path)
                            else:
                                try:
                                    with open(str(display_path), "rb") as fp:
                                        cur_md5 = hashlib.md5(fp.read()).hexdigest()
                                    with open(str(orig_path), "rb") as fp:
                                        orig_md5 = hashlib.md5(fp.read()).hexdigest()
                                    if cur_md5 == orig_md5:
                                        item.cover_path = str(orig_path)
                                except Exception:
                                    pass
                    session.commit()
        except Exception as e:
            print(f"Error in cover_original_path backfill: {e}")

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
    language: Optional[str] = None
    chapter_view_mode: Optional[str] = None

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
    children = db.query(Item).filter(Item.parent_id == item.id).all()
    if children:
        res.children_count = len(children)
        child_ids = [c.id for c in children]
        progs = db.query(Progress).filter(Progress.item_id.in_(child_ids)).all()
        prog_map = {
            progress.item_id: progress.progress_pct if (progress.current_page or 0) > 1 else 0.0
            for progress in progs
        }
        total_pct = sum(100.0 if child.is_read else prog_map.get(child.id, 0.0) for child in children)
        res.overall_progress = round(total_pct / len(children), 1)
    else:
        res.children_count = 0
        if item.is_read:
            res.overall_progress = 100.0
        if item.progress:
            prog = item.progress[0]
            # Só conta o progresso se passou da 1ª página
            res.overall_progress = 100.0 if item.is_read else (prog.progress_pct if (prog.current_page or 0) > 1 else 0.0)
        else:
            res.overall_progress = 100.0 if item.is_read else 0.0
    return res

def _is_item_fully_read(item: Item) -> bool:
    if item.is_read:
        return True
    if item.progress:
        return any((progress.progress_pct or 0.0) >= 100.0 for progress in item.progress)
    return False

def _set_item_read_progress(db: Session, item: Item, is_read: bool) -> None:
    item.is_read = is_read

    existing = db.query(Progress).filter(Progress.item_id == item.id).first()
    if is_read:
        total = existing.total_pages if existing and existing.total_pages else 9999
        if existing:
            existing.progress_pct = 100.0
            existing.current_page = total
            existing.updated_at = datetime.datetime.utcnow()
        else:
            db.add(Progress(
                item_id=item.id,
                file_path=item.path,
                progress_pct=100.0,
                current_page=total,
                total_pages=total
            ))
    else:
        if existing:
            existing.progress_pct = 0.0
            existing.current_page = 0
            existing.cfi = None
            existing.updated_at = datetime.datetime.utcnow()
        else:
            db.add(Progress(
                item_id=item.id,
                file_path=item.path,
                progress_pct=0.0,
                current_page=0,
                cfi=None
            ))

def _sync_parent_read_status(db: Session, parent: Item) -> None:
    children = db.query(Item).filter(Item.parent_id == parent.id).all()
    parent.is_read = bool(children) and all(_is_item_fully_read(child) for child in children)

def _sync_read_status_after_item_change(db: Session, item: Item) -> None:
    now = datetime.datetime.utcnow()
    item.last_read = now

    children = db.query(Item).filter(Item.parent_id == item.id).all()
    if children:
        for child in children:
            _set_item_read_progress(db, child, item.is_read)
            child.last_read = now

    if item.parent_id:
        parent = db.query(Item).filter(Item.id == item.parent_id).first()
        if parent:
            _sync_parent_read_status(db, parent)
            parent.last_read = now


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


@app.get("/onboarding/status")
def get_onboarding_status(db: Session = Depends(get_db)):
    """
    Retorna o status de onboarding: se é primeiro uso, se há chave configurada,
    se há pasta escaneada, e a contagem de itens na biblioteca.
    """
    from metadata_service import get_api_key as _get_key
    item_count = db.query(Item).count()
    last_scanned = db.query(Setting).filter(Setting.key == "last_scanned_path").first()
    has_folder = bool(last_scanned and last_scanned.value)
    has_api_key = bool(_get_key())

    return {
        "is_first_use": item_count == 0 and not has_folder,
        "items_count": item_count,
        "has_api_key": has_api_key,
        "has_folder": has_folder,
    }


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


@app.post("/scan/progress")
def scan_directory_with_progress(payload: ScanPayload, db: Session = Depends(get_db)):
    """
    Escaneia uma pasta emitindo progresso via SSE, similar ao fluxo de
    busca de metadados. Útil para feedback visual durante escaneamentos longos.
    """
    import threading
    import queue

    path = payload.path
    if not path:
        raise HTTPException(status_code=400, detail="Caminho não informado.")

    total = count_files_in_path(path)
    q = queue.Queue()

    def scan_worker():
        try:
            def on_progress(current, total, message):
                q.put_nowait(("progress", current, total, message))

            from database import SessionLocal
            scan_db = SessionLocal()
            try:
                scan_library_folder(scan_db, path, progress_callback=on_progress)
            finally:
                scan_db.close()

            q.put_nowait(("done", f"Escaneamento concluído para: {path}"))
        except Exception as e:
            q.put_nowait(("error", str(e)))

    thread = threading.Thread(target=scan_worker, daemon=True)
    thread.start()

    def event_stream():
        yield f"data: {json.dumps({'type': 'progress', 'current': 0, 'total': total, 'message': 'Iniciando escaneamento...'}, ensure_ascii=False)}\n\n"
        while True:
            try:
                msg = q.get(timeout=1)
                if msg[0] == "progress":
                    yield f"data: {json.dumps({'type': 'progress', 'current': msg[1], 'total': msg[2], 'message': msg[3]}, ensure_ascii=False)}\n\n"
                elif msg[0] == "done":
                    yield f"data: {json.dumps({'type': 'done', 'message': msg[1]}, ensure_ascii=False)}\n\n"
                    break
                elif msg[0] == "error":
                    yield f"data: {json.dumps({'type': 'error', 'message': msg[1]}, ensure_ascii=False)}\n\n"
                    break
            except queue.Empty:
                if not thread.is_alive():
                    break

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )

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
    exclude_language: Optional[str] = None,
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

    if exclude_language:
        from metadata_service import CACHE_PATH, _load_json_file
        cache = _load_json_file(CACHE_PATH)
        filtered = []
        for item in items:
            if item.author and item.description:
                cache_key = os.path.basename(item.path) if item.type != "series" else item.title
                cached = cache.get(cache_key)
                if cached and isinstance(cached, dict) and cached.get("language") == exclude_language:
                    continue
            filtered.append(item)
        items = filtered

    return [_enrich_item(item, db) for item in items]

@app.get("/items/continue-reading", response_model=List[ItemResponse])
def get_continue_reading_items(db: Session = Depends(get_db)):
    """Retorna livros avulsos e capítulos (filhos de séries) em andamento,
    ou seja, com progresso próprio entre 0% e 100% e já passados da 1ª página.
    Séries (contêineres) ficam de fora: o item a continuar é o filho em si."""
    rows = (
        db.query(Item)
        .join(Progress, Progress.item_id == Item.id)
        .filter(
            Item.type != "series",
            Item.is_read == False,
            Progress.progress_pct > 0,
            Progress.progress_pct < 100,
            Progress.current_page > 1,
        )
        .order_by(Item.last_read.desc())
        .all()
    )
    seen = set()
    unique_items = []
    for item in rows:
        if item.id in seen:
            continue
        seen.add(item.id)
        unique_items.append(item)
    return [_enrich_item(item, db) for item in unique_items]

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
        if payload.rating < 0 or payload.rating > 5:
            raise HTTPException(status_code=400, detail="Rating must be between 0 and 5")
        item.rating = payload.rating if payload.rating > 0 else None
        
    if payload.is_read is not None:
        _set_item_read_progress(db, item, payload.is_read)
        _sync_read_status_after_item_change(db, item)

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
    return _enrich_item(item, db)

class ItemReadPayload(BaseModel):
    is_read: bool

@app.patch("/items/{id}/read", response_model=ItemResponse)
def update_item_read_status(id: int, payload: ItemReadPayload, db: Session = Depends(get_db)):
    item = db.query(Item).filter(Item.id == id).first()
    if not item:
        raise HTTPException(status_code=404, detail="Item not found")
    _set_item_read_progress(db, item, payload.is_read)
    _sync_read_status_after_item_change(db, item)

    db.commit()
    db.refresh(item)
    return _enrich_item(item, db)

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
        # Crop to 3:4 aspect ratio and resize to exact dimensions
        target_w, target_h = 450, 600
        img_ratio = image.width / image.height
        target_ratio = target_w / target_h
        if img_ratio > target_ratio:
            new_w = int(image.height * target_ratio)
            left = (image.width - new_w) // 2
            image = image.crop((left, 0, left + new_w, image.height))
        else:
            new_h = int(image.width / target_ratio)
            top = (image.height - new_h) // 2
            image = image.crop((0, top, image.width, top + new_h))
        image = image.resize((target_w, target_h), Image.LANCZOS)
        
        cover_hash = hashlib.sha256(item.path.encode('utf-8')).hexdigest()
        cover_path = COVERS_DIR / f"{cover_hash}.png"
        image.save(cover_path, format="PNG")
        
        item.cover_path = str(cover_path)
        db.commit()
        db.refresh(item)
        return _enrich_item(item, db)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Invalid image format: {str(e)}")



@app.post("/items/{id}/restore-cover", response_model=ItemResponse)
def restore_original_book_cover(id: int, db: Session = Depends(get_db)):
    """Restores the original cover image for a library item."""
    item = db.query(Item).filter(Item.id == id).first()
    if not item:
        raise HTTPException(status_code=404, detail="Item not found")

    # Séries não têm arquivo próprio: usa o primeiro capítulo para extrair a capa original
    target_item = item
    if item.type == "series":
        first_child = db.query(Item).filter(
            Item.parent_id == item.id
        ).order_by(Item.path.asc()).first()
        if first_child:
            target_item = first_child
        else:
            raise HTTPException(status_code=400, detail="Esta série não possui capítulos.")

    # Try to extract if not present
    if not item.cover_original_path or not os.path.exists(item.cover_original_path):
        import hashlib
        from PIL import Image
        from metadata import get_epub_metadata, get_pdf_metadata
        
        cover_hash = hashlib.sha256(item.path.encode('utf-8')).hexdigest()
        cover_original_path = COVERS_DIR / f"{cover_hash}_original.png"
        
        suffix = Path(target_item.path).suffix.lower()
        cover_bytes = None
        if suffix == '.epub':
            _, _, cover_bytes = get_epub_metadata(target_item.path)
        elif suffix == '.pdf':
            _, _, _, cover_bytes = get_pdf_metadata(target_item.path)
            
        if cover_bytes:
            try:
                image = Image.open(io.BytesIO(cover_bytes))
                target_w, target_h = 450, 600
                img_ratio = image.width / image.height
                target_ratio = target_w / target_h
                if img_ratio > target_ratio:
                    new_w = int(image.height * target_ratio)
                    left = (image.width - new_w) // 2
                    image = image.crop((left, 0, left + new_w, image.height))
                else:
                    new_h = int(image.width / target_ratio)
                    top = (image.height - new_h) // 2
                    image = image.crop((0, top, image.width, top + new_h))
                image = image.resize((target_w, target_h), Image.LANCZOS)
                image.save(cover_original_path, format="PNG")
                item.cover_original_path = str(cover_original_path)
            except Exception as e:
                raise HTTPException(status_code=400, detail=f"Failed to process original cover: {str(e)}")
        else:
            raise HTTPException(status_code=400, detail="Original cover could not be extracted from this file.")

    item.cover_path = item.cover_original_path
    db.commit()
    db.refresh(item)
    return _enrich_item(item, db)


# Lock for incremental scanning
is_scanning_locked = False

class IncrementalScanResponse(BaseModel):
    status: str
    added: List[ItemResponse] = []
    removed: List[int] = []

@app.post("/scan/incremental", response_model=IncrementalScanResponse)
def scan_incremental_route(db: Session = Depends(get_db)):
    """Incremental library scanning. Compares disk state with database state."""
    global is_scanning_locked
    if is_scanning_locked:
        return IncrementalScanResponse(status="locked")
        
    last_path_setting = db.query(Setting).filter(Setting.key == "last_scanned_path").first()
    if not last_path_setting or not last_path_setting.value:
        return IncrementalScanResponse(status="no_folder")
        
    root_path = last_path_setting.value
    root = Path(root_path)
    if not root.exists() or not root.is_dir():
        return IncrementalScanResponse(status="error")

    is_scanning_locked = True
    try:
        db_items = db.query(Item).all()
        db_item_map = {item.path: item for item in db_items}
        
        disk_files = []
        for entry in sorted(root.iterdir()):
            if entry.is_file() and entry.suffix.lower() in SUPPORTED_EXTENSIONS:
                disk_files.append((str(entry), "book", None))
            elif entry.is_dir():
                child_files = []
                for path in sorted(entry.rglob('*')):
                    if path.is_file() and path.suffix.lower() in SUPPORTED_EXTENSIONS:
                        child_files.append(path)
                if child_files:
                    disk_files.append((str(entry), "series", None))
                    for child in child_files:
                        disk_files.append((str(child), "chapter", str(entry)))

        # Atualiza file_size dos itens que ainda existem no disco
        for path, _, _ in disk_files:
            if path in db_item_map:
                try:
                    db_item_map[path].file_size = os.path.getsize(path)
                except OSError:
                    pass
                        
        disk_paths = {df[0] for df in disk_files}
        db_paths = set(db_item_map.keys())
        
        added_paths = disk_paths - db_paths
        removed_paths = db_paths - disk_paths
        
        if not added_paths and not removed_paths:
            return IncrementalScanResponse(status="no_change")
            
        # Process removals
        removed_ids = []
        for path in removed_paths:
            item = db_item_map[path]
            removed_ids.append(item.id)
            if item.type == "series":
                # Archiva a série antes de remover (os filhos serão archivados por path)
                archive_item(db, item)
            else:
                archive_item(db, item)
            db.delete(item)
        db.flush()
        
        # Process additions
        added_items = []
        series_path_to_id = {}
        series_objects = {}
        
        # First pass: find existing or added series
        for path, type_str, parent_path in disk_files:
            if type_str == "series":
                if path in db_item_map:
                    series_path_to_id[path] = db_item_map[path].id
                    series_objects[path] = db_item_map[path]
                else:
                    new_series = Item(
                        title=Path(path).name,
                        metadata_title=Path(path).name,
                        filename_title=Path(path).name,
                        type="series",
                        path=path,
                        parent_id=None
                    )
                    db.add(new_series)
                    db.flush()
                    try_restore_item(db, new_series)
                    series_path_to_id[path] = new_series.id
                    series_objects[path] = new_series
                    added_items.append(new_series)
                    
        # Second pass: process books and chapters
        for path, type_str, parent_path in disk_files:
            if type_str == "series":
                continue
                
            if path in added_paths:
                import hashlib
                from metadata import process_file_metadata_and_cover
                
                filename_title = Path(path).stem
                cover_hash = hashlib.sha256(path.encode('utf-8')).hexdigest()
                cover_path = str(COVERS_DIR / f"{cover_hash}.png")
                
                parent_id = None
                if type_str == "chapter" and parent_path in series_path_to_id:
                    parent_id = series_path_to_id[parent_path]
                    
                display_title, metadata_title, author, total_pages, cover_orig = process_file_metadata_and_cover(path, 'filename')
                
                new_item = Item(
                    title=filename_title,
                    metadata_title=filename_title,
                    filename_title=filename_title,
                    type=type_str,
                    path=path,
                    file_size=os.path.getsize(path) if os.path.exists(path) else None,
                    cover_path=cover_orig or cover_path,
                    cover_original_path=cover_orig,
                    author=None,
                    description=None,
                    year=None,
                    publisher=None,
                    parent_id=parent_id
                )
                db.add(new_item)
                db.flush()
                try_restore_item(db, new_item)
                added_items.append(new_item)
                
        # Update series cover if needed
        for path, type_str, parent_path in disk_files:
            if type_str == "series" and path in series_objects:
                series = series_objects[path]
                if not series.cover_path or not os.path.exists(series.cover_path):
                    first_child = db.query(Item).filter(Item.parent_id == series.id).first()
                    if first_child:
                        series.cover_path = first_child.cover_path
                        
        # Cleanup empty series
        series_items = db.query(Item).filter(Item.type == "series").all()
        for series in series_items:
            children_count = db.query(Item).filter(Item.parent_id == series.id).count()
            if children_count == 0:
                db.delete(series)
                
        db.commit()
        
        enriched_added = [_enrich_item(item, db) for item in added_items]
        
        return IncrementalScanResponse(
            status="success",
            added=enriched_added,
            removed=removed_ids
        )
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Incremental scan failed: {str(e)}")
    finally:
        is_scanning_locked = False



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
            archive_item(db, child)
            db.query(Progress).filter(Progress.item_id == child.id).delete()
            db.delete(child)

    # Guarda metadados antes de remover para restauração futura
    archive_item(db, item)

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
        
    # Marcar como lido automaticamente quando o progresso atinge 100%
    if payload.progress_pct >= 100.0:
        item.is_read = True
    # Sem progresso (início/desmarcado): limpar CFI para que o EPUB reabra do início
    elif payload.progress_pct <= 0 and payload.current_page <= 0:
        progress_record.cfi = None
        item.is_read = False

    _sync_read_status_after_item_change(db, item)
            
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
def serve_media_file(path: str, request: Request):
    """Serves the actual book/chapter media file (EPUB/PDF) with HTTP Range request support."""
    if not os.path.exists(path):
        raise HTTPException(status_code=404, detail="File not found")
    if not os.path.isfile(path):
        raise HTTPException(status_code=400, detail="Path is not a file")

    suffix = Path(path).suffix.lower()
    if suffix not in SUPPORTED_EXTENSIONS:
        raise HTTPException(status_code=400, detail="Unsupported file format")

    media_type = "application/epub+zip" if suffix == ".epub" else "application/pdf"
    file_size = os.path.getsize(path)
    range_header = request.headers.get("range")

    if range_header:
        try:
            range_value = range_header.strip().replace("bytes=", "")
            start_str, end_str = range_value.split("-")
            start = int(start_str)
            end = int(end_str) if end_str else file_size - 1
        except Exception:
            raise HTTPException(status_code=416, detail="Invalid Range header")

        if start > end or end >= file_size:
            raise HTTPException(status_code=416, detail="Range Not Satisfiable")

        chunk_size = end - start + 1

        def iter_file():
            with open(path, "rb") as f:
                f.seek(start)
                remaining = chunk_size
                while remaining > 0:
                    data = f.read(min(65536, remaining))
                    if not data:
                        break
                    remaining -= len(data)
                    yield data

        return StreamingResponse(
            iter_file(),
            status_code=206,
            media_type=media_type,
            headers={
                "Content-Range": f"bytes {start}-{end}/{file_size}",
                "Accept-Ranges": "bytes",
                "Content-Length": str(chunk_size),
            },
        )

    return FileResponse(
        path,
        media_type=media_type,
        headers={
            "Accept-Ranges": "bytes",
            "Content-Length": str(file_size),
        },
    )


@app.get("/epub-resource")
def serve_epub_resource(epub: str, resource: str):
    """Serves a specific internal resource from an EPUB file (chapter, image, CSS, etc.)."""
    if not os.path.exists(epub):
        raise HTTPException(status_code=404, detail="EPUB file not found")
    if not epub.lower().endswith(".epub"):
        raise HTTPException(status_code=400, detail="Not an EPUB file")

    try:
        with zipfile.ZipFile(epub, "r") as zf:
            internal_path = resource.lstrip("/")
            try:
                data = zf.read(internal_path)
            except KeyError:
                raise HTTPException(status_code=404, detail=f"Resource not found in EPUB: {internal_path}")

        mime, _ = mimetypes.guess_type(internal_path)
        if not mime:
            ext = Path(internal_path).suffix.lower()
            mime = {
                ".html": "text/html",
                ".xhtml": "application/xhtml+xml",
                ".css": "text/css",
                ".js": "application/javascript",
                ".png": "image/png",
                ".jpg": "image/jpeg",
                ".jpeg": "image/jpeg",
                ".gif": "image/gif",
                ".svg": "image/svg+xml",
                ".ttf": "font/ttf",
                ".otf": "font/otf",
                ".woff": "font/woff",
                ".woff2": "font/woff2",
                ".ncx": "application/x-dtbncx+xml",
                ".opf": "application/oebps-package+xml",
                ".xml": "application/xml",
            }.get(ext, "application/octet-stream")

        return StreamingResponse(io.BytesIO(data), media_type=mime)
    except zipfile.BadZipFile:
        raise HTTPException(status_code=400, detail="Invalid EPUB/ZIP file")

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
    lang_setting = db.query(Setting).filter(Setting.key == "language").first()
    chapter_mode = db.query(Setting).filter(Setting.key == "chapter_view_mode").first()
    return {
        "use_filename_as_title": True,
        "last_scanned_path": last_scanned.value if last_scanned else None,
        "language": lang_setting.value if lang_setting else "en",
        "chapter_view_mode": chapter_mode.value if chapter_mode else "title"
    }

@app.put("/settings")
def update_global_settings(payload: SettingsUpdatePayload, db: Session = Depends(get_db)):
    """Saves key-value configuration flags."""
    if payload.language is not None:
        lang = db.query(Setting).filter(Setting.key == "language").first()
        if lang:
            lang.value = payload.language
        else:
            db.add(Setting(key="language", value=payload.language))
        db.commit()
    if payload.chapter_view_mode is not None:
        mode = db.query(Setting).filter(Setting.key == "chapter_view_mode").first()
        if mode:
            mode.value = payload.chapter_view_mode
        else:
            db.add(Setting(key="chapter_view_mode", value=payload.chapter_view_mode))
        db.commit()
    return get_global_settings(db)


# ─── Custom Lists ──────────────────────────────────────────────────────────────

@app.get("/lists", response_model=List[UserListResponse])
def get_all_lists(db: Session = Depends(get_db)):
    """Returns all custom reading lists with item counts."""
    lists = db.query(UserList).order_by(UserList.sort_order.asc(), UserList.name.asc()).all()
    result = []
    for lst in lists:
        count = db.query(list_items).filter(list_items.c.list_id == lst.id).count()
        resp = UserListResponse.model_validate(lst)
        resp.item_count = count
        result.append(resp)
    return result

@app.post("/lists", response_model=UserListResponse)
def create_list(payload: UserListCreate, db: Session = Depends(get_db)):
    """Creates a new custom reading list."""
    name = payload.name.strip()
    if not name:
        raise HTTPException(status_code=400, detail="List name cannot be empty.")
    max_order = db.query(db.query(UserList).order_by(UserList.sort_order.desc()).exists())
    lst = UserList(name=name)
    db.add(lst)
    db.commit()
    db.refresh(lst)
    resp = UserListResponse.model_validate(lst)
    resp.item_count = 0
    return resp

@app.put("/lists/{list_id}", response_model=UserListResponse)
def update_list(list_id: int, payload: UserListUpdate, db: Session = Depends(get_db)):
    """Updates a custom reading list (name, sort_order)."""
    lst = db.query(UserList).filter(UserList.id == list_id).first()
    if not lst:
        raise HTTPException(status_code=404, detail="List not found.")
    if payload.name is not None:
        name = payload.name.strip()
        if not name:
            raise HTTPException(status_code=400, detail="List name cannot be empty.")
        lst.name = name
    if payload.sort_order is not None:
        lst.sort_order = payload.sort_order
    db.commit()
    db.refresh(lst)
    count = db.query(list_items).filter(list_items.c.list_id == lst.id).count()
    resp = UserListResponse.model_validate(lst)
    resp.item_count = count
    return resp

@app.delete("/lists/{list_id}")
def delete_list(list_id: int, db: Session = Depends(get_db)):
    """Deletes a custom reading list. Items are not affected."""
    lst = db.query(UserList).filter(UserList.id == list_id).first()
    if not lst:
        raise HTTPException(status_code=404, detail="List not found.")
    if lst.is_default:
        raise HTTPException(status_code=400, detail="Cannot delete the default Favoritos list.")
    db.query(list_items).filter(list_items.c.list_id == list_id).delete()
    db.delete(lst)
    db.commit()
    return {"status": "deleted"}

@app.get("/lists/{list_id}/items", response_model=List[ItemResponse])
def get_list_items(list_id: int, db: Session = Depends(get_db)):
    """Returns all items in a custom reading list."""
    lst = db.query(UserList).filter(UserList.id == list_id).first()
    if not lst:
        raise HTTPException(status_code=404, detail="List not found.")
    items = db.query(Item).join(list_items).filter(list_items.c.list_id == list_id).all()
    return [_enrich_item(item, db) for item in items]

@app.post("/lists/{list_id}/items")
def add_items_to_list(list_id: int, payload: ListItemsPayload, db: Session = Depends(get_db)):
    """Adds one or more items to a custom reading list."""
    lst = db.query(UserList).filter(UserList.id == list_id).first()
    if not lst:
        raise HTTPException(status_code=404, detail="List not found.")
    for item_id in payload.item_ids:
        existing = db.query(list_items).filter(
            list_items.c.list_id == list_id,
            list_items.c.item_id == item_id
        ).first()
        if not existing:
            db.execute(list_items.insert().values(list_id=list_id, item_id=item_id))
    db.commit()
    return {"status": "added"}

@app.delete("/lists/{list_id}/items/{item_id}")
def remove_item_from_list(list_id: int, item_id: int, db: Session = Depends(get_db)):
    """Removes an item from a custom reading list."""
    lst = db.query(UserList).filter(UserList.id == list_id).first()
    if not lst:
        raise HTTPException(status_code=404, detail="List not found.")
    db.execute(list_items.delete().where(
        list_items.c.list_id == list_id,
        list_items.c.item_id == item_id
    ))
    db.commit()
    return {"status": "removed"}

@app.get("/items/{item_id}/lists", response_model=List[int])
def get_item_lists(item_id: int, db: Session = Depends(get_db)):
    """Returns the list IDs that a given item belongs to."""
    rows = db.query(list_items).filter(list_items.c.item_id == item_id).all()
    return [row.list_id for row in rows]


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

    lang_setting = db.query(Setting).filter(Setting.key == "language").first()
    language = lang_setting.value if lang_setting else "en"

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
            for atual, total, resultado in processar_lote_com_progresso(lote, language=language):
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


@app.post("/items/retranslate-descriptions")
def retranslate_descriptions(db: Session = Depends(get_db)):
    """
    Retraduz as sinopses de todos os itens no banco de dados para o idioma configurado.
    """
    lang_setting = db.query(Setting).filter(Setting.key == "language").first()
    language = lang_setting.value if lang_setting else "en"

    items = db.query(Item).filter(Item.description.isnot(None), Item.description != "").all()
    updated_count = 0

    from metadata_service import processar_arquivo_livro
    for item in items:
        # Se for uma série, o título já está limpo, usamos query_direta
        query_direta = item.title if item.type == "series" else None
        nome_arquivo = item.title if item.type == "series" else os.path.basename(item.path)

        try:
            res = processar_arquivo_livro(
                nome_arquivo=nome_arquivo,
                item_id=item.id,
                use_cache=False,  # Ignora o cache para forçar retradução
                query_direta=query_direta,
                language=language
            )
            if res and res.get("metadados") and res["metadados"].get("sinopse"):
                item.description = res["metadados"]["sinopse"]
                updated_count += 1
        except Exception as e:
            print(f"Erro ao retraduzir item {item.id}: {e}")

    db.commit()
    return {"updated": updated_count}


@app.get("/metadata/cached-keys")
def get_cached_metadata_keys():
    """
    Retorna todas as chaves (nomes de arquivo/títulos de série) que já
    possuem metadados em cache com status 'found'. O frontend usa esta
    lista para ocultar obras que já foram buscadas.
    """
    from metadata_service import CACHE_PATH, _load_json_file
    cache = _load_json_file(CACHE_PATH)
    keys = []
    for key, entry in cache.items():
        if isinstance(entry, dict) and entry.get("status") == "found":
            md = entry.get("metadados")
            if md and isinstance(md, dict) and md.get("nome_da_obra"):
                keys.append(key)
    return {"keys": keys}


# Run direct script
if __name__ == "__main__":
    import sys
    import uvicorn
    api_host = os.getenv("KRUMER_API_HOST", "127.0.0.1")

    if getattr(sys, 'frozen', False):
        uvicorn.run(app, host=api_host, port=8765, log_level="info")
    else:
        uvicorn.run("main:app", host=api_host, port=8765, reload=True)
