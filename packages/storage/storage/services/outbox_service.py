"""
Outbox service layer component managing local durable outbox storage and state transitions.
"""

import json
import uuid
from collections.abc import Sequence
from datetime import UTC, datetime
from typing import Any

from domain.entities.enums import SyncStatus
from domain.rules.outbox_state_machine import OutboxStateMachine
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from storage.models.outbox_event import OutboxEvent


class OutboxService:
    """Service layer component managing outbox persistence and state machine execution."""

    @staticmethod
    def enqueue_event(
        session: Session,
        event_id: str,
        event_type: str,
        payload: dict[str, Any] | str,
        status: str | SyncStatus = SyncStatus.PENDING,
    ) -> OutboxEvent:
        """
        Enqueues a new outbox event inside the active database session transaction.
        """
        status_str = status.value if isinstance(status, SyncStatus) else status
        payload_str = json.dumps(payload) if isinstance(payload, dict) else payload

        outbox_id = f"OB-{uuid.uuid4()}"
        event = OutboxEvent(
            id=outbox_id,
            event_id=event_id,
            event_type=event_type,
            payload=payload_str,
            status=status_str,
            retry_count=0,
            next_attempt_at=None,
            created_at=datetime.now(UTC),
            last_error=None,
        )
        session.add(event)
        return event

    @staticmethod
    def get_pending_events(session: Session, limit: int = 100) -> Sequence[OutboxEvent]:
        """
        Retrieves outbox events queued for synchronization (PENDING or RETRYABLE_ERROR with due next_attempt_at).
        """
        now = datetime.now(UTC)
        stmt = (
            select(OutboxEvent)
            .where(
                (OutboxEvent.status == SyncStatus.PENDING.value)
                | (
                    (OutboxEvent.status == SyncStatus.RETRYABLE_ERROR.value)
                    & (
                        (OutboxEvent.next_attempt_at.is_(None))
                        | (OutboxEvent.next_attempt_at <= now)
                    )
                )
            )
            .order_by(OutboxEvent.created_at.asc())
            .limit(limit)
        )
        return session.scalars(stmt).all()

    @staticmethod
    def get_pending_count(session: Session) -> int:
        """
        Returns total count of outbox events currently in PENDING, SENDING, or RETRYABLE_ERROR states.
        """
        stmt = select(func.count(OutboxEvent.id)).where(
            OutboxEvent.status.in_(
                [
                    SyncStatus.PENDING.value,
                    SyncStatus.SENDING.value,
                    SyncStatus.RETRYABLE_ERROR.value,
                ]
            )
        )
        return session.scalar(stmt) or 0

    @staticmethod
    def transition_event_state(
        session: Session,
        event_id: str,
        target_state: str | SyncStatus,
        error_msg: str | None = None,
        backoff_base_seconds: int = 5,
    ) -> OutboxEvent:
        """
        Transitions an existing outbox event to target_state, enforcing valid state machine rules.
        Handles retry count increments, backoff timing for RETRYABLE_ERROR, and error logs.
        """
        stmt = select(OutboxEvent).where(OutboxEvent.event_id == event_id)
        event = session.scalar(stmt)
        if event is None:
            raise ValueError(f"OutboxEvent with event_id '{event_id}' not found.")

        validated_status = OutboxStateMachine.validate_transition(event.status, target_state)
        event.status = validated_status.value

        if validated_status == SyncStatus.RETRYABLE_ERROR:
            event.retry_count += 1
            event.next_attempt_at = OutboxStateMachine.compute_next_attempt_at(
                retry_count=event.retry_count - 1, base_seconds=backoff_base_seconds
            )
            if error_msg:
                event.last_error = error_msg
        elif validated_status in {SyncStatus.PERMANENT_REJECTION, SyncStatus.EXCEPTION_REVIEW}:
            if error_msg:
                event.last_error = error_msg
        elif validated_status in {SyncStatus.ACCEPTED, SyncStatus.SYNCED}:
            event.last_error = None
            event.next_attempt_at = None

        return event
