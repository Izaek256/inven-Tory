"""
INVENTORY Tory API — application factory.

Routers and middleware are registered here. Business logic
lives in services; domain rules live in packages/domain.
"""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.core.config import settings

app = FastAPI(
    title="INVENTORY Tory API",
    description=(
        "Offline-First, Multi-Store Inventory Management System — central API. "
        "All stock changes are recorded as immutable transaction events. "
        "See the SRS for the non-negotiable design rule: never synchronize by "
        "overwriting quantities."
    ),
    version="1.1.0",
    docs_url="/docs",
    redoc_url="/redoc",
    openapi_url="/openapi.json",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health", tags=["health"])
async def health_check() -> dict[str, str]:
    """Liveness probe — returns service version and status."""
    return {"status": "ok", "version": "1.1.0"}


# ---------------------------------------------------------------------------
# Router registration — routers are added in later issues:
#
#   Issue 08: auth / device registration  →  app/api/v1/auth.py
#   Issue 09: sync push/pull              →  app/api/v1/sync.py
#   Issue 10: products / search           →  app/api/v1/products.py
#   Issue 11: reports / dashboard         →  app/api/v1/reports.py
# ---------------------------------------------------------------------------
