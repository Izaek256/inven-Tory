"""
Tests for OutboxService storage layer component.
"""

from domain.entities.enums import SyncStatus

from storage.db import Base, get_engine, get_sessionmaker
from storage.services.outbox_service import OutboxService


def test_enqueue_event_and_get_pending(tmp_path):
    """Test enqueueing outbox events and fetching pending events/count."""
    db_file = tmp_path / "test_outbox_service.db"
    engine = get_engine(f"sqlite:///{db_file}")
    Base.metadata.create_all(engine)
    session_factory = get_sessionmaker(engine)

    with session_factory() as session:
        event = OutboxService.enqueue_event(
            session=session,
            event_id="EVT-001",
            event_type="INVENTORY_TRANSACTION",
            payload={"tx_id": "TX-100", "qty": 5},
        )
        session.commit()
        assert event.id.startswith("OB-")

    with session_factory() as session:
        pending_count = OutboxService.get_pending_count(session)
        assert pending_count == 1

        pending_events = OutboxService.get_pending_events(session)
        assert len(pending_events) == 1
        assert pending_events[0].event_id == "EVT-001"
        assert pending_events[0].status == "PENDING"
        assert '"tx_id": "TX-100"' in pending_events[0].payload


def test_transition_event_state_lifecycle(tmp_path):
    """Test standard lifecycle transitions PENDING -> SENDING -> ACCEPTED -> SYNCED."""
    db_file = tmp_path / "test_outbox_lifecycle.db"
    engine = get_engine(f"sqlite:///{db_file}")
    Base.metadata.create_all(engine)
    session_factory = get_sessionmaker(engine)

    with session_factory() as session:
        OutboxService.enqueue_event(
            session=session,
            event_id="EVT-002",
            event_type="INVENTORY_TRANSACTION",
            payload={"tx_id": "TX-200"},
        )
        session.commit()

    with session_factory() as session:
        evt = OutboxService.transition_event_state(session, "EVT-002", SyncStatus.SENDING)
        assert evt.status == "SENDING"
        session.commit()

    with session_factory() as session:
        evt = OutboxService.transition_event_state(session, "EVT-002", SyncStatus.ACCEPTED)
        assert evt.status == "ACCEPTED"
        session.commit()

    with session_factory() as session:
        evt = OutboxService.transition_event_state(session, "EVT-002", SyncStatus.SYNCED)
        assert evt.status == "SYNCED"
        session.commit()

    with session_factory() as session:
        # SYNCED is no longer pending
        assert OutboxService.get_pending_count(session) == 0


def test_transition_retryable_error_branch(tmp_path):
    """Test SENDING -> RETRYABLE_ERROR increments retry_count and sets next_attempt_at."""
    db_file = tmp_path / "test_outbox_retry.db"
    engine = get_engine(f"sqlite:///{db_file}")
    Base.metadata.create_all(engine)
    session_factory = get_sessionmaker(engine)

    with session_factory() as session:
        OutboxService.enqueue_event(
            session=session,
            event_id="EVT-003",
            event_type="INVENTORY_TRANSACTION",
            payload={"tx_id": "TX-300"},
        )
        session.commit()

    # Move to SENDING then RETRYABLE_ERROR
    with session_factory() as session:
        OutboxService.transition_event_state(session, "EVT-003", SyncStatus.SENDING)
        evt = OutboxService.transition_event_state(
            session, "EVT-003", SyncStatus.RETRYABLE_ERROR, error_msg="503 Service Unavailable"
        )
        assert evt.status == "RETRYABLE_ERROR"
        assert evt.retry_count == 1
        assert evt.last_error == "503 Service Unavailable"
        assert evt.next_attempt_at is not None
        session.commit()

    with session_factory() as session:
        # Retryable error with future next_attempt_at is still counted in pending count
        assert OutboxService.get_pending_count(session) == 1


# ---------------------------------------------------------------------------
# P2 (optimization plan): outbox archival (7-day retention)
# ---------------------------------------------------------------------------


def _enqueue_with_age(session, event_id: str, status: str, days_old: int):
    """Enqueue an outbox event and backdate its created_at."""
    from datetime import UTC, datetime, timedelta

    event = OutboxService.enqueue_event(
        session=session,
        event_id=event_id,
        event_type="INVENTORY_TRANSACTION",
        payload={"tx_id": event_id},
        status=status,
    )
    event.created_at = datetime.now(UTC) - timedelta(days=days_old)
    return event


def test_archive_old_events_removes_only_stale_terminal_events(tmp_path):
    """Terminal events past the cutoff are archived; the rest are kept."""
    db_file = tmp_path / "test_outbox_archive.db"
    engine = get_engine(f"sqlite:///{db_file}")
    Base.metadata.create_all(engine)
    session_factory = get_sessionmaker(engine)

    with session_factory() as session:
        # Past cutoff, terminal → must be archived.
        _enqueue_with_age(session, "EVT-OLD-SYNCED", "SYNCED", days_old=8)
        _enqueue_with_age(session, "EVT-OLD-ACCEPTED", "ACCEPTED", days_old=9)
        _enqueue_with_age(session, "EVT-OLD-REJECTED", "PERMANENT_REJECTION", days_old=10)
        # Past cutoff, still deliverable → must be kept (offline queue payload).
        _enqueue_with_age(session, "EVT-OLD-PENDING", "PENDING", days_old=8)
        _enqueue_with_age(session, "EVT-OLD-RETRYABLE", "RETRYABLE_ERROR", days_old=8)
        # Recent terminal → must be kept (inside retention window).
        _enqueue_with_age(session, "EVT-NEW-SYNCED", "SYNCED", days_old=1)
        session.commit()

    with session_factory() as session:
        archived = OutboxService.archive_old_events(session, retention_days=7)
        session.commit()
        assert archived == 3

    with session_factory() as session:
        remaining = {e.event_id for e in OutboxService.get_pending_events(session, limit=50)}
        # Deliverable events survive regardless of age.
        assert "EVT-OLD-PENDING" in remaining
        assert "EVT-OLD-RETRYABLE" in remaining

        from sqlalchemy import select

        from storage.models.outbox_event import OutboxEvent

        all_ids = set(session.scalars(select(OutboxEvent.event_id)).all())
        assert all_ids == {
            "EVT-OLD-PENDING",
            "EVT-OLD-RETRYABLE",
            "EVT-NEW-SYNCED",
        }


def test_archive_old_events_is_idempotent(tmp_path):
    """A second archival run finds nothing new to archive."""
    db_file = tmp_path / "test_outbox_archive_idem.db"
    engine = get_engine(f"sqlite:///{db_file}")
    Base.metadata.create_all(engine)
    session_factory = get_sessionmaker(engine)

    with session_factory() as session:
        _enqueue_with_age(session, "EVT-IDEM-1", "SYNCED", days_old=30)
        session.commit()

    with session_factory() as session:
        assert OutboxService.archive_old_events(session, retention_days=7) == 1
        session.commit()

    with session_factory() as session:
        assert OutboxService.archive_old_events(session, retention_days=7) == 0


def test_archive_old_events_respects_custom_retention_window(tmp_path):
    """retention_days widens/narrows the cutoff."""
    db_file = tmp_path / "test_outbox_archive_window.db"
    engine = get_engine(f"sqlite:///{db_file}")
    Base.metadata.create_all(engine)
    session_factory = get_sessionmaker(engine)

    with session_factory() as session:
        _enqueue_with_age(session, "EVT-WIN-8D", "SYNCED", days_old=8)
        session.commit()

    with session_factory() as session:
        # 14-day window → 8-day-old event is inside it, kept.
        assert OutboxService.archive_old_events(session, retention_days=14) == 0
        session.commit()

    with session_factory() as session:
        # 7-day window → archived.
        assert OutboxService.archive_old_events(session, retention_days=7) == 1
        session.commit()
