import sys
import unittest
from pathlib import Path

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

sys.path.append(str(Path(__file__).parent))

import sync_outbox
from models import Base, Item, SyncOutbox, UserList


class CloudSyncFreezeTests(unittest.TestCase):
    def setUp(self):
        self.engine = create_engine("sqlite:///:memory:")
        Base.metadata.create_all(self.engine)
        self.Session = sessionmaker(bind=self.engine)
        self.previous_enabled = sync_outbox.CLOUD_SYNC_ENABLED
        sync_outbox.CLOUD_SYNC_ENABLED = False

    def tearDown(self):
        sync_outbox.CLOUD_SYNC_ENABLED = self.previous_enabled
        self.engine.dispose()

    def test_progress_enqueue_is_noop_during_beta(self):
        with self.Session() as db:
            item = Item(
                title="Example",
                filename_title="Example",
                type="book",
                path="C:/books/Example.pdf",
                file_size=123,
            )
            db.add(item)
            db.commit()

            self.assertIsNone(sync_outbox.enqueue_progress(db, item))
            db.commit()
            self.assertEqual(db.query(SyncOutbox).count(), 0)

    def test_list_and_metadata_enqueue_do_not_mutate_local_sync_fields(self):
        with self.Session() as db:
            item = Item(
                title="Example",
                filename_title="Example",
                type="book",
                path="C:/books/Example.pdf",
                file_size=123,
            )
            user_list = UserList(name="Favorites", is_default=True)
            db.add_all([item, user_list])
            db.commit()

            self.assertIsNone(sync_outbox.enqueue_metadata(db, item))
            self.assertIsNone(sync_outbox.enqueue_list(db, user_list))
            db.commit()
            self.assertIsNone(item.metadata_updated_at)
            self.assertIsNone(user_list.sync_id)
            self.assertEqual(db.query(SyncOutbox).count(), 0)


if __name__ == "__main__":
    unittest.main()
