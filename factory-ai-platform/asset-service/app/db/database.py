"""Database configuration and session management."""
from __future__ import annotations

import os
from contextlib import asynccontextmanager
from typing import AsyncGenerator

from sqlalchemy import create_engine
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.orm import DeclarativeBase, sessionmaker


class Base(DeclarativeBase):
    """Shared declarative base for all asset-service ORM models."""


def _engine_options(url: str, pool_size: int, max_overflow: int) -> dict:
    options = {"echo": False, "pool_pre_ping": True}
    if not url.startswith("sqlite"):
        options.update(pool_size=pool_size, max_overflow=max_overflow)
    return options


def _require_database_url(name: str) -> str:
    value = os.environ.get(name)
    if not value:
        raise RuntimeError(f"{name} must be supplied by the deployment secret manager")
    return value


DATABASE_URL = _require_database_url("DATABASE_URL")
SYNC_DATABASE_URL = _require_database_url("SYNC_DATABASE_URL")

async_engine = create_async_engine(
    DATABASE_URL,
    **_engine_options(DATABASE_URL, pool_size=10, max_overflow=20),
)

sync_engine = create_engine(
    SYNC_DATABASE_URL,
    **_engine_options(SYNC_DATABASE_URL, pool_size=5, max_overflow=10),
)

AsyncSessionLocal = async_sessionmaker(
    bind=async_engine,
    class_=AsyncSession,
    expire_on_commit=False,
    autoflush=False,
)

SyncSessionLocal = sessionmaker(
    bind=sync_engine,
    expire_on_commit=False,
    autoflush=False,
)


@asynccontextmanager
async def get_db_session() -> AsyncGenerator[AsyncSession, None]:
    async with AsyncSessionLocal() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise
        finally:
            await session.close()


async def get_db() -> AsyncGenerator[AsyncSession, None]:
    async with get_db_session() as session:
        yield session
