"""
INVENTORY Tory API — application factory.

Routers and middleware are registered here. Business logic
lives in services; domain rules live in packages/domain.
"""

import logging
from collections.abc import AsyncGenerator
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text

from app.api.v1 import auth, devices, products, stores, sync, transactions, transfers, users
from app.core.config import settings
from app.db import get_engine

logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator[None, None]:
    """Startup sanity check for central database connectivity."""
    import os

    if "PYTEST_CURRENT_TEST" not in os.environ and not settings.database_url.startswith("sqlite"):
        try:
            engine = get_engine()
            async with engine.connect() as conn:
                await conn.execute(text("SELECT 1"))
        except Exception as exc:
            logger.error("Database connection failed during startup: %s", exc)
            raise RuntimeError(
                f"Database connection failed: {exc}. "
                "Please check your DATABASE_URL in .env and ensure special characters in passwords "
                "(e.g. '@', '#', '%', ':') are percent-encoded (e.g. '@' -> '%40')."
            ) from exc
    yield


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
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=[
        "Authorization",
        "Content-Type",
        "X-Device-Id",
        "Accept",
        "Origin",
        "X-Requested-With",
    ],
)


@app.get("/health", tags=["health"])
async def health_check() -> dict[str, str]:
    """Liveness probe — returns service version and status."""
    return {"status": "ok", "version": "1.1.0"}


# ---------------------------------------------------------------------------
# Router registration
# ---------------------------------------------------------------------------
API_V1_PREFIX = "/api/v1"

app.include_router(auth.router, prefix=API_V1_PREFIX)
app.include_router(devices.router, prefix=API_V1_PREFIX)
app.include_router(sync.router, prefix=API_V1_PREFIX)
app.include_router(products.router, prefix=API_V1_PREFIX)
app.include_router(stores.router, prefix=API_V1_PREFIX)
app.include_router(users.router, prefix=API_V1_PREFIX)
app.include_router(transfers.router, prefix=API_V1_PREFIX)
app.include_router(transactions.router, prefix=API_V1_PREFIX)

# Future routers (Issue 17+):
#   Issue 17: audit log  →  app/api/v1/audit.py
