"""Core Asset service — business logic layer.
Separates data access from API layer following service-oriented architecture.
"""
from __future__ import annotations

import uuid
from datetime import datetime, timedelta, timezone
from typing import List, Optional, Tuple

from sqlalchemy import and_, func, or_, select, text
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.asset import Asset, AssetDocument, AssetMetric, AssetRelationship
from app.schemas.asset import (
    AssetCreateRequest,
    AssetSearchRequest,
    AssetTreeNode,
    AssetType,
    DocumentLinkRequest,
    DocumentRelationship,
    HealthScoreResponse,
    RelationshipCreateRequest,
    RelationshipType,
)


class AssetService:
    def __init__(self, session: AsyncSession):
        self.session = session

    # =================================================================
    # CRUD
    # =================================================================

    async def create_asset(self, req: AssetCreateRequest, user_id: Optional[uuid.UUID] = None) -> Asset:
        asset = Asset(
            name=req.name,
            type=req.type.value,
            parent_id=req.parent_id,
            external_id=req.external_id,
            manufacturer=req.manufacturer,
            model_number=req.model_number,
            serial_number=req.serial_number,
            location_zone=req.location_zone,
            location_area=req.location_area,
            metadata=req.metadata,
            tags=req.tags,
            installed_at=req.installed_at,
            created_by=user_id,
        )
        self.session.add(asset)
        await self.session.flush()
        await self.session.refresh(asset)
        return asset

    async def get_asset(self, asset_id: uuid.UUID) -> Optional[Asset]:
        result = await self.session.execute(
            select(Asset).where(Asset.id == asset_id)
        )
        return result.scalar_one_or_none()

    async def update_asset(
        self, asset_id: uuid.UUID, req: AssetCreateRequest, user_id: Optional[uuid.UUID] = None
    ) -> Optional[Asset]:
        asset = await self.get_asset(asset_id)
        if not asset:
            return None
        for field, value in req.model_dump(exclude_unset=True).items():
            if field == "parent_id" and value is not None:
                setattr(asset, field, value)
            elif value is not None:
                setattr(asset, field, value)
        asset.updated_by = user_id
        await self.session.flush()
        await self.session.refresh(asset)
        return asset

    async def delete_asset(self, asset_id: uuid.UUID) -> bool:
        asset = await self.get_asset(asset_id)
        if not asset:
            return False
        await self.session.delete(asset)
        await self.session.flush()
        return True

    # =================================================================
    # Search & List
    # =================================================================

    async def list_assets(
        self, search: AssetSearchRequest
    ) -> Tuple[List[Asset], int]:
        query = select(Asset)
        count_query = select(func.count(Asset.id))

        if search.name:
            query = query.where(Asset.name.ilike(f"%{search.name}%"))
            count_query = count_query.where(Asset.name.ilike(f"%{search.name}%"))
        if search.type:
            query = query.where(Asset.type == search.type.value)
            count_query = count_query.where(Asset.type == search.type.value)
        if search.status:
            query = query.where(Asset.status == search.status.value)
            count_query = count_query.where(Asset.status == search.status.value)
        if search.parent_id is not None:
            query = query.where(Asset.parent_id == search.parent_id)
            count_query = count_query.where(Asset.parent_id == search.parent_id)
        if search.tag:
            query = query.where(Asset.tags.contains([search.tag]))
            count_query = count_query.where(Asset.tags.contains([search.tag]))
        if search.manufacturer:
            query = query.where(Asset.manufacturer.ilike(f"%{search.manufacturer}%"))
            count_query = count_query.where(Asset.manufacturer.ilike(f"%{search.manufacturer}%"))
        if search.external_id:
            query = query.where(Asset.external_id == search.external_id)
            count_query = count_query.where(Asset.external_id == search.external_id)

        total_result = await self.session.execute(count_query)
        total = total_result.scalar() or 0

        query = query.order_by(Asset.type, Asset.name).offset(search.offset).limit(search.limit)
        result = await self.session.execute(query)
        assets = list(result.scalars().all())
        return assets, total

    async def get_asset_tree(
        self, root_id: Optional[uuid.UUID], depth: int = 3
    ) -> List[AssetTreeNode]:
        if root_id:
            root = await self.get_asset(root_id)
            if not root:
                return []
            roots = [root]
        else:
            result = await self.session.execute(
                select(Asset).where(Asset.parent_id.is_(None)).order_by(Asset.name)
            )
            roots = list(result.scalars().all())

        return await self._build_tree_nodes(roots, depth)

    async def _build_tree_nodes(self, assets: List[Asset], remaining_depth: int) -> List[AssetTreeNode]:
        if remaining_depth <= 0 or not assets:
            return []

        nodes = []
        for asset in assets:
            node = AssetTreeNode(
                id=asset.id,
                name=asset.name,
                type=AssetType(asset.type),
                parent_id=asset.parent_id,
                path=asset.path,
                status=asset.status,
                external_id=asset.external_id,
                manufacturer=asset.manufacturer,
                model_number=asset.model_number,
                serial_number=asset.serial_number,
                location_zone=asset.location_zone,
                location_area=asset.location_area,
                metadata=asset.metadata,
                tags=asset.tags or [],
                installed_at=asset.installed_at,
                created_at=asset.created_at,
                updated_at=asset.updated_at,
                children=[],
            )

            if remaining_depth > 1:
                result = await self.session.execute(
                    select(Asset)
                    .where(Asset.parent_id == asset.id)
                    .order_by(Asset.name)
                )
                children = list(result.scalars().all())
                node.children = await self._build_tree_nodes(children, remaining_depth - 1)

            nodes.append(node)
        return nodes

    async def get_children(self, parent_id: uuid.UUID) -> List[Asset]:
        result = await self.session.execute(
            select(Asset).where(Asset.parent_id == parent_id).order_by(Asset.name)
        )
        return list(result.scalars().all())

    async def get_ancestors(self, asset_id: uuid.UUID) -> List[Asset]:
        ancestors = []
        current = await self.get_asset(asset_id)
        while current and current.parent_id:
            parent = await self.get_asset(current.parent_id)
            if parent:
                ancestors.append(parent)
                current = parent
            else:
                break
        return ancestors

    # =================================================================
    # Relationships
    # =================================================================

    async def create_relationship(self, req: RelationshipCreateRequest) -> AssetRelationship:
        rel = AssetRelationship(
            asset_id=req.asset_id,
            related_asset_id=req.related_asset_id,
            relationship_type=req.relationship_type.value,
            description=req.description,
            metadata=req.metadata,
        )
        self.session.add(rel)
        await self.session.flush()
        await self.session.refresh(rel)
        return rel

    async def list_relationships(
        self, asset_id: uuid.UUID, rel_type: Optional[RelationshipType] = None
    ) -> List[AssetRelationship]:
        query = select(AssetRelationship).where(AssetRelationship.asset_id == asset_id)
        if rel_type:
            query = query.where(AssetRelationship.relationship_type == rel_type.value)
        query = query.order_by(AssetRelationship.relationship_type)
        result = await self.session.execute(query)
        return list(result.scalars().all())

    async def delete_relationship(self, rel_id: uuid.UUID) -> bool:
        result = await self.session.execute(
            select(AssetRelationship).where(AssetRelationship.id == rel_id)
        )
        rel = result.scalar_one_or_none()
        if not rel:
            return False
        await self.session.delete(rel)
        await self.session.flush()
        return True

    # =================================================================
    # Document linking
    # =================================================================

    async def link_document(self, req: DocumentLinkRequest, user_id: Optional[uuid.UUID] = None) -> AssetDocument:
        doc = AssetDocument(
            asset_id=req.asset_id,
            document_id=req.document_id,
            relationship=req.relationship.value,
            title=req.title,
            version=req.version,
            uploaded_by=user_id,
        )
        self.session.add(doc)
        await self.session.flush()
        await self.session.refresh(doc)
        return doc

    async def list_asset_documents(self, asset_id: uuid.UUID) -> List[AssetDocument]:
        result = await self.session.execute(
            select(AssetDocument)
            .where(AssetDocument.asset_id == asset_id)
            .order_by(AssetDocument.uploaded_at.desc())
        )
        return list(result.scalars().all())

    async def unlink_document(self, asset_id: uuid.UUID, document_id: str) -> bool:
        result = await self.session.execute(
            select(AssetDocument).where(
                and_(
                    AssetDocument.asset_id == asset_id,
                    AssetDocument.document_id == document_id,
                )
            )
        )
        doc = result.scalar_one_or_none()
        if not doc:
            return False
        await self.session.delete(doc)
        await self.session.flush()
        return True

    # =================================================================
    # Health Score (Sprint C3)
    # =================================================================

    async def compute_health_score(self, asset_id: uuid.UUID, recorded_at: Optional[datetime] = None) -> HealthScoreResponse:
        now = recorded_at or datetime.now(timezone.utc)
        window_start = now - timedelta(hours=24)

        uptime_pct = await self._get_uptime_pct(asset_id, window_start)
        alarm_count = await self._get_alarm_count(asset_id, window_start)
        performance_pct = await self._get_performance_vs_baseline(asset_id)
        maintenance_overdue = await self._is_maintenance_overdue(asset_id)

        alarm_score = max(0.0, 100.0 - alarm_count * 5.0)
        maintenance_score = 0.0 if maintenance_overdue else 100.0

        health_score = (
            uptime_pct * 0.40
            + alarm_score * 0.30
            + performance_pct * 0.20
            + maintenance_score * 0.10
        )

        return HealthScoreResponse(
            asset_id=asset_id,
            recorded_at=now,
            health_score=round(health_score, 2),
            uptime_pct=round(uptime_pct, 2),
            alarm_frequency=round(alarm_count, 2),
            performance_pct=round(performance_pct, 2),
            maintenance_overdue=maintenance_overdue,
            breakdown={
                "uptime_pct":          round(uptime_pct, 2),
                "alarm_score":         round(alarm_score, 2),
                "performance_pct":     round(performance_pct, 2),
                "maintenance_score":   round(maintenance_score, 2),
            },
        )

    async def _get_uptime_pct(self, asset_id: uuid.UUID, window_start: datetime) -> float:
        result = await self.session.execute(
            select(AssetMetric).where(
                and_(
                    AssetMetric.asset_id == asset_id,
                    AssetMetric.metric_name == "uptime_pct",
                    AssetMetric.recorded_at >= window_start,
                )
            ).order_by(AssetMetric.recorded_at.desc()).limit(1)
        )
        metric = result.scalar_one_or_none()
        if metric:
            return float(metric.metric_value or 0)
        return 100.0

    async def _get_alarm_count(self, asset_id: uuid.UUID, window_start: datetime) -> float:
        result = await self.session.execute(
            select(func.count(AssetMetric.id)).where(
                and_(
                    AssetMetric.asset_id == asset_id,
                    AssetMetric.metric_name == "alarm_count",
                    AssetMetric.recorded_at >= window_start,
                )
            )
        )
        return float(result.scalar() or 0)

    async def _get_performance_vs_baseline(self, asset_id: uuid.UUID) -> float:
        result = await self.session.execute(
            select(AssetMetric).where(
                and_(
                    AssetMetric.asset_id == asset_id,
                    AssetMetric.metric_name == "performance_pct",
                )
            ).order_by(AssetMetric.recorded_at.desc()).limit(1)
        )
        metric = result.scalar_one_or_none()
        if metric:
            return float(metric.metric_value or 0)
        return 80.0

    async def _is_maintenance_overdue(self, asset_id: uuid.UUID) -> bool:
        asset = await self.get_asset(asset_id)
        if not asset:
            return False
        next_maintenance = asset.metadata.get("next_maintenance_date")
        if not next_maintenance:
            return False
        try:
            maintenance_date = datetime.fromisoformat(next_maintenance)
            return datetime.now(timezone.utc) > maintenance_date.replace(tzinfo=timezone.utc)
        except (ValueError, TypeError):
            return False

    async def save_health_score(self, asset_id: uuid.UUID, score: HealthScoreResponse) -> AssetMetric:
        metric = AssetMetric(
            asset_id=asset_id,
            metric_name="health_score",
            metric_value=score.health_score,
            recorded_at=score.recorded_at,
        )
        self.session.add(metric)
        await self.session.flush()
        return metric

    async def get_health_history(
        self, asset_id: uuid.UUID, limit: int = 100
    ) -> List[HealthScoreResponse]:
        result = await self.session.execute(
            select(AssetMetric).where(
                and_(
                    AssetMetric.asset_id == asset_id,
                    AssetMetric.metric_name == "health_score",
                )
            ).order_by(AssetMetric.recorded_at.desc()).limit(limit)
        )
        metrics = result.scalars().all()
        responses = []
        for m in metrics:
            responses.append(HealthScoreResponse(
                asset_id=asset_id,
                recorded_at=m.recorded_at,
                health_score=float(m.metric_value or 0),
                uptime_pct=0,
                alarm_frequency=0,
                performance_pct=0,
                maintenance_overdue=False,
            ))
        return responses

    # =================================================================
    # Stats
    # =================================================================

    async def get_stats(self) -> dict:
        result = await self.session.execute(
            select(
                Asset.type,
                func.count(Asset.id).label("count"),
            ).group_by(Asset.type)
        )
        counts = {row.type: row.count for row in result.all()}

        total_result = await self.session.execute(select(func.count(Asset.id)))
        total = total_result.scalar() or 0

        return {
            "total_assets": total,
            "by_type": counts,
        }
