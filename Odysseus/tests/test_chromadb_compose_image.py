"""Static regression guard for the Chroma client/server API compatibility."""

import re
from pathlib import Path

import yaml


COMPOSE = Path(__file__).resolve().parent.parent / "docker-compose.yml"
BACKEND_DOCKERFILE = Path(__file__).resolve().parents[2] / "backend" / "Dockerfile"
SYNC_DOCKERFILE = Path(__file__).resolve().parent.parent / "Dockerfile.sync"
REQUIREMENTS = Path(__file__).resolve().parent.parent / "requirements.txt"
CHROMA_IMAGE = (
    "chromadb/chroma@sha256:"
    "1e0b73a187a28757c572acba508c46f48c9e8b0acaf5c20e6d95cdedce1acdf6"
)


def _environment_by_name(service: dict) -> dict[str, str]:
    """Turn Compose's list-style environment declaration into a stable mapping."""
    return {
        name: value
        for entry in service["environment"]
        for name, value in [entry.split("=", 1)]
    }


def test_standard_compose_uses_v2_compatible_chroma_image():
    compose = yaml.safe_load(COMPOSE.read_text(encoding="utf-8"))
    chromadb = compose["services"]["chromadb"]
    image = chromadb["image"]

    assert not re.search(r":0(?:\.\d+)+", image), (
        "Standard compose must not pin a legacy Chroma 0.x server because the "
        "installed client uses the v2 API."
    )
    assert image == CHROMA_IMAGE
    assert chromadb["volumes"] == ["chromadb-data:/data"]
    healthcheck = chromadb["healthcheck"]["test"]
    assert healthcheck[0] == "CMD-SHELL"
    assert "curl" not in healthcheck[1]
    assert "/dev/tcp/127.0.0.1/8000" in healthcheck[1]


def test_standard_compose_isolates_the_factory_database_and_uses_loopback_ports():
    compose = yaml.safe_load(COMPOSE.read_text(encoding="utf-8"))
    services = compose["services"]
    database = services["mkz-db"]
    backend = services["mkz-backend"]
    db_network = "mkz-backend-db"

    assert database["networks"] == [db_network]
    assert set(backend["networks"]) == {"mkz-network", db_network}
    assert db_network not in services["odysseus"]["networks"]
    assert db_network not in services["mkz-sync"]["networks"]
    assert compose["networks"][db_network]["internal"] is True
    assert "ports" not in database

    assert backend["ports"] == ["127.0.0.1:5165:8080"]
    assert services["odysseus"]["ports"] == ["127.0.0.1:7000:7000"]
    assert services["chromadb"]["ports"] == ["127.0.0.1:8100:8000"]

    source = COMPOSE.read_text(encoding="utf-8")
    assert "12345678" not in source
    assert _environment_by_name(database)["POSTGRES_PASSWORD"] == "${MKZ_DB_PASSWORD:-}"
    assert "Password=${MKZ_DB_PASSWORD:-}" in _environment_by_name(backend)[
        "ConnectionStrings__DefaultConnection"
    ]


def test_standard_compose_uses_the_rest_bridge_for_odysseus_and_scheduled_sync():
    compose = yaml.safe_load(COMPOSE.read_text(encoding="utf-8"))
    odysseus = compose["services"]["odysseus"]
    sync = compose["services"]["mkz-sync"]

    for service in (odysseus, sync):
        environment = _environment_by_name(service)
        assert environment["MKZ_BACKEND_URL"] == "http://mkz-backend:8080"
        assert "MKZ_BACKEND_TOKEN" not in environment
        assert not any(name.startswith("MKZ_DB_") for name in environment)

    sync_environment = _environment_by_name(sync)
    assert sync_environment["CHROMADB_HOST"] == "chromadb"
    assert sync_environment["CHROMADB_PORT"] == "8000"
    assert sync_environment["HF_HUB_DISABLE_XET"] == "${HF_HUB_DISABLE_XET:-}"
    assert {"mkz-network", "odysseus-internal"} == set(sync["networks"])
    assert sync["depends_on"]["mkz-backend"]["condition"] == "service_healthy"
    assert sync["depends_on"]["chromadb"]["condition"] == "service_healthy"

    command = " ".join(sync["command"])
    assert "sync_mkz_to_odysseus.py" in command
    assert "sleep" in command
    assert "SYNC_INTERVAL_SECONDS" in command
    assert "3600" in sync_environment["SYNC_INTERVAL_SECONDS"]


def test_compose_backend_image_is_buildable_from_a_net9_multistage_dockerfile():
    source = BACKEND_DOCKERFILE.read_text(encoding="utf-8")

    assert "mcr.microsoft.com/dotnet/sdk:9.0" in source
    assert "mcr.microsoft.com/dotnet/aspnet:9.0" in source
    assert "backend.csproj" in source
    assert "dotnet publish" in source
    assert "curl" in source
    assert "EXPOSE 8080" in source
    assert 'ENTRYPOINT ["dotnet", "backend.dll"]' in source


def test_sync_image_contains_the_local_rag_packages_and_pinned_chroma_client():
    source = SYNC_DOCKERFILE.read_text(encoding="utf-8")
    requirements = REQUIREMENTS.read_text(encoding="utf-8")

    assert "COPY scripts /app/scripts" in source
    assert "COPY src /app/src" in source
    # A configured embedding endpoint may have an encrypted API key; its
    # persisted-configuration fallback imports core.platform_compat.
    assert "COPY core /app/core" in source
    assert "PYTHONPATH=/app" in source
    assert "chromadb-client==1.5.9" in requirements
    assert "psycopg2-binary" not in requirements
