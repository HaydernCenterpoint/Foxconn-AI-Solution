"""Static regression guard for the development FastEmbed download workaround."""

from __future__ import annotations

from pathlib import Path

import yaml


ROOT = Path(__file__).resolve().parent.parent
ENV_TEMPLATE = ROOT / ".env.integration.example"
INTEGRATION_GUIDE = ROOT / "INTEGRATION.md"
COMPOSE = ROOT / "docker-compose.yml"


def _environment_keys(service: dict) -> set[str]:
    """Return Compose environment variable names for mapping and list forms."""
    environment = service.get("environment", [])
    if isinstance(environment, dict):
        return set(environment)
    return {entry.split("=", 1)[0] for entry in environment}


def test_development_config_disables_huggingface_xet_for_fastembed_consumers_only():
    """FastEmbed's development download path must avoid the hanging Xet client.

    The setting belongs only to the two FastEmbed consumers: the Odysseus
    application and the MKZ sync service. It must never reach ChromaDB.
    """
    env_template = ENV_TEMPLATE.read_text(encoding="utf-8")
    integration_guide = INTEGRATION_GUIDE.read_text(encoding="utf-8")
    compose = yaml.safe_load(COMPOSE.read_text(encoding="utf-8"))

    assert "HF_HUB_DISABLE_XET=1" in env_template
    assert "HF_HUB_DISABLE_XET=1" in integration_guide

    expected_setting = "HF_HUB_DISABLE_XET=${HF_HUB_DISABLE_XET:-}"
    for service_name in ("odysseus", "mkz-sync"):
        service_environment = compose["services"][service_name]["environment"]
        assert expected_setting in service_environment

    services_with_xet_setting = [
        name
        for name, service in compose["services"].items()
        if "HF_HUB_DISABLE_XET" in _environment_keys(service)
    ]
    assert services_with_xet_setting == ["odysseus", "mkz-sync"]
