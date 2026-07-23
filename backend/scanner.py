import os
import hashlib
from pathlib import Path
from sqlalchemy.orm import Session
from models import Item, Progress, Tag, Setting
from metadata import process_file_metadata_and_cover
from database import COVERS_DIR

SUPPORTED_EXTENSIONS = {'.epub', '.pdf'}

def get_setting(db: Session, key: str, default: str) -> str:
    """Retrieves a setting value by key, defaulting if not found."""
    setting = db.query(Setting).filter(Setting.key == key).first()
    return setting.value if setting else default

def scan_library_folder(db: Session, root_path: str):
    """
    Scans the given root path:
    - Root-level PDF/EPUB -> 'book'
    - Root-level folder containing PDF/EPUB -> 'series', and nested files -> 'chapter'
    - Saves metadata & covers.
    - Synchronizes changes and deletes orphaned entries from DB.
    """
    root = Path(root_path)
    if not root.exists() or not root.is_dir():
        raise ValueError(f"Path {root_path} is not a valid directory")
        
    # Get user setting for display titles ('metadata' or 'filename')
    title_setting = get_setting(db, "use_filename_as_title", "false")
    display_title_setting = 'filename' if title_setting == 'true' else 'metadata'
    
    # 1. Walk directory and insert/update items
    for entry in sorted(root.iterdir()):
        if entry.is_file() and entry.suffix.lower() in SUPPORTED_EXTENSIONS:
            # Single book
            display_title, metadata_title, author, total_pages = process_file_metadata_and_cover(
                str(entry), display_title_setting
            )
            
            cover_hash = hashlib.sha256(str(entry).encode('utf-8')).hexdigest()
            cover_path = str(COVERS_DIR / f"{cover_hash}.png")
            
            db_item = db.query(Item).filter(Item.path == str(entry)).first()
            if db_item:
                db_item.title = display_title
                db_item.metadata_title = metadata_title
                db_item.filename_title = entry.stem
                db_item.author = author
                db_item.cover_path = cover_path
                db_item.parent_id = None
            else:
                new_item = Item(
                    title=display_title,
                    metadata_title=metadata_title,
                    filename_title=entry.stem,
                    type="book",
                    path=str(entry),
                    cover_path=cover_path,
                    author=author,
                    parent_id=None
                )
                db.add(new_item)
                
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
                    db_series.title = entry.name
                    db_series.parent_id = None
                
                # Upsert all child chapters
                first_child_cover = None
                first_child_author = None
                
                for idx, child in enumerate(child_files):
                    display_title, metadata_title, author, total_pages = process_file_metadata_and_cover(
                        str(child), display_title_setting
                    )
                    
                    cover_hash = hashlib.sha256(str(child).encode('utf-8')).hexdigest()
                    cover_path = str(COVERS_DIR / f"{cover_hash}.png")
                    
                    if idx == 0:
                        first_child_cover = cover_path
                        first_child_author = author
                        
                    db_child = db.query(Item).filter(Item.path == str(child)).first()
                    if db_child:
                        db_child.title = display_title
                        db_child.metadata_title = metadata_title
                        db_child.filename_title = child.stem
                        db_child.author = author
                        db_child.cover_path = cover_path
                        db_child.parent_id = db_series.id
                    else:
                        new_child = Item(
                            title=display_title,
                            metadata_title=metadata_title,
                            filename_title=child.stem,
                            type="chapter",
                            path=str(child),
                            cover_path=cover_path,
                            author=author,
                            parent_id=db_series.id
                        )
                        db.add(new_child)
                        
                # Update series cover and author based on first chapter
                db_series.cover_path = first_child_cover
                if not db_series.author:
                    db_series.author = first_child_author
                    
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
            
    db.commit()
