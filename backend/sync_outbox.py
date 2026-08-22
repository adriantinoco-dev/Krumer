"""Outbox local da sincronização offline-first.

Este módulo não faz rede. Ele apenas registra, na mesma transação SQLite do
write original, o último estado que deverá ser enviado ao Supabase nas fases
seguintes da sincronização.
"""
import datetime
import uuid
from typing import Iterable, Optional

from sqlalchemy.orm import Session

from archive import item_fingerprint
from models import Item, Progress, Setting, SyncOutbox, UserList


def _utcnow() -> datetime.datetime:
    return datetime.datetime.utcnow()


def _iso(value: Optional[datetime.datetime]) -> Optional[str]:
    if value is None:
        return None
    return value.isoformat(timespec="milliseconds") + "Z"


def enqueue(
    db: Session,
    *,
    entity_type: str,
    entity_key: str,
    operation: str,
    payload: dict,
    fingerprint: Optional[str] = None,
    local_list_id: Optional[int] = None,
) -> SyncOutbox:
    """Enfileira um write, coalescendo o estado pending da mesma entidade."""
    now = _utcnow()
    active_user = db.get(Setting, "sync_active_user_id")
    owner_user_id = active_user.value if active_user and active_user.value else None
    owner_filter = (
        SyncOutbox.owner_user_id == owner_user_id
        if owner_user_id
        else SyncOutbox.owner_user_id.is_(None)
    )
    existing = (
        db.query(SyncOutbox)
        .filter(
            SyncOutbox.entity_type == entity_type,
            SyncOutbox.entity_key == entity_key,
            SyncOutbox.status == "pending",
            owner_filter,
        )
        .order_by(SyncOutbox.id.desc())
        .first()
    )

    if existing:
        if (
            entity_type == "progress"
            and (existing.payload or {}).get("rating_changed")
            and not payload.get("rating_changed")
        ):
            payload = {**payload, "rating_changed": True}
        existing.operation = operation
        existing.payload = payload
        existing.fingerprint = fingerprint
        existing.local_list_id = local_list_id
        existing.client_updated_at = now
        existing.updated_at = now
        existing.retry_count = 0
        existing.next_attempt_at = None
        existing.last_error = None
        row = existing
    else:
        row = SyncOutbox(
            owner_user_id=owner_user_id,
            entity_type=entity_type,
            entity_key=entity_key,
            operation=operation,
            payload=payload,
            fingerprint=fingerprint,
            local_list_id=local_list_id,
            client_updated_at=now,
            status="pending",
            retry_count=0,
            next_attempt_at=None,
            created_at=now,
            updated_at=now,
        )
        db.add(row)

    db.flush()
    return row


def _progress_payload(db: Session, item: Item, rating_changed: bool = False) -> tuple[str, dict]:
    progress = (
        db.query(Progress)
        .filter(Progress.item_id == item.id)
        .order_by(Progress.updated_at.desc(), Progress.id.desc())
        .first()
    )
    fingerprint = item_fingerprint(item)
    progress_pct = float(progress.progress_pct or 0.0) if progress else 0.0
    payload = {
        "fingerprint": fingerprint,
        "title": item.title,
        "type": item.type,
        "progress_pct": max(0.0, min(100.0, progress_pct)),
        "current_page": int(progress.current_page or 0) if progress else 0,
        "total_pages": progress.total_pages if progress else None,
        "cfi": progress.cfi if progress else None,
        "is_read": bool(item.is_read),
        "rating": item.rating,
        "rating_changed": rating_changed,
        "local_updated_at": _iso(progress.updated_at if progress else item.last_read),
    }
    return fingerprint, payload


def enqueue_progress(db: Session, item: Item, rating_changed: bool = False) -> SyncOutbox:
    """Enfileira a projeção sincronizável de progresso/leitura/avaliação."""
    db.flush()
    fingerprint, payload = _progress_payload(db, item, rating_changed)
    return enqueue(
        db,
        entity_type="progress",
        entity_key=fingerprint,
        operation="upsert",
        payload=payload,
        fingerprint=fingerprint,
    )


def related_progress_items(db: Session, item: Item) -> list[Item]:
    """Inclui item, filhos e pai que podem ter sido alterados em cascata."""
    item_ids = {item.id}
    item_ids.update(
        child_id
        for (child_id,) in db.query(Item.id).filter(Item.parent_id == item.id).all()
    )
    if item.parent_id:
        item_ids.add(item.parent_id)
    return db.query(Item).filter(Item.id.in_(item_ids)).all()


def enqueue_progress_items(
    db: Session,
    items: Iterable[Item],
    rating_changed: bool = False,
) -> None:
    seen = set()
    for item in items:
        if item.id in seen:
            continue
        seen.add(item.id)
        enqueue_progress(db, item, rating_changed)


def _list_payload(user_list: UserList) -> dict:
    if not user_list.sync_id:
        user_list.sync_id = str(uuid.uuid4())
    return {
        "local_id": user_list.id,
        "sync_id": user_list.sync_id,
        "name": user_list.name,
        "is_default": bool(user_list.is_default),
        "sort_order": int(user_list.sort_order or 0),
        "created_at": _iso(user_list.created_at),
    }


def enqueue_list(
    db: Session,
    user_list: UserList,
    operation: str = "upsert",
) -> SyncOutbox:
    db.flush()
    if not user_list.sync_id:
        user_list.sync_id = str(uuid.uuid4())
        db.flush()
    return enqueue(
        db,
        entity_type="list",
        entity_key=user_list.sync_id,
        operation=operation,
        payload=_list_payload(user_list),
        local_list_id=user_list.id,
    )


def enqueue_membership(
    db: Session,
    user_list: UserList,
    item: Item,
    operation: str,
) -> SyncOutbox:
    if not user_list.sync_id:
        user_list.sync_id = str(uuid.uuid4())
        db.flush()
    fingerprint = item_fingerprint(item)
    payload = {
        "local_list_id": user_list.id,
        "list_sync_id": user_list.sync_id,
        "list_name": user_list.name,
        "fingerprint": fingerprint,
    }
    return enqueue(
        db,
        entity_type="list_membership",
        entity_key=f"{user_list.sync_id}:{fingerprint}",
        operation=operation,
        payload=payload,
        fingerprint=fingerprint,
        local_list_id=user_list.id,
    )
