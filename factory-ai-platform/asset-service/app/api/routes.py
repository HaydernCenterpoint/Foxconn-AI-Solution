"""Asset API routes — Sprint C1-C4 (final version with auth)."""
from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Annotated, List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.jwt_auth import (
    CurrentUser,
    get_current_user,
    get_optional_user,
)
from app.core.rate_limit import check_rate_limit
from app.db.database import get_db
from app.schemas.asset import (
    AssetCreateRequest,
    AssetListResponse,
    AssetResponse,
    AssetSearchRequest,
    AssetStatus,
    AssetTreeNode,
    AssetTreeRequest,
    AssetType,
    AssetUpdateRequest,
    DocumentLinkRequest,
    DocumentLinkResponse,
    HealthScoreResponse,
    HealthScoreHistoryResponse,
    ProblemDetail,
    RelationshipCreateRequest,
    RelationshipResponse,
    RelationshipType,
)
from app.services.asset_service import (
    AssetHierarchyError,
    AssetService,
    ParentAssetNotFoundError,
)

router = APIRouter(prefix="/api/v1/assets", tags=["Assets"])


def get_asset_service(db: AsyncSession = Depends(get_db)) -> AssetService:
    return AssetService(db)


# ===================================================================
# Asset CRUD
# ===================================================================

@router.post(
    "",
    response_model=AssetResponse,
    status_code=status.HTTP_201_CREATED,
    responses={
        400: {"model": ProblemDetail},
        401: {"model": ProblemDetail},
        403: {"model": ProblemDetail},
        404: {"model": ProblemDetail},
    },
)
async def create_asset(
    req: AssetCreateRequest,
    service: AssetService = Depends(get_asset_service),
    user: CurrentUser = Depends(get_current_user),
):
    if not user.can_write():
        raise HTTPException(status_code=403, detail="Write access denied")

    if req.parent_id:
        parent = await service.get_asset(req.parent_id)
        if not parent:
            raise HTTPException(status_code=404, detail=f"Parent asset {req.parent_id} not found")
        if not user.has_scope_for_asset(parent.type, parent.external_id):
            raise HTTPException(status_code=403, detail="No scope for parent asset")

    try:
        asset = await service.create_asset(req, user_id=user.user_id)
    except ParentAssetNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except AssetHierarchyError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return AssetResponse.model_validate(asset)


@router.get("/{asset_id}", response_model=AssetResponse)
async def get_asset(
    asset_id: uuid.UUID,
    service: AssetService = Depends(get_asset_service),
    user: Optional[CurrentUser] = Depends(get_optional_user),
):
    asset = await service.get_asset(asset_id)
    if not asset:
        raise HTTPException(status_code=404, detail=f"Asset {asset_id} not found")
    if user and not user.has_scope_for_asset(asset.type, asset.external_id):
        raise HTTPException(status_code=403, detail="No scope for this asset")
    return AssetResponse.model_validate(asset)


@router.put("/{asset_id}", response_model=AssetResponse)
async def update_asset(
    asset_id: uuid.UUID,
    req: AssetUpdateRequest,
    service: AssetService = Depends(get_asset_service),
    user: CurrentUser = Depends(get_current_user),
):
    if not user.can_write():
        raise HTTPException(status_code=403, detail="Write access denied")

    existing = await service.get_asset(asset_id)
    if not existing:
        raise HTTPException(status_code=404, detail=f"Asset {asset_id} not found")
    if not user.has_scope_for_asset(existing.type, existing.external_id):
        raise HTTPException(status_code=403, detail="No scope for this asset")

    update_data = req.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        if value is not None:
            if field == "metadata":
                existing.metadata_ = {**existing.metadata_, **value} if existing.metadata_ else value
            else:
                setattr(existing, field, value)

    await service.session.flush()
    await service.session.refresh(existing)
    return AssetResponse.model_validate(existing)


@router.delete("/{asset_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_asset(
    asset_id: uuid.UUID,
    service: AssetService = Depends(get_asset_service),
    user: CurrentUser = Depends(get_current_user),
):
    if not user.can_delete():
        raise HTTPException(status_code=403, detail="Delete access denied")

    asset = await service.get_asset(asset_id)
    if not asset:
        raise HTTPException(status_code=404, detail=f"Asset {asset_id} not found")
    if not user.has_scope_for_asset(asset.type, asset.external_id):
        raise HTTPException(status_code=403, detail="No scope for this asset")

    await service.delete_asset(asset_id)


@router.get("", response_model=AssetListResponse)
async def list_assets(
    request: Request,
    name: Annotated[Optional[str], Query(description="Filter by name (case-insensitive partial match)")] = None,
    type: Annotated[Optional[AssetType], Query(description="Filter by asset type")] = None,
    status: Annotated[Optional[AssetStatus], Query(description="Filter by status")] = None,
    parent_id: Annotated[Optional[uuid.UUID], Query(description="Filter by parent ID")] = None,
    tag: Annotated[Optional[str], Query(description="Filter by tag")] = None,
    manufacturer: Annotated[Optional[str], Query(description="Filter by manufacturer")] = None,
    external_id: Annotated[Optional[str], Query(description="Filter by legacy external ID")] = None,
    limit: Annotated[int, Query(ge=1, le=500)] = 50,
    offset: Annotated[int, Query(ge=0)] = 0,
    service: AssetService = Depends(get_asset_service),
    user: Optional[CurrentUser] = Depends(get_optional_user),
):
    await check_rate_limit(request)

    search = AssetSearchRequest(
        name=name, type=type, status=status, parent_id=parent_id,
        tag=tag, manufacturer=manufacturer, external_id=external_id,
        limit=limit, offset=offset,
    )
    assets, total = await service.list_assets(search)

    # Scope filtering
    if user and user.role != "Admin":
        assets = [a for a in assets if user.has_scope_for_asset(a.type, a.external_id)]

    return AssetListResponse(
        items=[AssetResponse.model_validate(a) for a in assets],
        total=total, limit=limit, offset=offset,
    )


# ===================================================================
# Tree / Hierarchy
# ===================================================================

@router.post("/tree", response_model=List[AssetTreeNode])
async def get_asset_tree(
    req: AssetTreeRequest,
    service: AssetService = Depends(get_asset_service),
):
    return await service.get_asset_tree(req.root_id, req.depth)


@router.get("/{asset_id}/children", response_model=List[AssetResponse])
async def get_asset_children(
    asset_id: uuid.UUID,
    service: AssetService = Depends(get_asset_service),
):
    if not await service.get_asset(asset_id):
        raise HTTPException(status_code=404, detail=f"Asset {asset_id} not found")
    children = await service.get_children(asset_id)
    return [AssetResponse.model_validate(c) for c in children]


@router.get("/{asset_id}/ancestors", response_model=List[AssetResponse])
async def get_asset_ancestors(
    asset_id: uuid.UUID,
    service: AssetService = Depends(get_asset_service),
):
    if not await service.get_asset(asset_id):
        raise HTTPException(status_code=404, detail=f"Asset {asset_id} not found")
    ancestors = await service.get_ancestors(asset_id)
    return [AssetResponse.model_validate(a) for a in ancestors]


# ===================================================================
# Relationships
# ===================================================================

@router.post("/relationships", response_model=RelationshipResponse, status_code=status.HTTP_201_CREATED)
async def create_relationship(
    req: RelationshipCreateRequest,
    service: AssetService = Depends(get_asset_service),
    user: CurrentUser = Depends(get_current_user),
):
    if not user.can_write():
        raise HTTPException(status_code=403, detail="Write access denied")
    if req.asset_id == req.related_asset_id:
        raise HTTPException(status_code=400, detail="Cannot self-reference")
    if not await service.get_asset(req.asset_id):
        raise HTTPException(status_code=404, detail=f"Asset {req.asset_id} not found")
    if not await service.get_asset(req.related_asset_id):
        raise HTTPException(status_code=404, detail=f"Related asset {req.related_asset_id} not found")
    rel = await service.create_relationship(req)
    return RelationshipResponse.model_validate(rel)


@router.get("/{asset_id}/relationships", response_model=List[RelationshipResponse])
async def list_relationships(
    asset_id: uuid.UUID,
    rel_type: Optional[RelationshipType] = None,
    service: AssetService = Depends(get_asset_service),
):
    if not await service.get_asset(asset_id):
        raise HTTPException(status_code=404, detail=f"Asset {asset_id} not found")
    rels = await service.list_relationships(asset_id, rel_type)
    return [RelationshipResponse.model_validate(r) for r in rels]


@router.delete("/relationships/{rel_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_relationship(
    rel_id: uuid.UUID,
    service: AssetService = Depends(get_asset_service),
    user: CurrentUser = Depends(get_current_user),
):
    if not user.can_delete():
        raise HTTPException(status_code=403, detail="Delete access denied")
    deleted = await service.delete_relationship(rel_id)
    if not deleted:
        raise HTTPException(status_code=404, detail=f"Relationship {rel_id} not found")


# ===================================================================
# Document Linking
# ===================================================================

@router.post("/documents/link", response_model=DocumentLinkResponse, status_code=status.HTTP_201_CREATED)
async def link_document(
    req: DocumentLinkRequest,
    service: AssetService = Depends(get_asset_service),
    user: CurrentUser = Depends(get_current_user),
):
    if not user.can_write():
        raise HTTPException(status_code=403, detail="Write access denied")
    if not await service.get_asset(req.asset_id):
        raise HTTPException(status_code=404, detail=f"Asset {req.asset_id} not found")
    doc = await service.link_document(req, user_id=user.user_id)
    return DocumentLinkResponse.model_validate(doc)


@router.get("/{asset_id}/documents", response_model=List[DocumentLinkResponse])
async def list_asset_documents(
    asset_id: uuid.UUID,
    service: AssetService = Depends(get_asset_service),
):
    if not await service.get_asset(asset_id):
        raise HTTPException(status_code=404, detail=f"Asset {asset_id} not found")
    docs = await service.list_asset_documents(asset_id)
    return [DocumentLinkResponse.model_validate(d) for d in docs]


@router.delete("/{asset_id}/documents/{document_id}", status_code=status.HTTP_204_NO_CONTENT)
async def unlink_document(
    asset_id: uuid.UUID,
    document_id: str,
    service: AssetService = Depends(get_asset_service),
    user: CurrentUser = Depends(get_current_user),
):
    if not user.can_write():
        raise HTTPException(status_code=403, detail="Write access denied")
    deleted = await service.unlink_document(asset_id, document_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Document link not found")


# ===================================================================
# Health Score (Sprint C3)
# ===================================================================

@router.get("/{asset_id}/health", response_model=HealthScoreResponse)
async def get_asset_health(
    asset_id: uuid.UUID,
    service: AssetService = Depends(get_asset_service),
    user: Optional[CurrentUser] = Depends(get_optional_user),
):
    if not await service.get_asset(asset_id):
        raise HTTPException(status_code=404, detail=f"Asset {asset_id} not found")
    return await service.compute_health_score(asset_id)


@router.get("/{asset_id}/health/history", response_model=HealthScoreHistoryResponse)
async def get_health_history(
    asset_id: uuid.UUID,
    limit: int = Query(default=100, ge=1, le=1000),
    service: AssetService = Depends(get_asset_service),
):
    if not await service.get_asset(asset_id):
        raise HTTPException(status_code=404, detail=f"Asset {asset_id} not found")
    history = await service.get_health_history(asset_id, limit)
    return HealthScoreHistoryResponse(asset_id=asset_id, items=history, total=len(history))


@router.post("/health/refresh", status_code=status.HTTP_202_ACCEPTED)
async def refresh_health_scores(
    request: Request,
    asset_ids: Optional[List[uuid.UUID]] = None,
    service: AssetService = Depends(get_asset_service),
    user: CurrentUser = Depends(get_current_user),
):
    if not user.can_update_health():
        raise HTTPException(status_code=403, detail="Health refresh access denied")

    now = datetime.now(timezone.utc)
    count = 0

    if asset_ids:
        for aid in asset_ids:
            score = await service.compute_health_score(aid, now)
            await service.save_health_score(aid, score)
            count += 1
    else:
        from sqlalchemy import select
        from app.models.asset import Asset
        result = await service.session.execute(select(Asset.id))
        for row in result.all():
            score = await service.compute_health_score(row.id, now)
            await service.save_health_score(row.id, score)
            count += 1

    return {"refreshed": count, "at": now.isoformat()}


# ===================================================================
# Stats
# ===================================================================

@router.get("/stats/summary")
async def get_asset_stats(
    service: AssetService = Depends(get_asset_service),
):
    return await service.get_stats()
