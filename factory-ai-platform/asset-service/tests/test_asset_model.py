"""Regression tests for portable ORM metadata mapping."""
from __future__ import annotations

import uuid

import pytest
from sqlalchemy.dialects import postgresql, sqlite
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.asset import Asset, AssetRelationship
from app.schemas.asset import AssetCreateRequest, AssetResponse, AssetType
from app.services.asset_service import (
    AssetHierarchyError,
    AssetService,
    ParentAssetNotFoundError,
)


@pytest.mark.asyncio
async def test_asset_metadata_round_trips_with_public_api_name(
    test_session: AsyncSession,
):
    service = AssetService(test_session)
    asset = await service.create_asset(
        AssetCreateRequest(
            name="Metadata Mapping",
            type=AssetType.PLANT,
            metadata={"capacity": "100 units/day"},
        )
    )

    persisted = await service.get_asset(asset.id)
    assert persisted is not None

    response = AssetResponse.model_validate(persisted).model_dump()

    assert persisted.metadata_ == {"capacity": "100 units/day"}
    assert response["metadata"] == {"capacity": "100 units/day"}
    assert "metadata_" not in response


def test_metadata_column_name_and_dialect_types_are_preserved():
    for model in (Asset, AssetRelationship):
        column = model.__table__.c["metadata"]

        assert column.name == "metadata"
        assert str(column.type.compile(dialect=sqlite.dialect())) == "JSON"
        assert str(column.type.compile(dialect=postgresql.dialect())) == "JSONB"


@pytest.mark.asyncio
async def test_service_enforces_parent_existence_and_type(
    test_session: AsyncSession,
):
    service = AssetService(test_session)
    plant = await service.create_asset(
        AssetCreateRequest(name="Plant", type=AssetType.PLANT)
    )
    line = await service.create_asset(
        AssetCreateRequest(
            name="Line",
            type=AssetType.LINE,
            parent_id=plant.id,
        )
    )

    with pytest.raises(
        AssetHierarchyError,
        match="sensor assets require a machine parent",
    ):
        await service.create_asset(
            AssetCreateRequest(
                name="Sensor under line",
                type=AssetType.SENSOR,
                parent_id=line.id,
            )
        )

    with pytest.raises(ParentAssetNotFoundError, match="Parent asset"):
        await service.create_asset(
            AssetCreateRequest(
                name="Missing parent",
                type=AssetType.LINE,
                parent_id=uuid.uuid4(),
            )
        )
