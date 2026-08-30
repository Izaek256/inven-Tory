"""
Unit tests for OutboxStateMachine domain rules.
"""

from datetime import UTC, datetime

import pytest

from domain.entities.enums import SyncStatus
from domain.rules.outbox_state_machine import InvalidStateTransitionError, OutboxStateMachine


def test_valid_state_transitions():
    """Verify standard happy path transitions."""
    assert OutboxStateMachine.validate_transition("PENDING", "SENDING") == SyncStatus.SENDING
    assert OutboxStateMachine.validate_transition("SENDING", "ACCEPTED") == SyncStatus.ACCEPTED
    assert OutboxStateMachine.validate_transition("ACCEPTED", "SYNCED") == SyncStatus.SYNCED


def test_error_branch_transitions():
    """Verify error branch transitions."""
    # Retryable error branch
    assert (
        OutboxStateMachine.validate_transition("SENDING", "RETRYABLE_ERROR")
        == SyncStatus.RETRYABLE_ERROR
    )
    assert (
        OutboxStateMachine.validate_transition("RETRYABLE_ERROR", "PENDING") == SyncStatus.PENDING
    )

    # Permanent rejection branch
    assert (
        OutboxStateMachine.validate_transition("SENDING", "PERMANENT_REJECTION")
        == SyncStatus.PERMANENT_REJECTION
    )
    assert (
        OutboxStateMachine.validate_transition("PERMANENT_REJECTION", "EXCEPTION_REVIEW")
        == SyncStatus.EXCEPTION_REVIEW
    )


def test_invalid_transitions_raise():
    """Verify forbidden state transitions raise InvalidStateTransitionError."""
    with pytest.raises(InvalidStateTransitionError):
        OutboxStateMachine.validate_transition("PENDING", "SYNCED")

    with pytest.raises(InvalidStateTransitionError):
        OutboxStateMachine.validate_transition("SYNCED", "PENDING")


def test_exponential_backoff_calculation():
    """Verify exponential backoff calculation and cap."""
    assert OutboxStateMachine.calculate_exponential_backoff(0, base_seconds=5) == 5
    assert OutboxStateMachine.calculate_exponential_backoff(1, base_seconds=5) == 10
    assert OutboxStateMachine.calculate_exponential_backoff(2, base_seconds=5) == 20
    assert OutboxStateMachine.calculate_exponential_backoff(3, base_seconds=5) == 40
    assert (
        OutboxStateMachine.calculate_exponential_backoff(10, base_seconds=5, max_seconds=300) == 300
    )


def test_compute_next_attempt_at():
    """Verify compute_next_attempt_at returns future UTC timestamp."""
    now = datetime(2026, 8, 30, 12, 0, 0, tzinfo=UTC)
    next_time = OutboxStateMachine.compute_next_attempt_at(
        retry_count=2, from_time=now, base_seconds=5
    )
    # 5 * (2^2) = 20 seconds
    assert (next_time - now).total_seconds() == 20
