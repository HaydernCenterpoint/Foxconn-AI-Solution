"""SQLAlchemy ORM models for Asset tables."""
from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from sqlalchemy import (
    ARRAY,
    DateTime,
    ForeignKey,
    Index,
    JSON,
    Numeric,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.database import Base

JSON_OBJECT = JSONB().with_variant(JSON(), "sqlite")
STRING_ARRAY = ARRAY(Text).with_variant(JSON(), "sqlite")


def _utc_now() -> datetime:
    return datetime.now(timezone.utc)


class Asset(Base):
    __tablename__ = "assets"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    type: Mapped[str] = mapped_column(String(50), nullable=False)
    parent_id: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), ForeignKey("assets.id", ondelete="SET NULL"), nullable=True)
    path: Mapped[Optional[str]] = mapped_column(String(1000), nullable=True)
    status: Mapped[str] = mapped_column(String(50), nullable=False, default="active")

    external_id: Mapped[Optional[str]] = mapped_column(String(255), unique=True, nullable=True)
    manufacturer: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    model_number: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    serial_number: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)

    location_zone: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    location_area: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)

    metadata_: Mapped[Dict[str, Any]] = mapped_column("metadata", JSON_OBJECT, nullable=False, default=dict)
    tags: Mapped[List[str]] = mapped_column(STRING_ARRAY, nullable=False, default=list)

    installed_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=_utc_now)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=_utc_now, onupdate=_utc_now)

    created_by: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), nullable=True)
    updated_by: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), nullable=True)

    # Relationships
    children: Mapped[List["Asset"]] = relationship("Asset", back_populates="parent", remote_side=[id])
    parent: Mapped[Optional["Asset"]] = relationship("Asset", back_populates="children", remote_side=[parent_id])

    __table_args__ = (
        Index("idx_assets_type", "type"),
        Index("idx_assets_status", "status"),
        Index("idx_assets_external_id", "external_id", postgresql_where=external_id.is_(None)),
        Index("idx_assets_path", "path", postgresql_using="btree", postgresql_ops={"path": "varchar_pattern_ops"}),
        Index("idx_assets_tags", "tags", postgresql_using="gin"),
        Index("idx_assets_metadata", "metadata", postgresql_using="gin"),
    )


class AssetRelationship(Base):
    __tablename__ = "asset_relationships"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    asset_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("assets.id", ondelete="CASCADE"), nullable=False)
    related_asset_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("assets.id", ondelete="CASCADE"), nullable=False)
    relationship_type: Mapped[str] = mapped_column(String(100), nullable=False)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    metadata_: Mapped[Dict[str, Any]] = mapped_column("metadata", JSON_OBJECT, nullable=False, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=_utc_now)

    __table_args__ = (
        UniqueConstraint("asset_id", "related_asset_id", "relationship_type", name="uq_asset_relationship"),
    )


class AssetDocument(Base):
    __tablename__ = "asset_documents"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    asset_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("assets.id", ondelete="CASCADE"), nullable=False)
    document_id: Mapped[str] = mapped_column(String(255), nullable=False)
    relationship: Mapped[str] = mapped_column(String(50), nullable=False, default="related")
    title: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    version: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    uploaded_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=_utc_now)
    uploaded_by: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), nullable=True)

    __table_args__ = (
        UniqueConstraint("asset_id", "document_id", name="uq_asset_document"),
    )


class AssetMetric(Base):
    __tablename__ = "asset_metrics"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    asset_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("assets.id", ondelete="CASCADE"), nullable=False)
    metric_name: Mapped[str] = mapped_column(String(100), nullable=False)
    metric_value: Mapped[float] = mapped_column(Numeric, nullable=True)
    recorded_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=_utc_now)

    __table_args__ = (
        UniqueConstraint("asset_id", "metric_name", "recorded_at", name="uq_asset_metric_time"),
        Index("idx_asset_metrics_asset_time", "asset_id", "recorded_at"),
    )
