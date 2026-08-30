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
