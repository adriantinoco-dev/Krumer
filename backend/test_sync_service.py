import sys
import unittest
from pathlib import Path

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

sys.path.append(str(Path(__file__).parent))

import sync_service as sync_module
from models import Base, Item, PendingSyncProgress, Progress, Setting, SyncOutbox


class SyncServiceLocalMergeTests(unittest.TestCase):
    def setUp(self):
        self.engine = create_engine("sqlite:///:memory:")
        Base.metadata.create_all(self.engine)
        self.Session = sessionmaker(bind=self.engine)
        self.original_session_local = sync_module.SessionLocal
        sync_module.SessionLocal = self.Session
        self.service = sync_module.SyncService()

    def tearDown(self):
        sync_module.SessionLocal = self.original_session_local
        self.engine.dispose()

    def test_remote_progress_waits_for_file_then_applies(self):
        remote = {
            "fingerprint": "file|Example|123",
            "progress_pct": 72.5,
            "current_page": 73,
            "total_pages": 100,
            "cfi": None,
            "is_read": False,
            "rating": 4,
            "updated_at": "2026-08-22T15:00:00Z",
        }
        with self.Session() as db:
            self.service._apply_remote_progress(db, remote)
            db.commit()
            self.assertIsNotNone(db.get(PendingSyncProgress, remote["fingerprint"]))

            db.add(Item(
                title="Example",
                filename_title="Example",
                type="book",
                path="C:/books/Example.pdf",
                file_size=123,
            ))
            db.commit()
            self.service._apply_pending_progress(db)
            db.commit()

            item = db.query(Item).one()
            progress = db.query(Progress).filter(Progress.item_id == item.id).one()
            self.assertEqual(progress.progress_pct, 72.5)
            self.assertEqual(progress.current_page, 73)
            self.assertEqual(item.rating, 4)
            self.assertIsNone(db.get(PendingSyncProgress, remote["fingerprint"]))

    def test_configure_adopts_signed_out_outbox_without_exposing_refresh_token(self):
        with self.Session() as db:
            db.add(SyncOutbox(
                entity_type="progress",
                entity_key="file|Example|123",
                operation="upsert",
                payload={},
                status="pending",
            ))
            db.commit()

        self.service.configure("access-token-only", "user-a", 123456)

        with self.Session() as db:
            row = db.query(SyncOutbox).one()
            self.assertEqual(row.owner_user_id, "user-a")
            self.assertEqual(db.get(Setting, "sync_active_user_id").value, "user-a")
            self.assertNotIn("refresh", self.service._credentials)


if __name__ == "__main__":
    unittest.main()
