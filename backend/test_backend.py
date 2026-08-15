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
from models import Item, Progress, Setting, Tag, ArchivedItem, ItemUpdate
import metadata
import scanner
import main
from scanner import scan_library_folder
from archive import archive_item, try_restore_item

def _make_test_image_bytes():
    from PIL import Image
    import io
    img = Image.new('RGB', (1, 1), color='red')
    buf = io.BytesIO()
    img.save(buf, format='PNG')
    return buf.getvalue()

_test_image_bytes = _make_test_image_bytes()

# Mock metadata extraction to avoid requiring real binary EPUB/PDF files during tests
def mock_get_epub_metadata(file_path):
    stem = Path(file_path).stem
    if "vol" in stem.lower() or "cap" in stem.lower():
        return f"{stem.capitalize()} Title Metadata", "Mock Author", _test_image_bytes
    else:
        return "EPUB Mock Title Metadata", "EPUB Mock Author", _test_image_bytes

def mock_get_pdf_metadata(file_path):
    stem = Path(file_path).stem
    return f"{stem.capitalize()} Title Metadata", "PDF Mock Author", 123, _test_image_bytes

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
            
    def test_scanner_with_filename_titles(self):
        """Test scanning where items use their filename stems as titles."""
        scan_library_folder(self.db, str(self.test_dir))
        
        # Verify single book uses filename
        book1 = self.db.query(Item).filter(Item.path == str(self.test_dir / "livro_avulso_1.epub")).first()
        self.assertIsNotNone(book1)
        self.assertEqual(book1.title, "livro_avulso_1")
        self.assertEqual(book1.filename_title, "livro_avulso_1")

    def test_rescan_preserves_existing_metadata(self):
        """Test that re-scanning does NOT overwrite or erase scraped metadata (author, synopsis, year, title)."""
        scan_library_folder(self.db, str(self.test_dir))
        
        book1 = self.db.query(Item).filter(Item.path == str(self.test_dir / "livro_avulso_1.epub")).first()
        self.assertIsNotNone(book1)
        
        # Simulate user scraping/editing metadata for book1
        book1.title = "O Conto da AIA"
        book1.author = "Margaret Atwood"
        book1.description = "Uma sinopse detalhada e completa da obra."
        book1.year = 1985
        self.db.commit()
        
        # Perform re-scan
        scan_library_folder(self.db, str(self.test_dir))
        
        # Verify all scraped metadata was 100% preserved after re-scan
        reloaded_book1 = self.db.query(Item).filter(Item.path == str(self.test_dir / "livro_avulso_1.epub")).first()
        self.assertEqual(reloaded_book1.title, "O Conto da AIA")
        self.assertEqual(reloaded_book1.author, "Margaret Atwood")
        self.assertEqual(reloaded_book1.description, "Uma sinopse detalhada e completa da obra.")
        self.assertEqual(reloaded_book1.year, 1985)
        
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

    def test_marking_series_read_updates_all_chapters(self):
        """Marking a parent item as read/unread cascades to all chapters."""
        scan_library_folder(self.db, str(self.test_dir))

        series = self.db.query(Item).filter(Item.type == "series").first()
        chapters = self.db.query(Item).filter(Item.parent_id == series.id).all()
        self.assertEqual(len(chapters), 2)

        main.update_item_read_status(series.id, main.ItemReadPayload(is_read=True), db=self.db)

        self.db.expire_all()
        series = self.db.query(Item).filter(Item.id == series.id).first()
        chapters = self.db.query(Item).filter(Item.parent_id == series.id).all()
        self.assertTrue(series.is_read)
        self.assertTrue(all(chapter.is_read for chapter in chapters))
        self.assertTrue(all(chapter.progress[0].progress_pct == 100.0 for chapter in chapters))

        main.update_item_read_status(series.id, main.ItemReadPayload(is_read=False), db=self.db)

        self.db.expire_all()
        series = self.db.query(Item).filter(Item.id == series.id).first()
        chapters = self.db.query(Item).filter(Item.parent_id == series.id).all()
        self.assertFalse(series.is_read)
        self.assertTrue(all(not chapter.is_read for chapter in chapters))
        self.assertTrue(all(chapter.progress[0].progress_pct == 0.0 for chapter in chapters))

    def test_marking_book_with_chapters_read_updates_children_and_progress(self):
        """A book item that contains chapters behaves like a parent collection."""
        book = Item(
            title="Livro com capítulos",
            type="book",
            path=str(self.test_dir / "Livro com capítulos"),
        )
        self.db.add(book)
        self.db.flush()
        chapters = [
            Item(title="Capítulo 1", type="chapter", path=str(self.test_dir / "cap1.epub"), parent_id=book.id),
            Item(title="Capítulo 2", type="chapter", path=str(self.test_dir / "cap2.epub"), parent_id=book.id),
        ]
        self.db.add_all(chapters)
        self.db.commit()

        updated = main.update_item_read_status(book.id, main.ItemReadPayload(is_read=True), db=self.db)

        self.db.expire_all()
        book = self.db.query(Item).filter(Item.id == book.id).first()
        chapters = self.db.query(Item).filter(Item.parent_id == book.id).all()
        self.assertTrue(book.is_read)
        self.assertEqual(updated.children_count, 2)
        self.assertEqual(updated.overall_progress, 100.0)
        self.assertTrue(all(chapter.is_read for chapter in chapters))
        self.assertTrue(all(chapter.progress[0].progress_pct == 100.0 for chapter in chapters))

    def test_metadata_update_read_status_also_updates_children(self):
        """The generic item update route must preserve read-state propagation."""
        book = Item(title="Livro", type="book", path=str(self.test_dir / "Livro"))
        self.db.add(book)
        self.db.flush()
        self.db.add_all([
            Item(title="Capítulo 1", type="chapter", path=str(self.test_dir / "cap1.pdf"), parent_id=book.id),
            Item(title="Capítulo 2", type="chapter", path=str(self.test_dir / "cap2.pdf"), parent_id=book.id),
        ])
        self.db.commit()

        updated = main.update_item_metadata(book.id, ItemUpdate(is_read=True), db=self.db)

        self.db.expire_all()
        chapters = self.db.query(Item).filter(Item.parent_id == book.id).all()
        self.assertTrue(updated.is_read)
        self.assertEqual(updated.overall_progress, 100.0)
        self.assertTrue(all(chapter.is_read for chapter in chapters))
        self.assertTrue(all(chapter.progress[0].progress_pct == 100.0 for chapter in chapters))

    def test_parent_is_marked_read_when_all_chapters_are_read(self):
        """The parent item follows chapter completion state."""
        scan_library_folder(self.db, str(self.test_dir))

        series = self.db.query(Item).filter(Item.type == "series").first()
        chapters = self.db.query(Item).filter(Item.parent_id == series.id).order_by(Item.title.asc()).all()

        main.update_item_read_status(chapters[0].id, main.ItemReadPayload(is_read=True), db=self.db)
        self.db.expire_all()
        series = self.db.query(Item).filter(Item.id == series.id).first()
        self.assertFalse(series.is_read)

        main.update_item_read_status(chapters[1].id, main.ItemReadPayload(is_read=True), db=self.db)
        self.db.expire_all()
        series = self.db.query(Item).filter(Item.id == series.id).first()
        self.assertTrue(series.is_read)

        main.update_item_read_status(chapters[0].id, main.ItemReadPayload(is_read=False), db=self.db)
        self.db.expire_all()
        series = self.db.query(Item).filter(Item.id == series.id).first()
        self.assertFalse(series.is_read)

    def test_finishing_last_chapter_progress_marks_parent_read(self):
        """Saving 100% progress for the last unread chapter marks the parent as read."""
        scan_library_folder(self.db, str(self.test_dir))

        series = self.db.query(Item).filter(Item.type == "series").first()
        chapters = self.db.query(Item).filter(Item.parent_id == series.id).order_by(Item.title.asc()).all()

        main.update_item_read_status(chapters[0].id, main.ItemReadPayload(is_read=True), db=self.db)
        main.save_reading_progress(chapters[1].id, main.ProgressUpdatePayload(
            file_path=chapters[1].path,
            progress_pct=100.0,
            current_page=10,
            total_pages=10,
        ), db=self.db)

        self.db.expire_all()
        series = self.db.query(Item).filter(Item.id == series.id).first()
        chapters = self.db.query(Item).filter(Item.parent_id == series.id).all()
        self.assertTrue(series.is_read)
        self.assertTrue(all(chapter.is_read for chapter in chapters))

    def test_move_out_and_back_restores_everything(self):
        """Item removed from disk and re-added keeps metadata, tags and progress."""
        scan_library_folder(self.db, str(self.test_dir))

        file_path = self.test_dir / "livro_avulso_1.epub"
        book = self.db.query(Item).filter(Item.path == str(file_path)).first()
        self.assertIsNotNone(book)

        # Editar metadados
        book.title = "O Conto da AIA"
        book.author = "Margaret Atwood"
        book.description = "Sinopse restaurada."
        book.year = 1985
        book.rating = 5
        book.tags = [self.db.query(Tag).filter(Tag.name == "ficcao").first() or Tag(name="ficcao")]
        self.db.add(Progress(
            item_id=book.id,
            file_path=book.path,
            progress_pct=45.5,
            current_page=50,
            total_pages=110,
        ))
        self.db.flush()
        self.db.commit()

        archived_count = self.db.query(ArchivedItem).count()
        self.assertEqual(archived_count, 0)

        # Simular a saída do arquivo da pasta
        backup_dir = self.test_dir / "backup_temp"
        backup_dir.mkdir(exist_ok=True)
        moved = shutil.move(str(file_path), str(backup_dir / file_path.name))
        self.assertTrue(os.path.exists(moved))

        scan_library_folder(self.db, str(self.test_dir))
        removed = self.db.query(Item).filter(Item.path == str(file_path)).first()
        self.assertIsNone(removed)
        archived_count = self.db.query(ArchivedItem).count()
        self.assertGreater(archived_count, 0)

        # Simular o retorno do arquivo à pasta
        shutil.move(moved, str(file_path))
        self.assertTrue(os.path.exists(file_path))

        scan_library_folder(self.db, str(self.test_dir))
        restored = self.db.query(Item).filter(Item.path == str(file_path)).first()
        self.assertIsNotNone(restored)
        self.assertEqual(restored.title, "O Conto da AIA")
        self.assertEqual(restored.author, "Margaret Atwood")
        self.assertEqual(restored.description, "Sinopse restaurada.")
        self.assertEqual(restored.year, 1985)
        self.assertEqual(restored.rating, 5)
        self.assertEqual([t.name for t in restored.tags], ["ficcao"])

        prog = self.db.query(Progress).filter(Progress.item_id == restored.id).first()
        self.assertIsNotNone(prog)
        self.assertEqual(prog.progress_pct, 45.5)
        self.assertEqual(prog.current_page, 50)

        # Snapshot consumido após restauração
        consumed = self.db.query(ArchivedItem).filter(
            ArchivedItem.fingerprint == f"file|livro_avulso_1|{book.file_size}"
        ).first()
        self.assertIsNone(consumed)


if __name__ == "__main__":
    unittest.main()
