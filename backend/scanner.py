import os
import hashlib
from pathlib import Path
from sqlalchemy.orm import Session
from models import Item, Progress, Tag, Setting
from metadata import process_file_metadata_and_cover
from database import COVERS_DIR

SUPPORTED_EXTENSIONS = {'.epub', '.pdf'}


def count_files_in_path(root_path: str) -> int:
    """Conta quantos arquivos suportados existem no diretório (incluindo subpastas)."""
    root = Path(root_path)
    total = 0
    for entry in sorted(root.iterdir()):
        if entry.is_file() and entry.suffix.lower() in SUPPORTED_EXTENSIONS:
            total += 1
        elif entry.is_dir():
            for path in sorted(entry.rglob('*')):
                if path.is_file() and path.suffix.lower() in SUPPORTED_EXTENSIONS:
                    total += 1
    return total


def scan_library_folder(db: Session, root_path: str, progress_callback=None):
    """
    Scans the given root path:
    - Root-level PDF/EPUB -> 'book'
    - Root-level folder containing PDF/EPUB -> 'series', and nested files -> 'chapter'
    - Saves metadata & covers.
    - Synchronizes changes and deletes orphaned entries from DB.
    
    `progress_callback` é opcional: `callback(current, total, message)`
    """
    root = Path(root_path)
    if not root.exists() or not root.is_dir():
        raise ValueError(f"Path {root_path} is not a valid directory")

    # Primeira passada: conta total de arquivos para progresso
    total = count_files_in_path(root_path)
    current = 0

    def _report(msg):
        nonlocal current
        current += 1
        if progress_callback:
            progress_callback(min(current, total), total, msg)

    # 1. Walk directory and insert/update items
    for entry in sorted(root.iterdir()):
        if entry.is_file() and entry.suffix.lower() in SUPPORTED_EXTENSIONS:
            # Single book
            filename_title = entry.stem
            cover_hash = hashlib.sha256(str(entry).encode('utf-8')).hexdigest()
            cover_path = str(COVERS_DIR / f"{cover_hash}.png")
            
            db_item = db.query(Item).filter(Item.path == str(entry)).first()
            if db_item:
                # Existing item: Preserve all scraped/edited metadata (title, author, description, year, publisher, cover)
                db_item.filename_title = filename_title
                db_item.parent_id = None
                if not db_item.cover_path or not os.path.exists(db_item.cover_path):
                    process_file_metadata_and_cover(str(entry), 'filename')
                    db_item.cover_path = cover_path
            else:
                # New item found: Extract cover, use filename strictly as display title
                process_file_metadata_and_cover(str(entry), 'filename')
                new_item = Item(
                    title=filename_title,
                    metadata_title=filename_title,
                    filename_title=filename_title,
                    type="book",
                    path=str(entry),
                    cover_path=cover_path,
                    author=None,
                    description=None,
                    year=None,
                    publisher=None,
                    parent_id=None
                )
                db.add(new_item)
            _report(str(entry.name))
                
        elif entry.is_dir():
            # Series candidate
            # Find all nested supported files
            child_files = []
            for path in sorted(entry.rglob('*')):
                if path.is_file() and path.suffix.lower() in SUPPORTED_EXTENSIONS:
                    child_files.append(path)
                    
            if child_files:
                # Upsert series parent item
                db_series = db.query(Item).filter(Item.path == str(entry)).first()
                if not db_series:
                    db_series = Item(
                        title=entry.name,
                        metadata_title=entry.name,
                        filename_title=entry.name,
                        type="series",
                        path=str(entry),
                        parent_id=None
                    )
                    db.add(db_series)
                    db.flush()  # Retrieve series ID
                else:
                    db_series.filename_title = entry.name
                    db_series.parent_id = None
                
                # Upsert all child chapters
                first_child_cover = None
                
                for idx, child in enumerate(child_files):
                    child_filename = child.stem
                    cover_hash = hashlib.sha256(str(child).encode('utf-8')).hexdigest()
                    cover_path = str(COVERS_DIR / f"{cover_hash}.png")
                    
                    if idx == 0:
                        first_child_cover = cover_path
                        
                    db_child = db.query(Item).filter(Item.path == str(child)).first()
                    if db_child:
                        # Existing chapter: Preserve all existing metadata
                        db_child.filename_title = child_filename
                        db_child.parent_id = db_series.id
                        if not db_child.cover_path or not os.path.exists(db_child.cover_path):
                            process_file_metadata_and_cover(str(child), 'filename')
                            db_child.cover_path = cover_path
                    else:
                        # New chapter: use filename strictly as display title
                        process_file_metadata_and_cover(str(child), 'filename')
                        new_child = Item(
                            title=child_filename,
                            metadata_title=child_filename,
                            filename_title=child_filename,
                            type="chapter",
                            path=str(child),
                            cover_path=cover_path,
                            author=None,
                            description=None,
                            year=None,
                            publisher=None,
                            parent_id=db_series.id
                        )
                        db.add(new_child)
                        _report(str(child.name))
                        
                # Update series cover if missing
                if not db_series.cover_path or not os.path.exists(db_series.cover_path):
                    db_series.cover_path = first_child_cover
                    
    db.flush()

    # 2. Cleanup: Remove stale items not present on disk
    all_items = db.query(Item).all()
    for item in all_items:
        if not os.path.exists(item.path):
            db.delete(item)
            
    db.flush()
    
    # 3. Cleanup empty series: delete series if they contain zero child items
    series_items = db.query(Item).filter(Item.type == "series").all()
    for series in series_items:
        children_count = db.query(Item).filter(Item.parent_id == series.id).count()
        if children_count == 0:
            db.delete(series)

    # 4. Persist the last scanned path for the Rescan button
    last_path_setting = db.query(Setting).filter(Setting.key == "last_scanned_path").first()
    if last_path_setting:
        last_path_setting.value = root_path
    else:
        db.add(Setting(key="last_scanned_path", value=root_path))
            
    db.commit()
