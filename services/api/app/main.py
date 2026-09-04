"""
INVENTORY Tory API — application factory.

Routers and middleware are registered here. Business logic
lives in services; domain rules live in packages/domain.
"""

import logging
import traceback
from collections.abc import AsyncGenerator
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy import text

from app.api.v1 import auth, devices, products, stores, sync, transactions, transfers, users
from app.core.config import settings
from app.db import get_engine

logger = logging.getLogger(__name__)


def _cors_allow_origin_value(request: Request) -> str | None:
    """
    Return the exact origin string the caller used if it matches any of the
    configured CORS origins, or None if the origin is disallowed.

    The built-in starlette ``CORSMiddleware`` normally handles this; we use
    the same logic here *only on exception paths* so that 5xx responses
    (which are produced by ServerErrorMiddleware inside CORSMiddleware)
    still carry a matching ``Access-Control-Allow-Origin`` header instead
    of being hidden from the browser as opaque CORS errors.
    """
    origin = request.headers.get("origin")
    if not origin:
        return None
    allowed = set(settings.cors_origins)
    if "*" in allowed:
        return "*"
    return origin if origin in allowed else None


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


@app.exception_handler(Exception)
async def _global_json_exception_handler(request: Request, exc: Exception) -> JSONResponse:
    """
    Fallback JSON error handler for *unhandled* exceptions — returns a
    machine-readable JSON envelope (status 500) instead of starlette's
    default text/plain error page.

    Critically, this handler also emits the matching CORS ``Allow-Origin``
    header on the 500 response.  Without this, browsers (e.g. the Tauri
    dev frontend at http://localhost:1420) treat the response as opaque
    and report "Origin … not allowed by Access-Control-Allow-Origin",
    hiding the *actual* server error from the fetch consumer.  The
    handler intentionally does not swallow the error — we still log the
    full traceback at ERROR level so operators have visibility.
    """
    tb_lines = traceback.format_exception(type(exc), exc, exc.__traceback__)
    tb_text = "".join(tb_lines)
    logger.error("Unhandled exception in %s %s:\n%s", request.method, request.url.path, tb_text)

    status_code = 500
    body = {
        "detail": "Internal Server Error",
        "message": str(exc),
        "type": type(exc).__name__,
        "path": request.url.path,
    }
    if settings.environment != "production":
        body["traceback"] = tb_lines

    response = JSONResponse(status_code=status_code, content=body)

    cors_origin = _cors_allow_origin_value(request)
    if cors_origin:
        response.headers["Access-Control-Allow-Origin"] = cors_origin
        response.headers["Access-Control-Allow-Credentials"] = "true"
        response.headers["Access-Control-Allow-Methods"] = "GET, POST, PUT, PATCH, DELETE, OPTIONS"
        response.headers["Access-Control-Allow-Headers"] = (
            "Authorization, Content-Type, X-Device-Id, Accept, Origin, X-Requested-With"
        )
        response.headers["Vary"] = "Origin"
    return response


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
