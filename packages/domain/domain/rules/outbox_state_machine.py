"""
Outbox and Sync State Machine domain rules (Section 10.3).

Lifecycle: PENDING → SENDING → ACCEPTED → SYNCED
Error branches:
  - RETRYABLE_ERROR: network timeout, server 5xx → backoff & set next_attempt_at → PENDING
  - PERMANENT_REJECTION: validation failure, 4xx → EXCEPTION_REVIEW
"""

from datetime import UTC, datetime, timedelta
from typing import Final

from domain.entities.enums import SyncStatus

# Valid state transition graph (Section 10.3)
ALLOWED_TRANSITIONS: Final[dict[SyncStatus, set[SyncStatus]]] = {
    SyncStatus.PENDING: {SyncStatus.SENDING},
    SyncStatus.SENDING: {
        SyncStatus.ACCEPTED,
        SyncStatus.RETRYABLE_ERROR,
        SyncStatus.PENDING,
        SyncStatus.PERMANENT_REJECTION,
        SyncStatus.EXCEPTION_REVIEW,
        SyncStatus.REJECTED,
    },
    SyncStatus.ACCEPTED: {SyncStatus.SYNCED},
    SyncStatus.SYNCED: set(),
    SyncStatus.RETRYABLE_ERROR: {SyncStatus.PENDING, SyncStatus.SENDING},
    SyncStatus.PERMANENT_REJECTION: {SyncStatus.EXCEPTION_REVIEW, SyncStatus.PENDING},
    SyncStatus.EXCEPTION_REVIEW: {SyncStatus.PENDING, SyncStatus.REJECTED},
    # Backward compatibility aliases
    SyncStatus.SENT: {
        SyncStatus.ACCEPTED,
        SyncStatus.RETRYABLE_ERROR,
        SyncStatus.PERMANENT_REJECTION,
        SyncStatus.EXCEPTION_REVIEW,
    },
    SyncStatus.REJECTED: {SyncStatus.PENDING, SyncStatus.EXCEPTION_REVIEW},
}


class InvalidStateTransitionError(ValueError):
    """Raised when an invalid outbox state transition is attempted."""

    def __init__(self, current_state: SyncStatus, target_state: SyncStatus):
        super().__init__(
            f"Invalid outbox state transition from '{current_state.value}' to '{target_state.value}'."
        )
        self.current_state = current_state
        self.target_state = target_state


class OutboxStateMachine:
    """Domain state machine governing outbox event synchronization states."""

    @staticmethod
    def validate_transition(current: str | SyncStatus, target: str | SyncStatus) -> SyncStatus:
        """
        Validates if transitioning from current state to target state is permissible.
        Returns target state as SyncStatus enum.
        """
        current_status = SyncStatus(current) if isinstance(current, str) else current
        target_status = SyncStatus(target) if isinstance(target, str) else target

        allowed = ALLOWED_TRANSITIONS.get(current_status, set())
        if target_status not in allowed and current_status != target_status:
            raise InvalidStateTransitionError(current_status, target_status)

        return target_status

    @staticmethod
    def calculate_exponential_backoff(
        retry_count: int, base_seconds: int = 5, max_seconds: int = 3600
    ) -> int:
        """
        Computes exponential backoff delay in seconds for retryable sync errors.
        base_seconds * (2 ** retry_count), capped at max_seconds.
        """
        if retry_count < 0:
            return base_seconds
        delay = base_seconds * (2**retry_count)
        return min(delay, max_seconds)

    @staticmethod
    def compute_next_attempt_at(
        retry_count: int,
        from_time: datetime | None = None,
        base_seconds: int = 5,
        max_seconds: int = 3600,
    ) -> datetime:
        """Calculates future UTC timestamp for next sync attempt after a retryable error."""
        if from_time is None:
            from_time = datetime.now(UTC)
        elif from_time.tzinfo is None:
            from_time = from_time.replace(tzinfo=UTC)

        delay_seconds = OutboxStateMachine.calculate_exponential_backoff(
            retry_count, base_seconds=base_seconds, max_seconds=max_seconds
        )
        return from_time + timedelta(seconds=delay_seconds)

    @staticmethod
    def is_pending_or_sending(status: str | SyncStatus) -> bool:
        """Returns True if status represents an active or queued pending sync state."""
        st = SyncStatus(status) if isinstance(status, str) else status
        return st in {SyncStatus.PENDING, SyncStatus.SENDING, SyncStatus.RETRYABLE_ERROR}
