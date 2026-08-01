"""Unit tests for Asset CRUD API."""
from __future__ import annotations

import uuid

import pytest
from httpx import AsyncClient


@pytest.mark.asyncio
class TestAssetCRUD:

    async def test_create_requires_authentication(
        self,
        unauthenticated_client: AsyncClient,
        sample_plant_data: dict,
    ):
        """Production auth remains enforced when no test override is installed."""
        response = await unauthenticated_client.post(
            "/api/v1/assets",
            json=sample_plant_data,
        )

        assert response.status_code == 401
        assert response.headers["content-type"].startswith("application/problem+json")
        assert response.json()["detail"] == "Missing authentication"

    async def test_invalid_optional_token_is_not_downgraded_to_anonymous(
        self,
        unauthenticated_client: AsyncClient,
    ):
        """A supplied invalid token cannot bypass asset scope filtering."""
        response = await unauthenticated_client.get(
            "/api/v1/assets",
            headers={"Authorization": "Bearer invalid-token"},
        )

        assert response.status_code == 401
        assert response.headers["content-type"].startswith("application/problem+json")
        assert response.json()["detail"] == "Invalid authentication token"

    async def test_create_plant(self, client: AsyncClient, sample_plant_data: dict):
        """Plants can be created with no parent."""
        response = await client.post("/api/v1/assets", json=sample_plant_data)
        assert response.status_code == 201
        data = response.json()
        assert data["name"] == "Test Plant"
        assert data["type"] == "plant"
        assert data["status"] == "active"
        assert data["parent_id"] is None
        assert data["metadata"] == {"capacity": "1000 units/day"}
        assert "id" in data

    async def test_create_machine_requires_parent(self, client: AsyncClient, sample_plant_data: dict):
        """Machines must have a parent_id."""
        # Create the required plant → line parent chain.
        plant_resp = await client.post("/api/v1/assets", json=sample_plant_data)
        plant_id = plant_resp.json()["id"]
        line_resp = await client.post(
            "/api/v1/assets",
            json={"name": "Parent Line", "type": "line", "parent_id": plant_id},
        )
        line_id = line_resp.json()["id"]

        machine_data = {
            "name": "Test Machine",
            "type": "machine",
            "parent_id": line_id,
        }
        response = await client.post("/api/v1/assets", json=machine_data)
        assert response.status_code == 201
        data = response.json()
        assert data["parent_id"] == line_id

    async def test_create_machine_without_parent_fails(self, client: AsyncClient, sample_plant_data: dict):
        """Machine without parent returns validation error."""
        machine_data = {"name": "Orphan Machine", "type": "machine"}
        response = await client.post("/api/v1/assets", json=machine_data)

        assert response.status_code == 422
        assert response.headers["content-type"].startswith("application/problem+json")
        assert "require a parent" in str(response.json()["extensions"]["errors"])

    async def test_create_plant_with_parent_fails(self, client: AsyncClient):
        """Plant is the hierarchy root and cannot reference a parent."""
        response = await client.post(
            "/api/v1/assets",
            json={
                "name": "Nested Plant",
                "type": "plant",
                "parent_id": str(uuid.uuid4()),
            },
        )

        assert response.status_code == 422
        assert "cannot have a parent" in str(response.json()["extensions"]["errors"])

    async def test_create_rejects_invalid_parent_type(
        self,
        client: AsyncClient,
        sample_plant_data: dict,
    ):
        """Hierarchy enforces Plant → Line → Machine → Sensor."""
        plant_response = await client.post("/api/v1/assets", json=sample_plant_data)
        plant_id = plant_response.json()["id"]
        line_response = await client.post(
            "/api/v1/assets",
            json={"name": "Line A", "type": "line", "parent_id": plant_id},
        )
        line_id = line_response.json()["id"]

        invalid_requests = [
            {"name": "Nested Line", "type": "line", "parent_id": line_id},
            {"name": "Machine under plant", "type": "machine", "parent_id": plant_id},
            {"name": "Sensor under line", "type": "sensor", "parent_id": line_id},
        ]

        for payload in invalid_requests:
            response = await client.post("/api/v1/assets", json=payload)
            assert response.status_code == 400
            assert "require a" in response.json()["detail"]

    async def test_get_asset_by_id(self, client: AsyncClient, sample_plant_data: dict):
        """GET returns the correct asset."""
        create_resp = await client.post("/api/v1/assets", json=sample_plant_data)
        asset_id = create_resp.json()["id"]

        get_resp = await client.get(f"/api/v1/assets/{asset_id}")
        assert get_resp.status_code == 200
        assert get_resp.json()["id"] == asset_id
        assert get_resp.json()["name"] == "Test Plant"

    async def test_get_asset_not_found(self, client: AsyncClient):
        """GET for non-existent asset returns 404."""
        fake_id = str(uuid.uuid4())
        response = await client.get(f"/api/v1/assets/{fake_id}")
        assert response.status_code == 404

    async def test_update_asset(self, client: AsyncClient, sample_plant_data: dict):
        """PUT updates asset fields correctly."""
        create_resp = await client.post("/api/v1/assets", json=sample_plant_data)
        asset_id = create_resp.json()["id"]

        update_resp = await client.put(
            f"/api/v1/assets/{asset_id}",
            json={"status": "maintenance", "metadata": {"note": "updated"}},
        )
        assert update_resp.status_code == 200
        data = update_resp.json()
        assert data["status"] == "maintenance"
        assert data["metadata"] == {
            "capacity": "1000 units/day",
            "note": "updated",
        }

    async def test_delete_asset(self, client: AsyncClient, sample_plant_data: dict):
        """DELETE removes the asset."""
        create_resp = await client.post("/api/v1/assets", json=sample_plant_data)
        asset_id = create_resp.json()["id"]

        del_resp = await client.delete(f"/api/v1/assets/{asset_id}")
        assert del_resp.status_code == 204

        get_resp = await client.get(f"/api/v1/assets/{asset_id}")
        assert get_resp.status_code == 404

    async def test_list_assets_pagination(self, client: AsyncClient, sample_plant_data: dict):
        """GET list returns correct pagination metadata."""
        # Create 5 plants
        for i in range(5):
            data = sample_plant_data.copy()
            data["name"] = f"Plant {i}"
            await client.post("/api/v1/assets", json=data)

        resp = await client.get("/api/v1/assets?limit=2&offset=0")
        assert resp.status_code == 200
        data = resp.json()
        assert len(data["items"]) == 2
        assert data["total"] >= 5
        assert data["limit"] == 2
        assert data["offset"] == 0

    async def test_list_assets_filter_by_type(self, client: AsyncClient, sample_plant_data: dict):
        """List filtering by type works."""
        # Create a plant and a line
        plant_response = await client.post("/api/v1/assets", json=sample_plant_data)
        line_response = await client.post(
            "/api/v1/assets",
            json={
                "name": "Test Line",
                "type": "line",
                "parent_id": plant_response.json()["id"],
            },
        )
        assert line_response.status_code == 201

        resp = await client.get("/api/v1/assets?type=plant")
        assert resp.status_code == 200
        items = resp.json()["items"]
        assert items
        assert all(item["type"] == "plant" for item in items)
        assert all(item["name"] != "Test Line" for item in items)

    async def test_list_assets_filter_by_name(self, client: AsyncClient, sample_plant_data: dict):
        """Name search is case-insensitive partial match."""
        for name in ["Alpha Plant", "Beta Plant", "Gamma Plant"]:
            data = sample_plant_data.copy()
            data["name"] = name
            await client.post("/api/v1/assets", json=data)

        resp = await client.get("/api/v1/assets?name=alpha")
        assert resp.status_code == 200
        items = resp.json()["items"]
        assert any(item["name"] == "Alpha Plant" for item in items)


@pytest.mark.asyncio
class TestAssetHierarchy:

    async def test_asset_tree(self, client: AsyncClient, sample_plant_data: dict):
        """Tree endpoint returns hierarchical structure."""
        # Create plant -> line -> machine
        plant_resp = await client.post("/api/v1/assets", json=sample_plant_data)
        plant_id = plant_resp.json()["id"]

        line_data = {"name": "Test Line", "type": "line", "parent_id": plant_id}
        line_resp = await client.post("/api/v1/assets", json=line_data)
        line_id = line_resp.json()["id"]

        machine_data = {"name": "Test Machine", "type": "machine", "parent_id": line_id}
        await client.post("/api/v1/assets", json=machine_data)

        # Get tree from plant
        tree_resp = await client.post("/api/v1/assets/tree", json={"root_id": plant_id, "depth": 3})
        assert tree_resp.status_code == 200
        tree = tree_resp.json()
        assert len(tree) == 1
        assert tree[0]["name"] == "Test Plant"
        assert len(tree[0]["children"]) == 1
        assert tree[0]["children"][0]["name"] == "Test Line"
        assert len(tree[0]["children"][0]["children"]) == 1

    async def test_get_children(self, client: AsyncClient, sample_plant_data: dict):
        """GET children returns direct children."""
        plant_resp = await client.post("/api/v1/assets", json=sample_plant_data)
        plant_id = plant_resp.json()["id"]

        for i in range(3):
            child_data = {"name": f"Child {i}", "type": "line", "parent_id": plant_id}
            await client.post("/api/v1/assets", json=child_data)

        children_resp = await client.get(f"/api/v1/assets/{plant_id}/children")
        assert children_resp.status_code == 200
        children = children_resp.json()
        assert len(children) == 3

    async def test_get_ancestors(self, client: AsyncClient, sample_plant_data: dict):
        """GET ancestors returns full path from root."""
        # Plant -> Line -> Machine
        plant_resp = await client.post("/api/v1/assets", json=sample_plant_data)
        plant_id = plant_resp.json()["id"]

        line_data = {"name": "Ancestor Line", "type": "line", "parent_id": plant_id}
        line_resp = await client.post("/api/v1/assets", json=line_data)
        line_id = line_resp.json()["id"]

        machine_data = {"name": "Leaf Machine", "type": "machine", "parent_id": line_id}
        machine_resp = await client.post("/api/v1/assets", json=machine_data)
        machine_id = machine_resp.json()["id"]

        ancestors_resp = await client.get(f"/api/v1/assets/{machine_id}/ancestors")
        assert ancestors_resp.status_code == 200
        ancestors = ancestors_resp.json()
        assert len(ancestors) == 2
        assert ancestors[0]["name"] == "Ancestor Line"
        assert ancestors[1]["name"] == "Test Plant"


@pytest.mark.asyncio
class TestRelationships:

    async def test_create_relationship(self, client: AsyncClient, sample_plant_data: dict):
        """Can create relationship between assets."""
        p1_resp = await client.post("/api/v1/assets", json=sample_plant_data)
        p1_id = p1_resp.json()["id"]

        p2_data = {**sample_plant_data, "name": "Plant 2"}
        p2_resp = await client.post("/api/v1/assets", json=p2_data)
        p2_id = p2_resp.json()["id"]

        rel_data = {
            "asset_id": p1_id,
            "related_asset_id": p2_id,
            "relationship_type": "upstream",
            "description": "Plant 2 is upstream",
        }
        rel_resp = await client.post("/api/v1/assets/relationships", json=rel_data)
        assert rel_resp.status_code == 201
        assert rel_resp.json()["relationship_type"] == "upstream"

    async def test_cannot_self_reference(self, client: AsyncClient, sample_plant_data: dict):
        """Self-referential relationship returns 400."""
        p1_resp = await client.post("/api/v1/assets", json=sample_plant_data)
        p1_id = p1_resp.json()["id"]

        rel_data = {
            "asset_id": p1_id,
            "related_asset_id": p1_id,
            "relationship_type": "upstream",
        }
        rel_resp = await client.post("/api/v1/assets/relationships", json=rel_data)
        assert rel_resp.status_code == 400

    async def test_list_relationships(self, client: AsyncClient, sample_plant_data: dict):
        """Can list relationships for an asset."""
        p1_resp = await client.post("/api/v1/assets", json=sample_plant_data)
        p1_id = p1_resp.json()["id"]

        p2_data = {**sample_plant_data, "name": "Related Plant"}
        p2_resp = await client.post("/api/v1/assets", json=p2_data)
        p2_id = p2_resp.json()["id"]

        await client.post("/api/v1/assets/relationships", json={
            "asset_id": p1_id,
            "related_asset_id": p2_id,
            "relationship_type": "downstream",
        })

        list_resp = await client.get(f"/api/v1/assets/{p1_id}/relationships")
        assert list_resp.status_code == 200
        assert len(list_resp.json()) == 1


@pytest.mark.asyncio
class TestDocumentLinking:

    async def test_link_document(self, client: AsyncClient, sample_plant_data: dict):
        """Can link a document to an asset."""
        plant_resp = await client.post("/api/v1/assets", json=sample_plant_data)
        plant_id = plant_resp.json()["id"]

        link_data = {
            "asset_id": plant_id,
            "document_id": "doc-test-123",
            "relationship": "manual",
            "title": "Plant Manual",
            "version": "1.0",
        }
        link_resp = await client.post("/api/v1/assets/documents/link", json=link_data)
        assert link_resp.status_code == 201
        assert link_resp.json()["document_id"] == "doc-test-123"

    async def test_list_asset_documents(self, client: AsyncClient, sample_plant_data: dict):
        """Can list documents linked to an asset."""
        plant_resp = await client.post("/api/v1/assets", json=sample_plant_data)
        plant_id = plant_resp.json()["id"]

        for doc_id in ["doc-1", "doc-2"]:
            await client.post("/api/v1/assets/documents/link", json={
                "asset_id": plant_id,
                "document_id": doc_id,
                "relationship": "related",
            })

        list_resp = await client.get(f"/api/v1/assets/{plant_id}/documents")
        assert list_resp.status_code == 200
        assert len(list_resp.json()) == 2


@pytest.mark.asyncio
class TestHealthScore:

    async def test_compute_health_score(self, client: AsyncClient, sample_plant_data: dict):
        """Health score endpoint returns computed score."""
        plant_resp = await client.post("/api/v1/assets", json=sample_plant_data)
        plant_id = plant_resp.json()["id"]

        health_resp = await client.get(f"/api/v1/assets/{plant_id}/health")
        assert health_resp.status_code == 200
        data = health_resp.json()
        assert "health_score" in data
        assert 0 <= data["health_score"] <= 100
        assert "breakdown" in data
        assert "uptime_pct" in data["breakdown"]
        assert "alarm_score" in data["breakdown"]


@pytest.mark.asyncio
class TestValidation:

    async def test_invalid_asset_type(self, client: AsyncClient):
        """Invalid type returns 422."""
        response = await client.post("/api/v1/assets", json={
            "name": "Bad Asset",
            "type": "invalid_type",
        })
        assert response.status_code == 422

    async def test_invalid_status(self, client: AsyncClient, sample_plant_data: dict):
        """Invalid status returns 422."""
        plant_resp = await client.post("/api/v1/assets", json=sample_plant_data)
        plant_id = plant_resp.json()["id"]

        response = await client.put(
            f"/api/v1/assets/{plant_id}",
            json={"status": "invalid_status"},
        )
        assert response.status_code == 422

    async def test_name_too_long(self, client: AsyncClient):
        """Name exceeding 255 chars returns 422."""
        response = await client.post("/api/v1/assets", json={
            "name": "A" * 300,
            "type": "plant",
        })
        assert response.status_code == 422


@pytest.mark.asyncio
class TestErrorResponses:

    async def test_rfc7807_error_format(self, client: AsyncClient):
        """Errors follow RFC 7807 Problem Details format."""
        fake_id = str(uuid.uuid4())
        response = await client.get(f"/api/v1/assets/{fake_id}")
        assert response.status_code == 404
        data = response.json()
        assert "type" in data
        assert "title" in data
        assert "status" in data
