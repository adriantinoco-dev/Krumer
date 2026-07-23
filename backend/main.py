import os
import datetime
from pathlib import Path
from typing import List, Optional
from contextlib import asynccontextmanager

from fastapi import FastAPI, Depends, HTTPException, Query
from fastapi.responses import FileResponse
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session
from pydantic import BaseModel

from database import Base, engine, get_db
from models import (
    Item, Progress, Tag, Setting,
    ItemResponse, ItemUpdate, ProgressResponse,
    ProgressCreate, TagResponse
)
from scanner import scan_library_folder, SUPPORTED_EXTENSIONS, get_setting
from metadata import process_file_metadata_and_cover

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
    use_filename_as_title: Optional[bool] = None

class SettingsUpdatePayload(BaseModel):
    use_filename_as_title: Optional[bool] = None

class ProgressUpdatePayload(BaseModel):
    file_path: str
    progress_pct: float
    current_page: int
    total_pages: Optional[int] = None
    cfi: Optional[str] = None


# --- Helper Functions ---

def _enrich_item(item: Item, db: Session) -> ItemResponse:
    res = ItemResponse.model_validate(item)
    if item.type == "series":
        children = db.query(Item).filter(Item.parent_id == item.id).all()
        res.children_count = len(children)
        if len(children) > 0:
            child_ids = [c.id for c in children]
            progs = db.query(Progress).filter(Progress.item_id.in_(child_ids)).all()
            prog_map = {p.item_id: p.progress_pct for p in progs}
            total_pct = sum(prog_map.get(cid, 0.0) for cid in child_ids)
            res.overall_progress = round(total_pct / len(children), 1)
        else:
            res.overall_progress = 0.0
    else:
        res.children_count = 0
        if item.progress:
            res.overall_progress = item.progress[0].progress_pct
        else:
            res.overall_progress = 0.0
    return res


# --- API Routes ---

@app.post("/scan")
def scan_directory_route(payload: ScanPayload, db: Session = Depends(get_db)):
    """Scans a directory on the host computer, indexing files and generating covers."""
    if payload.use_filename_as_title is not None:
        val_str = "true" if payload.use_filename_as_title else "false"
        setting = db.query(Setting).filter(Setting.key == "use_filename_as_title").first()
        if setting:
            setting.value = val_str
        else:
            setting = Setting(key="use_filename_as_title", value=val_str)
            db.add(setting)
        db.commit()
        
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
    """Allows manual editing of item details, ratings, and tags."""
    item = db.query(Item).filter(Item.id == id).first()
    if not item:
        raise HTTPException(status_code=404, detail="Item not found")
        
    if payload.title is not None:
        item.title = payload.title
    if payload.author is not None:
        item.author = payload.author
    if payload.publisher is not None:
        item.publisher = payload.publisher
    if payload.year is not None:
        item.year = payload.year
    if payload.description is not None:
        item.description = payload.description
        
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
            title_setting = get_setting(db, "use_filename_as_title", "false")
            display_title_setting = 'filename' if title_setting == 'true' else 'metadata'
            process_file_metadata_and_cover(item.path, display_title_setting)
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

@app.get("/settings")
def get_global_settings(db: Session = Depends(get_db)):
    """Fetches key-value configuration flags."""
    use_filename = db.query(Setting).filter(Setting.key == "use_filename_as_title").first()
    last_scanned = db.query(Setting).filter(Setting.key == "last_scanned_path").first()
    return {
        "use_filename_as_title": (use_filename.value == "true") if use_filename else False,
        "last_scanned_path": last_scanned.value if last_scanned else None
    }

@app.put("/settings")
def update_global_settings(payload: SettingsUpdatePayload, db: Session = Depends(get_db)):
    """Saves key-value configuration flags."""
    if payload.use_filename_as_title is not None:
        val_str = "true" if payload.use_filename_as_title else "false"
        setting = db.query(Setting).filter(Setting.key == "use_filename_as_title").first()
        if setting:
            setting.value = val_str
        else:
            setting = Setting(key="use_filename_as_title", value=val_str)
            db.add(setting)
        db.commit()
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



# Run direct script
if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="127.0.0.1", port=8765, reload=True)
