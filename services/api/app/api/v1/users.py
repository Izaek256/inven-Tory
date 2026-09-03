"""
User management endpoints — User CRUD operations.

GET /api/v1/users
    List all users with basic information.

GET /api/v1/users/{user_id}
    Get detailed information for a single user.

PUT /api/v1/users/{user_id}
    Update user fields (full_name, role, assigned_store_id, is_active).

PATCH /api/v1/users/{user_id}/deactivate
    Deactivate a user (set is_active = false).
"""

from __future__ import annotations

import logging
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_db, require_permission
from app.core.permissions import Permission
from app.models.user import User

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/users", tags=["users"])


# ---------------------------------------------------------------------------
# Response schemas
# ---------------------------------------------------------------------------


class UserListItem(BaseModel):
    id: int
    email: str
    username: str
    full_name: str | None
    role: str
    assigned_store_id: str | None
    is_active: bool
    created_at: datetime


class UserDetail(BaseModel):
    id: int
    email: str
    username: str
    full_name: str | None
    role: str
    assigned_store_id: str | None
    is_active: bool
    created_at: datetime


class UpdateUserRequest(BaseModel):
    full_name: str | None = None
    role: str | None = None
    assigned_store_id: str | None = None
    is_active: bool | None = None


# ---------------------------------------------------------------------------
# GET /api/v1/users
# ---------------------------------------------------------------------------


@router.get(
    "",
    response_model=list[UserListItem],
    status_code=status.HTTP_200_OK,
    summary="List all users",
)
async def list_users(
    db: AsyncSession = Depends(get_db),  # noqa: B008
    _user: User = Depends(require_permission(Permission.USER_ADMIN)),  # noqa: B008
) -> list[UserListItem]:
    """
    Return a list of all users with basic information.
    Requires USER_ADMIN permission.
    """
    stmt = select(User).order_by(User.username)
    result = await db.execute(stmt)
    users = result.scalars().all()

    return [
        UserListItem(
            id=user.id,
            email=user.email,
            username=user.username,
            full_name=user.full_name,
            role=user.role,
            assigned_store_id=user.assigned_store_id,
            is_active=bool(user.is_active),
            created_at=user.created_at,
        )
        for user in users
    ]


# ---------------------------------------------------------------------------
# GET /api/v1/users/{user_id}
# ---------------------------------------------------------------------------


@router.get(
    "/{user_id}",
    response_model=UserDetail,
    status_code=status.HTTP_200_OK,
    summary="Get user details",
)
async def get_user(
    user_id: int,
    db: AsyncSession = Depends(get_db),  # noqa: B008
    _user: User = Depends(require_permission(Permission.USER_ADMIN)),  # noqa: B008
) -> UserDetail:
    """
    Return detailed information for a single user.
    Requires USER_ADMIN permission.
    """
    user = await db.get(User, user_id)
    if user is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

    return UserDetail(
        id=user.id,
        email=user.email,
        username=user.username,
        full_name=user.full_name,
        role=user.role,
        assigned_store_id=user.assigned_store_id,
        is_active=bool(user.is_active),
        created_at=user.created_at,
    )


# ---------------------------------------------------------------------------
# PUT /api/v1/users/{user_id}
# ---------------------------------------------------------------------------


@router.put(
    "/{user_id}",
    response_model=UserDetail,
    status_code=status.HTTP_200_OK,
    summary="Update user",
)
async def update_user(
    user_id: int,
    request: UpdateUserRequest,
    db: AsyncSession = Depends(get_db),  # noqa: B008
    _user: User = Depends(require_permission(Permission.USER_ADMIN)),  # noqa: B008
) -> UserDetail:
    """
    Update user fields (full_name, role, assigned_store_id, is_active).
    Requires USER_ADMIN permission.
    """
    user = await db.get(User, user_id)
    if user is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

    if request.full_name is not None:
        user.full_name = request.full_name
    if request.role is not None:
        user.role = request.role
    if request.assigned_store_id is not None:
        user.assigned_store_id = request.assigned_store_id
    if request.is_active is not None:
        user.is_active = request.is_active

    await db.commit()
    await db.refresh(user)

    return UserDetail(
        id=user.id,
        email=user.email,
        username=user.username,
        full_name=user.full_name,
        role=user.role,
        assigned_store_id=user.assigned_store_id,
        is_active=bool(user.is_active),
        created_at=user.created_at,
    )


# ---------------------------------------------------------------------------
# PATCH /api/v1/users/{user_id}/deactivate
# ---------------------------------------------------------------------------


@router.patch(
    "/{user_id}/deactivate",
    response_model=UserDetail,
    status_code=status.HTTP_200_OK,
    summary="Deactivate user",
)
async def deactivate_user(
    user_id: int,
    db: AsyncSession = Depends(get_db),  # noqa: B008
    _user: User = Depends(require_permission(Permission.USER_ADMIN)),  # noqa: B008
) -> UserDetail:
    """
    Deactivate a user (set is_active = false).
    Requires USER_ADMIN permission.
    """
    user = await db.get(User, user_id)
    if user is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

    user.is_active = False
    await db.commit()
    await db.refresh(user)

    return UserDetail(
        id=user.id,
        email=user.email,
        username=user.username,
        full_name=user.full_name,
        role=user.role,
        assigned_store_id=user.assigned_store_id,
        is_active=bool(user.is_active),
        created_at=user.created_at,
    )
