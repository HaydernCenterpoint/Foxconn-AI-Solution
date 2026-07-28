"""Regression tests for hierarchy validation through the Excel importer."""
from __future__ import annotations

from contextlib import asynccontextmanager

import pytest
from openpyxl import Workbook
from sqlalchemy.ext.asyncio import AsyncSession

from app.scripts import import_assets
from app.services.asset_service import AssetHierarchyError


@pytest.mark.asyncio
async def test_excel_import_cannot_bypass_parent_type_validation(
    test_session: AsyncSession,
    tmp_path,
    monkeypatch,
):
    workbook = Workbook()
    sheet = workbook.active
    sheet.title = "Assets"
    sheet.append([
        "name",
        "type",
        "parent_external_id",
        "external_id",
        "metadata_json",
        "tags",
        "installed_at",
    ])
    sheet.append(["Plant", "plant", "", "PLANT-1", "{}", "", ""])
    sheet.append(["Line", "line", "PLANT-1", "LINE-1", "{}", "", ""])
    sheet.append(["Invalid sensor", "sensor", "LINE-1", "SENSOR-1", "{}", "", ""])
    workbook_path = tmp_path / "invalid-hierarchy.xlsx"
    workbook.save(workbook_path)

    @asynccontextmanager
    async def use_test_session():
        yield test_session

    monkeypatch.setattr(import_assets, "get_db_session", use_test_session)

    with pytest.raises(
        AssetHierarchyError,
        match="sensor assets require a machine parent",
    ):
        await import_assets.import_from_excel(str(workbook_path), dry_run=False)
