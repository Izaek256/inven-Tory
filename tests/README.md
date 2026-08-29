# tests/ — Integration and End-to-End Tests

Unit tests live **beside their packages**:
- `services/api/tests/` — API unit and integration tests
- `packages/domain/tests/` — Domain rule unit tests

This directory is reserved for **cross-service integration tests** and **end-to-end acceptance tests** that require multiple services to be running simultaneously.

## Planned test suites (added in later issues)

| Suite | Issue | Requires |
|---|---|---|
| `test_sync_push_pull.py` | Issue 10 | API + PostgreSQL |
| `test_offline_reconnect.py` | Issue 14 | API + Desktop |
| `test_duplicate_retry.py` | Issue 10 | API + PostgreSQL |
| `test_po_receive.py` | Issue 16 | API + PostgreSQL |
| `test_alert_threshold.py` | Issue 17 | API + PostgreSQL |

## Running integration tests (after services are up)

```bash
# Start services
docker compose -f infra/docker/docker-compose.yml up -d

# Run integration tests
pytest tests/ -v --timeout=60
```

## Acceptance scenarios (SRS Section 24.2)

AT-001 to AT-012 (v1.0.0 baseline) and AT-013 to AT-022 (v1.1.0 additions) are implemented as integration tests in this directory.
