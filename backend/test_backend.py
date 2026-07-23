import os
import shutil
import unittest
from pathlib import Path
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

# Setup path to import backend modules
import sys
sys.path.append(str(Path(__file__).parent))

import database
import models
from models import Item, Progress, Setting, Tag
import metadata
import scanner
from scanner import scan_library_folder

# Mock metadata extraction to avoid requiring real binary EPUB/PDF files during tests
def mock_get_epub_metadata(file_path):
    # Determine mock titles based on filename
    stem = Path(file_path).stem
    if "vol" in stem.lower() or "cap" in stem.lower():
        # Series chapter
        return f"{stem.capitalize()} Title Metadata", "Mock Author", b"mock_cover_bytes_epub"
    else:
        return "EPUB Mock Title Metadata", "EPUB Mock Author", b"mock_cover_bytes_epub"

def mock_get_pdf_metadata(file_path):
    stem = Path(file_path).stem
    return f"{stem.capitalize()} Title Metadata", "PDF Mock Author", 123, b"mock_cover_bytes_pdf"

# Apply monkeypatching
metadata.get_epub_metadata = mock_get_epub_metadata
metadata.get_pdf_metadata = mock_get_pdf_metadata


class TestLibrarianBackend(unittest.TestCase):
    def setUp(self):
        # 1. Create a temporary test library directory on disk
        self.test_dir = Path(__file__).parent / "test_library_root"
        self.test_dir.mkdir(exist_ok=True)
        
        # Create single books
        (self.test_dir / "livro_avulso_1.epub").write_text("dummy epub content")
        (self.test_dir / "livro_avulso_2.pdf").write_text("dummy pdf content")
        
        # Create a series folder
        self.series_dir = self.test_dir / "Serie_Incrível"
        self.series_dir.mkdir(exist_ok=True)
        (self.series_dir / "capitulo_01.epub").write_text("dummy chapter content")
        (self.series_dir / "capitulo_02.pdf").write_text("dummy chapter content")
        
        # Create an empty directory (should be ignored by scanner)
        self.empty_dir = self.test_dir / "Pasta_Vazia"
        self.empty_dir.mkdir(exist_ok=True)
        
        # 2. Setup an in-memory SQLite database for fast unit testing
        self.engine = create_engine("sqlite:///:memory:", connect_args={"check_same_thread": False})
        models.Base.metadata.create_all(bind=self.engine)
        self.SessionLocal = sessionmaker(bind=self.engine)
        self.db = self.SessionLocal()
        
    def tearDown(self):
        # Close DB session
        self.db.close()
        # Clean up temporary test files
        if self.test_dir.exists():
            shutil.rmtree(self.test_dir)
            
    def test_scanner_with_metadata_titles(self):
        """Test scanning where items use their metadata titles by default."""
        # Set preference to metadata (default)
        setting = Setting(key="use_filename_as_title", value="false")
        self.db.add(setting)
        self.db.commit()
        
        # Run scan
        scan_library_folder(self.db, str(self.test_dir))
        
        # Verify single book (should use metadata title)
        book1 = self.db.query(Item).filter(Item.path == str(self.test_dir / "livro_avulso_1.epub")).first()
        self.assertIsNotNone(book1)
        self.assertEqual(book1.title, "EPUB Mock Title Metadata")
        self.assertEqual(book1.type, "book")
        self.assertEqual(book1.author, "EPUB Mock Author")
        
        # Verify series parent was created
        series = self.db.query(Item).filter(Item.path == str(self.series_dir)).first()
        self.assertIsNotNone(series)
        self.assertEqual(series.title, "Serie_Incrível") # Folder name is title for series
        self.assertEqual(series.type, "series")
        
        # Verify series has child chapters
        chapters = self.db.query(Item).filter(Item.parent_id == series.id).all()
        self.assertEqual(len(chapters), 2)
        
        # Check children details
        chap1 = self.db.query(Item).filter(Item.path == str(self.series_dir / "capitulo_01.epub")).first()
        self.assertIsNotNone(chap1)
        self.assertEqual(chap1.title, "Capitulo_01 Title Metadata")
        self.assertEqual(chap1.type, "chapter")
        
        # Check empty directory was indeed ignored
        empty_folder = self.db.query(Item).filter(Item.path == str(self.empty_dir)).first()
        self.assertNullItem(empty_folder)
        
    def assertNullItem(self, item):
        self.assertIsNone(item)

    def test_scanner_with_filename_titles(self):
        """Test scanning where items use their filename stems as titles."""
        # Set preference to filename titles
        setting = Setting(key="use_filename_as_title", value="true")
        self.db.add(setting)
        self.db.commit()
        
        # Run scan
        scan_library_folder(self.db, str(self.test_dir))
        
        # Verify single book uses filename
        book1 = self.db.query(Item).filter(Item.path == str(self.test_dir / "livro_avulso_1.epub")).first()
        self.assertIsNotNone(book1)
        self.assertEqual(book1.title, "livro_avulso_1")
        self.assertEqual(book1.filename_title, "livro_avulso_1")
        self.assertEqual(book1.metadata_title, "EPUB Mock Title Metadata") # Metadata title is still stored
        
    def test_cleanup_stale_files(self):
        """Test that files deleted on disk are cleaned up from DB on re-scan."""
        # Initial scan
        scan_library_folder(self.db, str(self.test_dir))
        
        # Verify item exists
        file_path = self.test_dir / "livro_avulso_1.epub"
        book1 = self.db.query(Item).filter(Item.path == str(file_path)).first()
        self.assertIsNotNone(book1)
        
        # Delete file from disk
        os.remove(file_path)
        
        # Re-scan
        scan_library_folder(self.db, str(self.test_dir))
        
        # Verify item was cleaned up from DB
        book1_deleted = self.db.query(Item).filter(Item.path == str(file_path)).first()
        self.assertIsNone(book1_deleted)
        
    def test_progress_tracking(self):
        """Test updating progress and cascade behavior."""
        scan_library_folder(self.db, str(self.test_dir))
        
        # Get book
        book = self.db.query(Item).filter(Item.type == "book").first()
        
        # Add progress
        progress = Progress(
            item_id=book.id,
            file_path=book.path,
            progress_pct=45.5,
            current_page=50,
            total_pages=110
        )
        self.db.add(progress)
        self.db.commit()
        
        # Verify progress was saved
        saved_prog = self.db.query(Progress).filter(Progress.item_id == book.id).first()
        self.assertIsNotNone(saved_prog)
        self.assertEqual(saved_prog.progress_pct, 45.5)
        
        # Check cascade delete: deleting item should delete its progress
        self.db.delete(book)
        self.db.commit()
        
        deleted_prog = self.db.query(Progress).filter(Progress.item_id == book.id).first()
        self.assertIsNone(deleted_prog)


if __name__ == "__main__":
    unittest.main()
