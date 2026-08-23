"""Motor offline-first de sincronização SQLite <-> Supabase.

O SQLite continua sendo a fonte primária. Este serviço roda fora do caminho das
requisições de UI, drena o outbox e aplica pulls remotos com merge idempotente.
"""
import asyncio
import datetime
import json
import os
from typing import Optional

import httpx
from sqlalchemy import or_, text
from sqlalchemy.exc import IntegrityError

from archive import item_fingerprint
from database import SessionLocal
from models import (
    Item,
    PendingSyncProgress,
    Progress,
    Setting,
    SyncOutbox,
    UserList,
    list_items,
)
from sync_outbox import enqueue_list, enqueue_membership, enqueue_metadata, enqueue_progress, enqueue_tag


DEFAULT_SUPABASE_URL = "https://bcwgtutmzdhkotiuymxl.supabase.co"
DEFAULT_PUBLISHABLE_KEY = "sb_publishable_YKD-5OwhrWIjlHFAKDH9jw_wL6nHkd_"
BACKOFF_SECONDS = (5, 30, 120, 600, 3600)


def _utcnow() -> datetime.datetime:
    return datetime.datetime.utcnow()


def _iso(value: datetime.datetime) -> str:
    return value.replace(tzinfo=datetime.timezone.utc).isoformat().replace("+00:00", "Z")


def _parse_remote(value: str) -> datetime.datetime:
    parsed = datetime.datetime.fromisoformat(value.replace("Z", "+00:00"))
    return parsed.astimezone(datetime.timezone.utc).replace(tzinfo=None)


def _setting(db, key: str) -> Optional[str]:
    row = db.get(Setting, key)
    return row.value if row else None


def _set_setting(db, key: str, value: Optional[str]) -> None:
    if value is None:
        row = db.get(Setting, key)
        if row:
            db.delete(row)
        return
    # Upsert atômico para evitar race entre dois PUT /sync/session simultâneos
    try:
        db.execute(
            text("INSERT INTO settings (key, value) VALUES (:key, :value) ON CONFLICT(key) DO UPDATE SET value=excluded.value"),
            {"key": key, "value": value},
        )
        # Mantém o identity map consistente
        db.flush()
        # Expire cached row se houver
        try:
            cached = db.get(Setting, key)
            if cached:
                db.refresh(cached)
        except Exception:
            pass
    except Exception:
        # Fallback ORM (caso a tabela ainda não exista ou outro erro)
        row = db.get(Setting, key)
        if row:
            row.value = value
        else:
            db.add(Setting(key=key, value=value))


class SyncHttpError(RuntimeError):
    def __init__(self, response: httpx.Response):
        try:
            body = response.json()
            detail = body.get("message") or body.get("error_description") or str(body)
        except Exception:
            detail = response.text[:300]
        super().__init__(f"Supabase HTTP {response.status_code}: {detail}")
        self.status_code = response.status_code

    @property
    def retryable(self) -> bool:
        return self.status_code in (408, 409, 425, 429) or self.status_code >= 500


class SyncService:
    def __init__(self):
        self.supabase_url = os.getenv("KRUMER_SUPABASE_URL", DEFAULT_SUPABASE_URL).rstrip("/")
        self.publishable_key = os.getenv(
            "KRUMER_SUPABASE_PUBLISHABLE_KEY", DEFAULT_PUBLISHABLE_KEY
        )
        self._credentials: Optional[dict] = None
        self._event = asyncio.Event()
        self._task: Optional[asyncio.Task] = None
        self._retry_task: Optional[asyncio.Task] = None
        self._cycle_lock = asyncio.Lock()
        self._status = {
            "state": "signed_out",
            "pending": 0,
            "last_sync_at": None,
            "last_error": None,
        }

    async def start(self) -> None:
        if not self._task:
            self._task = asyncio.create_task(self._run(), name="krumer-sync")

    async def stop(self) -> None:
        if self._retry_task:
            self._retry_task.cancel()
            self._retry_task = None
        if self._task:
            self._task.cancel()
            try:
                await self._task
            except asyncio.CancelledError:
                pass
            self._task = None

    def configure(self, access_token: str, user_id: str, expires_at: Optional[int]) -> None:
        self._credentials = {
            "access_token": access_token,
            "user_id": user_id,
            "expires_at": expires_at,
        }
        # Retry em caso de race no INSERT da settings (dois PUT /sync/session simultâneos)
        for attempt in range(2):
            try:
                with SessionLocal() as db:
                    _set_setting(db, "sync_active_user_id", user_id)
                    db.query(SyncOutbox).filter(SyncOutbox.owner_user_id.is_(None)).update(
                        {SyncOutbox.owner_user_id: user_id}, synchronize_session=False
                    )
                    db.query(SyncOutbox).filter(
                        SyncOutbox.owner_user_id == user_id,
                        SyncOutbox.status == "syncing",
                    ).update({SyncOutbox.status: "pending"}, synchronize_session=False)
                    db.commit()
                break
            except IntegrityError:
                try:
                    db.rollback()
                except Exception:
                    pass
                if attempt == 1:
                    raise
                continue
        self._status.update(state="pending", last_error=None)
        self.trigger()

    def clear_session(self) -> None:
        self._credentials = None
        if self._retry_task:
            self._retry_task.cancel()
            self._retry_task = None
        with SessionLocal() as db:
            _set_setting(db, "sync_active_user_id", None)
            db.commit()
        self._status.update(state="signed_out", last_error=None)

    def trigger(self) -> None:
        self._event.set()

    def status(self) -> dict:
        with SessionLocal() as db:
            user_id = self._credentials.get("user_id") if self._credentials else None
            query = db.query(SyncOutbox).filter(SyncOutbox.status.in_(("pending", "syncing")))
            if user_id:
                query = query.filter(SyncOutbox.owner_user_id == user_id)
            pending = query.count()
        return {**self._status, "pending": pending}

    async def sync_now(self) -> dict:
        if not self._credentials:
            return self.status()
        async with self._cycle_lock:
            self._status.update(state="syncing", last_error=None)
            try:
                await asyncio.to_thread(self._sync_once)
                self._status.update(
                    state="synced",
                    last_sync_at=_iso(_utcnow()),
                    last_error=None,
                )
            except Exception as error:
                self._status.update(state="error", last_error=str(error))
            self._schedule_retry()
            return self.status()

    def _schedule_retry(self) -> None:
        if self._retry_task:
            self._retry_task.cancel()
            self._retry_task = None
        credentials = self._credentials
        if not credentials:
            return
        with SessionLocal() as db:
            pending = (
                db.query(SyncOutbox)
                .filter(
                    SyncOutbox.owner_user_id == credentials["user_id"],
                    SyncOutbox.status == "pending",
                )
                .order_by(SyncOutbox.next_attempt_at.asc())
                .first()
            )
        if not pending:
            return
        delay = 0.25 if pending.next_attempt_at is None else max(
            0.25,
            (pending.next_attempt_at - _utcnow()).total_seconds(),
        )
        self._retry_task = asyncio.create_task(self._wake_after(delay))

    async def _wake_after(self, delay: float) -> None:
        try:
            await asyncio.sleep(delay)
            self.trigger()
        except asyncio.CancelledError:
            pass

    async def _run(self) -> None:
        while True:
            try:
                await asyncio.wait_for(self._event.wait(), timeout=30)
            except asyncio.TimeoutError:
                pass
            self._event.clear()
            if self._credentials:
                await self.sync_now()

    def _headers(self, prefer: Optional[str] = None) -> dict:
        credentials = self._credentials
        if not credentials:
            raise RuntimeError("Sessão de sincronização ausente.")
        headers = {
            "apikey": self.publishable_key,
            "Authorization": f"Bearer {credentials['access_token']}",
            "Content-Type": "application/json",
        }
        if prefer:
            headers["Prefer"] = prefer
        return headers

    def _checked(self, response: httpx.Response) -> httpx.Response:
        if response.status_code >= 400:
            raise SyncHttpError(response)
        return response

    def _sync_once(self) -> None:
        credentials = self._credentials
        if not credentials:
            return
        user_id = credentials["user_id"]
        with httpx.Client(timeout=httpx.Timeout(15.0, connect=5.0)) as client:
            self._ensure_initial_backfill(user_id)
            pushed = self._push(client, user_id)
            if pushed:
                with SessionLocal() as db:
                    cur = int(_setting(db, f"sync_metrics_push_count:{user_id}") or "0")
                    _set_setting(db, f"sync_metrics_push_count:{user_id}", str(cur + 1))
                    _set_setting(db, f"sync_metrics_last_push_at:{user_id}", _iso(_utcnow()))
                    db.commit()
            self._pull(client, user_id)
            self._prune(user_id)

    def _ensure_initial_backfill(self, user_id: str) -> None:
        key = f"sync_initial_done:{user_id}"
        with SessionLocal() as db:
            if _setting(db, key) == "true":
                return
            for item in db.query(Item).all():
                if item.progress or item.is_read or item.rating is not None:
                    enqueue_progress(db, item, rating_changed=item.rating is not None)
                # Fase 5: backfill de metadados editados e tags
                has_metadata = any([
                    item.title != (item.filename_title or item.title),
                    item.author, item.publisher, item.year, item.description,
                ])
                if has_metadata:
                    enqueue_metadata(db, item)
                for tag in item.tags:
                    enqueue_tag(db, item, tag.name, "upsert")
            for user_list in db.query(UserList).all():
                enqueue_list(db, user_list)
                for item in user_list.items:
                    enqueue_membership(db, user_list, item, "upsert")
            _set_setting(db, key, "true")
            db.commit()
        # Fase 5: segunda chave para backfill incremental de metadata/tags para usuários já inicializados
        key5 = f"sync_initial_done_fase5:{user_id}"
        with SessionLocal() as db:
            if _setting(db, key5) == "true":
                return
            # Só executa se a fase base já foi feita
            if _setting(db, key) != "true":
                return
            for item in db.query(Item).all():
                if not item.tags and not any([item.author, item.publisher, item.year, item.description]):
                    continue
                # Evita duplicar se já tem outbox pendente para metadata
                from models import SyncOutbox as _SB
                fp = item_fingerprint(item)
                existing = db.query(_SB).filter(_SB.fingerprint == fp, _SB.entity_type == "metadata", _SB.status == "pending").first()
                if not existing:
                    enqueue_metadata(db, item)
                for tag in item.tags:
                    enqueue_tag(db, item, tag.name, "upsert")
            _set_setting(db, key5, "true")
            db.commit()

    def _due_rows(self, db, user_id: str) -> list[SyncOutbox]:
        now = _utcnow()
        return (
            db.query(SyncOutbox)
            .filter(
                SyncOutbox.owner_user_id == user_id,
                SyncOutbox.status == "pending",
                or_(SyncOutbox.next_attempt_at.is_(None), SyncOutbox.next_attempt_at <= now),
            )
            .order_by(
                # Lists must exist remotely before memberships are applied.
                SyncOutbox.entity_type == "list_membership",
                SyncOutbox.entity_type == "tag",
                SyncOutbox.client_updated_at.asc(),
                SyncOutbox.id.asc(),
            )
            .limit(250)
            .all()
        )

    def _push(self, client: httpx.Client, user_id: str) -> int:
        total_pushed = 0
        while True:
            with SessionLocal() as db:
                rows = self._due_rows(db, user_id)
                if not rows:
                    return total_pushed
                row_ids = [row.id for row in rows]
                db.query(SyncOutbox).filter(SyncOutbox.id.in_(row_ids)).update(
                    {SyncOutbox.status: "syncing", SyncOutbox.updated_at: _utcnow()},
                    synchronize_session=False,
                )
                db.commit()

            for row_id in row_ids:
                with SessionLocal() as db:
                    row = db.get(SyncOutbox, row_id)
                    if not row or row.owner_user_id != user_id:
                        continue
                    try:
                        self._push_row(client, db, row, user_id)
                        row.status = "done"
                        row.last_error = None
                        row.next_attempt_at = None
                    except SyncHttpError as error:
                        row.retry_count += 1
                        row.last_error = str(error)
                        if error.status_code in (401, 403):
                            row.status = "pending"
                            row.next_attempt_at = _utcnow() + datetime.timedelta(seconds=30)
                            db.commit()
                            raise
                        if error.retryable:
                            row.status = "pending"
                            delay = BACKOFF_SECONDS[min(row.retry_count - 1, len(BACKOFF_SECONDS) - 1)]
                            row.next_attempt_at = _utcnow() + datetime.timedelta(seconds=delay)
                        else:
                            row.status = "error"
                    except (httpx.HTTPError, OSError) as error:
                        row.retry_count += 1
                        row.last_error = str(error)
                        row.status = "pending"
                        delay = BACKOFF_SECONDS[min(row.retry_count - 1, len(BACKOFF_SECONDS) - 1)]
                        row.next_attempt_at = _utcnow() + datetime.timedelta(seconds=delay)
                        db.commit()
                        raise
                    except Exception as error:
                        row.retry_count += 1
                        row.last_error = str(error)
                        row.status = "error"
                    finally:
                        if row.status == "done":
                            total_pushed += 1
                        row.updated_at = _utcnow()
                        db.commit()

    def _push_row(self, client, db, row: SyncOutbox, user_id: str) -> None:
        payload = row.payload or {}
        if row.entity_type == "progress":
            body = {
                "p_fingerprint": payload["fingerprint"],
                "p_title": payload.get("title") or payload["fingerprint"],
                "p_type": payload.get("type") or "book",
                "p_progress_pct": payload.get("progress_pct") or 0,
                "p_current_page": payload.get("current_page") or 0,
                "p_total_pages": payload.get("total_pages"),
                "p_cfi": payload.get("cfi"),
                "p_is_read": bool(payload.get("is_read")),
                "p_rating": payload.get("rating"),
                "p_rating_changed": bool(payload.get("rating_changed")),
            }
            self._checked(client.post(
                f"{self.supabase_url}/rest/v1/rpc/merge_reading_progress",
                headers=self._headers(),
                json=body,
            ))
            return

        if row.entity_type == "list":
            sync_id = payload.get("sync_id")
            if row.operation == "delete":
                self._checked(client.patch(
                    f"{self.supabase_url}/rest/v1/user_lists",
                    params={"id": f"eq.{sync_id}"},
                    headers=self._headers("return=minimal"),
                    json={"deleted_at": _iso(_utcnow())},
                ))
                return
            body = {
                "id": sync_id,
                "user_id": user_id,
                "name": payload["name"],
                "is_default": bool(payload.get("is_default")),
                "sort_order": int(payload.get("sort_order") or 0),
                "deleted_at": None,
            }
            response = client.post(
                f"{self.supabase_url}/rest/v1/user_lists",
                params={"on_conflict": "user_id,id"},
                headers=self._headers("resolution=merge-duplicates,return=representation"),
                json=body,
            )
            if response.status_code == 409:
                response = self._checked(client.get(
                    f"{self.supabase_url}/rest/v1/user_lists",
                    params={"name": f"eq.{payload['name']}", "select": "id"},
                    headers=self._headers(),
                ))
                rows = response.json()
                if not rows:
                    raise SyncHttpError(response)
                sync_id = rows[0]["id"]
                local = db.get(UserList, row.local_list_id) if row.local_list_id else None
                if local:
                    local.sync_id = sync_id
                payload["sync_id"] = sync_id
                row.payload = payload
                row.entity_key = sync_id
            else:
                self._checked(response)
            return

        if row.entity_type == "list_membership":
            user_list = db.get(UserList, row.local_list_id) if row.local_list_id else None
            list_id = user_list.sync_id if user_list else payload.get("list_sync_id")
            if not list_id:
                raise RuntimeError("Lista local sem sync_id.")
            body = {
                "user_id": user_id,
                "list_id": list_id,
                "fingerprint": payload["fingerprint"],
                "deleted_at": _iso(_utcnow()) if row.operation == "delete" else None,
            }
            self._checked(client.post(
                f"{self.supabase_url}/rest/v1/list_memberships",
                params={"on_conflict": "list_id,fingerprint"},
                headers=self._headers("resolution=merge-duplicates,return=minimal"),
                json=body,
            ))
            return

        if row.entity_type == "metadata":
            body = {
                "p_fingerprint": payload["fingerprint"],
                "p_title": payload.get("title"),
                "p_author": payload.get("author"),
                "p_publisher": payload.get("publisher"),
                "p_year": payload.get("year"),
                "p_description": payload.get("description"),
            }
            self._checked(client.post(
                f"{self.supabase_url}/rest/v1/rpc/merge_item_metadata",
                headers=self._headers(),
                json=body,
            ))
            return

        if row.entity_type == "tag":
            body = {
                "user_id": user_id,
                "fingerprint": payload["fingerprint"],
                "tag_name": payload["tag_name"],
                "deleted_at": _iso(_utcnow()) if row.operation == "delete" else None,
            }
            self._checked(client.post(
                f"{self.supabase_url}/rest/v1/item_tag_memberships",
                params={"on_conflict": "user_id,fingerprint,tag_name"},
                headers=self._headers("resolution=merge-duplicates,return=minimal"),
                json=body,
            ))

    def _fetch_changed(self, client, table: str, cursor: str, select: str) -> list[dict]:
        rows = []
        offset = 0
        while True:
            headers = self._headers()
            headers["Range"] = f"{offset}-{offset + 999}"
            response = self._checked(client.get(
                f"{self.supabase_url}/rest/v1/{table}",
                params={
                    "select": select,
                    "updated_at": f"gt.{cursor}",
                    "order": "updated_at.asc,id.asc",
                },
                headers=headers,
            ))
            page = response.json()
            rows.extend(page)
            if len(page) < 1000:
                return rows
            offset += len(page)

    def _fetch_active_memberships(self, client) -> list[dict]:
        rows = []
        offset = 0
        while True:
            headers = self._headers()
            headers["Range"] = f"{offset}-{offset + 999}"
            response = self._checked(client.get(
                f"{self.supabase_url}/rest/v1/list_memberships",
                params={
                    "select": "id,list_id,fingerprint,added_at,updated_at,deleted_at",
                    "deleted_at": "is.null",
                    "order": "id.asc",
                },
                headers=headers,
            ))
            page = response.json()
            rows.extend(page)
            if len(page) < 1000:
                return rows
            offset += len(page)

    def _pull(self, client: httpx.Client, user_id: str) -> None:
        with SessionLocal() as db:
            progress_cursor_key = f"sync_cursor:progress:{user_id}"
            lists_cursor_key = f"sync_cursor:lists:{user_id}"
            memberships_cursor_key = f"sync_cursor:memberships:{user_id}"
            metadata_cursor_key = f"sync_cursor:metadata:{user_id}"
            tags_cursor_key = f"sync_cursor:tags:{user_id}"
            epoch = "1970-01-01T00:00:00Z"
            progress_rows = self._fetch_changed(
                client,
                "reading_progress",
                _setting(db, progress_cursor_key) or epoch,
                "fingerprint,progress_pct,current_page,total_pages,cfi,is_read,rating,updated_at",
            )
            list_rows = self._fetch_changed(
                client,
                "user_lists",
                _setting(db, lists_cursor_key) or epoch,
                "id,name,is_default,sort_order,created_at,updated_at,deleted_at",
            )
            membership_rows = self._fetch_changed(
                client,
                "list_memberships",
                _setting(db, memberships_cursor_key) or epoch,
                "id,list_id,fingerprint,added_at,updated_at,deleted_at",
            )
            metadata_rows = self._fetch_changed(
                client,
                "item_metadata",
                _setting(db, metadata_cursor_key) or epoch,
                "fingerprint,title,author,publisher,year,description,updated_at",
            )
            tag_rows = self._fetch_changed(
                client,
                "item_tag_memberships",
                _setting(db, tags_cursor_key) or epoch,
                "fingerprint,tag_name,deleted_at,updated_at",
            )
            active_memberships = self._fetch_active_memberships(client)

            self._apply_pending_progress(db)
            self._apply_pending_metadata(db)
            self._apply_pending_tags(db)
            for remote in progress_rows:
                self._apply_remote_progress(db, remote)
            for remote in list_rows:
                self._apply_remote_list(db, remote)
            for remote in membership_rows:
                self._apply_remote_membership(db, remote)
            for remote in metadata_rows:
                self._apply_remote_metadata(db, remote)
            for remote in tag_rows:
                self._apply_remote_tag(db, remote)
            changed_ids = {remote["id"] for remote in membership_rows}
            for remote in active_memberships:
                if remote["id"] not in changed_ids:
                    self._apply_remote_membership(db, remote)

            if progress_rows:
                _set_setting(db, progress_cursor_key, progress_rows[-1]["updated_at"])
            if list_rows:
                _set_setting(db, lists_cursor_key, list_rows[-1]["updated_at"])
            if membership_rows:
                _set_setting(db, memberships_cursor_key, membership_rows[-1]["updated_at"])
            if metadata_rows:
                _set_setting(db, metadata_cursor_key, metadata_rows[-1]["updated_at"])
            if tag_rows:
                _set_setting(db, tags_cursor_key, tag_rows[-1]["updated_at"])
            # metrics pull counter
            _set_setting(db, f"sync_metrics_pull_count:{user_id}", str(int(_setting(db, f"sync_metrics_pull_count:{user_id}") or "0") + 1))
            _set_setting(db, f"sync_metrics_last_pull_at:{user_id}", _iso(_utcnow()))
            db.commit()
            self._record_metrics(user_id)

    def _items_by_fingerprint(self, db) -> dict[str, Item]:
        return {item_fingerprint(item): item for item in db.query(Item).all()}

    def _apply_pending_progress(self, db) -> None:
        items = self._items_by_fingerprint(db)
        for pending in db.query(PendingSyncProgress).all():
            if pending.fingerprint in items:
                self._apply_remote_progress(db, pending.payload, items)
                db.delete(pending)

    def _apply_remote_progress(self, db, remote: dict, items=None) -> None:
        items = items or self._items_by_fingerprint(db)
        item = items.get(remote["fingerprint"])
        remote_updated = _parse_remote(remote["updated_at"])
        if not item:
            pending = db.get(PendingSyncProgress, remote["fingerprint"])
            if pending:
                pending.payload = remote
                pending.remote_updated_at = remote_updated
            else:
                db.add(PendingSyncProgress(
                    fingerprint=remote["fingerprint"],
                    payload=remote,
                    remote_updated_at=remote_updated,
                ))
            return

        progress = (
            db.query(Progress)
            .filter(Progress.item_id == item.id)
            .order_by(Progress.updated_at.desc(), Progress.id.desc())
            .first()
        )
        if not progress:
            progress = Progress(item_id=item.id, file_path=item.path)
            db.add(progress)
        local_pct = float(progress.progress_pct or 0)
        remote_pct = float(remote.get("progress_pct") or 0)
        local_page = int(progress.current_page or 0)
        remote_page = int(remote.get("current_page") or 0)
        if remote_pct > local_pct or (remote_pct == local_pct and remote_page >= local_page):
            progress.progress_pct = remote_pct
            progress.current_page = remote_page
            progress.total_pages = remote.get("total_pages")
            progress.cfi = remote.get("cfi")
            progress.updated_at = remote_updated
        item.is_read = bool(remote.get("is_read"))
        item.rating = remote.get("rating")
        if remote_pct > 0:
            item.last_read = remote_updated

    def _apply_remote_list(self, db, remote: dict) -> None:
        user_list = db.query(UserList).filter(UserList.sync_id == remote["id"]).first()
        if not user_list:
            user_list = db.query(UserList).filter(UserList.name == remote["name"]).first()
        if remote.get("deleted_at"):
            if user_list:
                db.delete(user_list)
            return
        if not user_list:
            user_list = UserList(sync_id=remote["id"], name=remote["name"])
            db.add(user_list)
        user_list.sync_id = remote["id"]
        user_list.name = remote["name"]
        user_list.is_default = bool(remote.get("is_default"))
        user_list.sort_order = int(remote.get("sort_order") or 0)
        if remote.get("created_at"):
            user_list.created_at = _parse_remote(remote["created_at"])
        db.flush()

    def _apply_remote_membership(self, db, remote: dict) -> None:
        user_list = db.query(UserList).filter(UserList.sync_id == remote["list_id"]).first()
        item = self._items_by_fingerprint(db).get(remote["fingerprint"])
        if not user_list or not item:
            return
        existing = db.execute(
            list_items.select().where(
                list_items.c.list_id == user_list.id,
                list_items.c.item_id == item.id,
            )
        ).first()
        if remote.get("deleted_at"):
            if existing:
                db.execute(list_items.delete().where(
                    list_items.c.list_id == user_list.id,
                    list_items.c.item_id == item.id,
                ))
        elif not existing:
            db.execute(list_items.insert().values(
                list_id=user_list.id,
                item_id=item.id,
                added_at=_parse_remote(remote["added_at"]),
            ))

    def _apply_pending_metadata(self, db) -> None:
        from models import PendingSyncMetadata
        items = self._items_by_fingerprint(db)
        for pending in db.query(PendingSyncMetadata).all():
            if pending.fingerprint in items:
                self._apply_remote_metadata(db, pending.payload, items)
                db.delete(pending)

    def _apply_remote_metadata(self, db, remote: dict, items=None) -> None:
        from models import PendingSyncMetadata
        items = items or self._items_by_fingerprint(db)
        item = items.get(remote["fingerprint"])
        remote_updated = _parse_remote(remote["updated_at"])
        if not item:
            pending = db.get(PendingSyncMetadata, remote["fingerprint"])
            if pending:
                pending.payload = remote
                pending.remote_updated_at = remote_updated
            else:
                db.add(PendingSyncMetadata(
                    fingerprint=remote["fingerprint"],
                    payload=remote,
                    remote_updated_at=remote_updated,
                ))
            return
        # LWW whole-record: só aplica se remoto for mais novo que metadata_updated_at local
        if item.metadata_updated_at and remote_updated <= item.metadata_updated_at.replace(tzinfo=None) if item.metadata_updated_at.tzinfo else item.metadata_updated_at:
            # ainda atualiza se local nunca teve metadata_updated_at
            pass
        # Se o item já tem metadata mais recente localmente, preserva local (evita regressão)
        # Mas para simplicidade Fase 5, remoto vence se for mais novo que 1s
        local_ts = item.metadata_updated_at or datetime.datetime.min
        if local_ts.tzinfo is not None:
            local_ts = local_ts.replace(tzinfo=None)
        if remote_updated > local_ts:
            if remote.get("title") is not None:
                item.title = remote["title"]
            if remote.get("author") is not None:
                item.author = remote["author"]
            if remote.get("publisher") is not None:
                item.publisher = remote["publisher"]
            if remote.get("year") is not None:
                item.year = remote["year"]
            if remote.get("description") is not None:
                item.description = remote["description"]
            item.metadata_updated_at = remote_updated
            # increment conflict metric if local tinha dados diferentes
            with SessionLocal() as mdb:
                key = f"sync_metrics_conflicts:{self._credentials['user_id']}" if self._credentials else None
                if key:
                    cur = int(_setting(mdb, key) or "0")
                    _set_setting(mdb, key, str(cur + 1))
                    mdb.commit()

    def _apply_pending_tags(self, db) -> None:
        from models import PendingSyncTags
        items = self._items_by_fingerprint(db)
        for pending in db.query(PendingSyncTags).all():
            if pending.fingerprint in items:
                # pending.payload = {tags: [], tag_rows: []}
                for row in pending.payload.get("rows", []):
                    self._apply_remote_tag(db, row, items)
                db.delete(pending)

    def _apply_remote_tag(self, db, remote: dict, items=None) -> None:
        from models import Tag, PendingSyncTags
        items = items or self._items_by_fingerprint(db)
        item = items.get(remote["fingerprint"])
        remote_updated = _parse_remote(remote["updated_at"])
        if not item:
            pending = db.get(PendingSyncTags, remote["fingerprint"])
            rows = pending.payload.get("rows", []) if pending else []
            rows.append(remote)
            if pending:
                pending.payload = {"rows": rows}
                pending.remote_updated_at = remote_updated
            else:
                db.add(PendingSyncTags(
                    fingerprint=remote["fingerprint"],
                    payload={"rows": rows},
                    remote_updated_at=remote_updated,
                ))
            return
        tag_name = (remote.get("tag_name") or "").strip()
        if not tag_name:
            return
        if remote.get("deleted_at"):
            tag = db.query(Tag).filter(Tag.name == tag_name).first()
            if tag and tag in item.tags:
                item.tags.remove(tag)
        else:
            tag = db.query(Tag).filter(Tag.name == tag_name).first()
            if not tag:
                tag = Tag(name=tag_name)
                db.add(tag)
                db.flush()
            if tag not in item.tags:
                item.tags.append(tag)

    def _record_metrics(self, user_id: str) -> None:
        try:
            with SessionLocal() as db:
                pending = db.query(SyncOutbox).filter(SyncOutbox.owner_user_id == user_id, SyncOutbox.status == "pending").count()
                error = db.query(SyncOutbox).filter(SyncOutbox.owner_user_id == user_id, SyncOutbox.status == "error").count()
                from models import PendingSyncProgress, PendingSyncMetadata, PendingSyncTags
                pending_meta = db.query(PendingSyncProgress).count() + db.query(PendingSyncMetadata).count() + db.query(PendingSyncTags).count()
                _set_setting(db, f"sync_metrics_pending:{user_id}", str(pending))
                _set_setting(db, f"sync_metrics_error:{user_id}", str(error))
                _set_setting(db, f"sync_metrics_pending_orphans:{user_id}", str(pending_meta))
                db.commit()
        except Exception:
            pass

    def metrics(self) -> dict:
        user_id = self._credentials.get("user_id") if self._credentials else None
        if not user_id:
            return {"state": "signed_out", "pending": 0}
        try:
            with SessionLocal() as db:
                pending = db.query(SyncOutbox).filter(SyncOutbox.owner_user_id == user_id, SyncOutbox.status == "pending").count()
                syncing = db.query(SyncOutbox).filter(SyncOutbox.owner_user_id == user_id, SyncOutbox.status == "syncing").count()
                done = db.query(SyncOutbox).filter(SyncOutbox.owner_user_id == user_id, SyncOutbox.status == "done").count()
                error = db.query(SyncOutbox).filter(SyncOutbox.owner_user_id == user_id, SyncOutbox.status == "error").count()
                try:
                    from models import PendingSyncProgress, PendingSyncMetadata, PendingSyncTags
                    orphans = db.query(PendingSyncProgress).count() + db.query(PendingSyncMetadata).count() + db.query(PendingSyncTags).count()
                except Exception:
                    orphans = 0
                return {
                    "state": self._status.get("state"),
                    "pending": pending,
                    "syncing": syncing,
                    "done": done,
                    "error": error,
                    "orphans": orphans,
                    "last_sync_at": self._status.get("last_sync_at"),
                    "last_error": self._status.get("last_error"),
                    "pull_count": int(_setting(db, f"sync_metrics_pull_count:{user_id}") or "0"),
                    "push_count": int(_setting(db, f"sync_metrics_push_count:{user_id}") or "0"),
                    "conflicts": int(_setting(db, f"sync_metrics_conflicts:{user_id}") or "0"),
                    "last_pull_at": _setting(db, f"sync_metrics_last_pull_at:{user_id}"),
                    "last_push_at": _setting(db, f"sync_metrics_last_push_at:{user_id}"),
                }
        except Exception as e:
            return {"state": self._status.get("state", "error"), "pending": 0, "last_error": str(e)}

    def _prune(self, user_id: str) -> None:
        cutoff = _utcnow() - datetime.timedelta(days=7)
        with SessionLocal() as db:
            db.query(SyncOutbox).filter(
                SyncOutbox.owner_user_id == user_id,
                SyncOutbox.status == "done",
                SyncOutbox.updated_at < cutoff,
            ).delete(synchronize_session=False)
            db.commit()


sync_service = SyncService()
