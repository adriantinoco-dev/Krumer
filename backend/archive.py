"""
Arquivo morto de metadados.

Quando um arquivo (ou pasta) sai da pasta da biblioteca, o item é removido do
SQLite. Antes disso fazemos um "snapshot" dos metadados editados, tags,
progresso e listas em `archived_items`. Quando o mesmo arquivo volta para a
pasta, o item é recriado e tentamos restaurar esse snapshot, fazendo o livro
"voltar com tudo": metadados, progresso e tags.
"""
import datetime
from pathlib import Path

from sqlalchemy.orm import Session

from models import Item, Progress, Tag, UserList, list_items, ArchivedItem

MAX_ARCHIVED_ITEMS = 500


def _fingerprint_key(item_type: str, basename: str, file_size=None) -> str:
    if item_type == "series":
        return f"series|{basename}"
    return f"file|{basename}|{int(file_size or 0)}"


def _snapshot(db: Session, item: Item) -> dict:
    list_ids = [
        row.list_id for row in db.query(list_items).filter(list_items.c.item_id == item.id).all()
    ]
    progress = [
        {
            "progress_pct": p.progress_pct,
            "current_page": p.current_page,
            "total_pages": p.total_pages,
            "cfi": p.cfi,
        }
        for p in item.progress
    ]
    tags = [t.name for t in item.tags]
    return {
        "type": item.type,
        "title": item.title,
        "metadata_title": item.metadata_title,
        "filename_title": item.filename_title,
        "author": item.author,
        "publisher": item.publisher,
        "year": item.year,
        "description": item.description,
        "rating": item.rating,
        "is_read": item.is_read,
        "last_read": item.last_read.isoformat() if item.last_read else None,
        "tags": tags,
        "progress": progress,
        "lists": list_ids,
    }


def _item_basename(item: Item) -> str:
    if item.type == "series":
        return item.filename_title or item.title
    return item.filename_title or Path(item.path).stem


def _has_meaningful_metadata(db: Session, item: Item) -> bool:
    """Itens nunca editados/leram não precisam de snapshot (evita poluir o arquivo morto)."""
    if item.type == "series":
        return any([
            item.title != (item.filename_title or item.title),
            item.author, item.description, item.year, item.publisher, item.rating,
            bool(item.tags),
        ])
    return any([
        item.title != (item.filename_title or item.title),
        item.author, item.description, item.year, item.publisher, item.rating,
        item.is_read,
        bool(item.tags),
        bool(item.progress),
        bool(db.query(list_items).filter(list_items.c.item_id == item.id).first()),
    ])


def archive_item(db: Session, item: Item) -> None:
    """Salva um snapshot do item em `archived_items` antes de removê-lo."""
    if not _has_meaningful_metadata(db, item):
        return

    key = _fingerprint_key(item.type, _item_basename(item), item.file_size)
    payload = _snapshot(db, item)

    existing = db.query(ArchivedItem).filter(ArchivedItem.fingerprint == key).first()
    if existing:
        existing.snapshot = payload
        existing.item_type = item.type
        existing.archived_at = datetime.datetime.utcnow()
    else:
        db.add(ArchivedItem(
            fingerprint=key,
            item_type=item.type,
            snapshot=payload,
            archived_at=datetime.datetime.utcnow(),
        ))
    db.flush()
    _prune(db)


def try_restore_item(db: Session, item: Item) -> bool:
    """
    Tenta restaurar o snapshot de um item recém-criado. Retorna True se um
    snapshot foi encontrado e aplicado.
    """
    key = _fingerprint_key(item.type, _item_basename(item), item.file_size)
    archived = db.query(ArchivedItem).filter(ArchivedItem.fingerprint == key).first()

    # Fallback: se o tamanho não bater (ex.: item antigo sem file_size, arquivo
    # re-editado), tenta casar apenas pelo nome do arquivo/série.
    if not archived:
        basename = _item_basename(item)
        for row in db.query(ArchivedItem).all():
            if item.type == "series":
                if row.fingerprint == f"series|{basename}":
                    archived = row
                    break
            else:
                if row.fingerprint.startswith(f"file|{basename}|"):
                    archived = row
                    break

    if not archived:
        return False

    payload = archived.snapshot or {}

    for field in (
        "title", "metadata_title", "filename_title",
        "author", "publisher", "year", "description", "rating", "is_read",
    ):
        if field in payload and payload[field] is not None:
            setattr(item, field, payload[field])

    last_read = payload.get("last_read")
    if last_read:
        try:
            item.last_read = datetime.datetime.fromisoformat(last_read)
        except ValueError:
            pass

    # Tags
    for name in payload.get("tags") or []:
        tag = db.query(Tag).filter(Tag.name == name).first()
        if not tag:
            tag = Tag(name=name)
            db.add(tag)
            db.flush()
        if tag not in item.tags:
            item.tags.append(tag)

    # Progresso (apenas livros/capítulos, jamais a série em si)
    if item.type != "series":
        progress = payload.get("progress") or []
        if progress:
            restored = progress[0]
            existing = db.query(Progress).filter(Progress.item_id == item.id).first()
            if existing is None:
                db.add(Progress(
                    item_id=item.id,
                    file_path=item.path,
                    progress_pct=restored.get("progress_pct", 0.0),
                    current_page=restored.get("current_page", 0),
                    total_pages=restored.get("total_pages"),
                    cfi=restored.get("cfi"),
                ))

    # Listas personalizadas
    for list_id in payload.get("lists") or []:
        if db.query(UserList).filter(UserList.id == list_id).first() is None:
            continue
        exists = db.query(list_items).filter(
            list_items.c.list_id == list_id,
            list_items.c.item_id == item.id,
        ).first()
        if exists is None:
            db.execute(list_items.insert().values(list_id=list_id, item_id=item.id))

    db.flush()
    db.delete(archived)
    return True


def _prune(db: Session) -> None:
    """Mantém o arquivo morto em tamanho controlado (remove os mais antigos)."""
    rows = db.query(ArchivedItem).order_by(ArchivedItem.archived_at.desc()).all()
    if len(rows) > MAX_ARCHIVED_ITEMS:
        for old in rows[MAX_ARCHIVED_ITEMS:]:
            db.delete(old)
        db.flush()