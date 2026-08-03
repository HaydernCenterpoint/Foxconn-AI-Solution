"""Production-boundary contracts for the infrastructure Compose files."""

import json
import os
from pathlib import Path
import re
import subprocess
import unittest


INFRASTRUCTURE_DIR = Path(__file__).resolve().parents[1]
COMPOSE = (INFRASTRUCTURE_DIR / "docker-compose.yml").read_text(encoding="utf-8")
ENV_EXAMPLE = (INFRASTRUCTURE_DIR / "env.example").read_text(encoding="utf-8")


def render_compose() -> dict:
    environment = os.environ.copy()
    environment.pop("POSTGRES_BIND_ADDRESS", None)
    environment.pop("MINIO_BIND_ADDRESS", None)
    for variable in re.findall(r"\$\{([A-Z][A-Z0-9_]*):\?", COMPOSE):
        environment[variable] = f"compose-test-{variable.lower()}"
    environment["ANTIGRAVITY_WORKSPACE_HOST_PATH"] = str(INFRASTRUCTURE_DIR.parent)

    result = subprocess.run(
        [
            "docker",
            "compose",
            "--file",
            str(INFRASTRUCTURE_DIR / "docker-compose.yml"),
            "config",
            "--format",
            "json",
        ],
        cwd=INFRASTRUCTURE_DIR,
        env=environment,
        check=True,
        capture_output=True,
        text=True,
    )
    return json.loads(result.stdout)


class ComposeContractTests(unittest.TestCase):
    def test_sensitive_data_ports_render_with_explicit_loopback_bindings(self) -> None:
        rendered = render_compose()
        sensitive_ports = {
            "postgres": {5432},
            "minio": {9000, 9001},
        }

        for service_name, expected_targets in sensitive_ports.items():
            ports = rendered["services"][service_name]["ports"]
            matching_ports = [
                port
                for port in ports
                if int(port["target"]) in expected_targets
            ]
            self.assertEqual(
                {int(port["target"]) for port in matching_ports},
                expected_targets,
            )
            for port in matching_ports:
                target = int(port["target"])
                with self.subTest(service=service_name, target=target):
                    host_ip = port.get("host_ip")
                    self.assertTrue(host_ip, "sensitive ports must specify a host IP")
                    self.assertIn(host_ip, {"127.0.0.1", "::1"})

    def test_production_mock_modes_are_guarded(self) -> None:
        self.assertIn('"$${MOCK_ANTIGRAVITY}" = "false"', COMPOSE)
        self.assertIn('"$${CEP_MODE}" = "live"', COMPOSE)
        self.assertEqual(COMPOSE.count('"$${DEPLOYMENT_MODE}" = "production"'), 2)
        self.assertEqual(COMPOSE.count('"$${DEPLOYMENT_MODE}" != "local-demo"'), 2)

    def test_mock_modes_have_no_compose_defaults(self) -> None:
        self.assertNotRegex(COMPOSE, r"MOCK_ANTIGRAVITY=\$\{MOCK_ANTIGRAVITY:-")
        self.assertNotRegex(COMPOSE, r"CEP_MODE=\$\{CEP_MODE:-")
        self.assertIn("MOCK_ANTIGRAVITY=${MOCK_ANTIGRAVITY:?", COMPOSE)
        self.assertIn("CEP_MODE=${CEP_MODE:?", COMPOSE)

    def test_workspace_mount_is_required_and_not_host_specific(self) -> None:
        self.assertNotIn("d:/nhnhnhnhnh", COMPOSE.lower())
        self.assertIn("source: ${ANTIGRAVITY_WORKSPACE_HOST_PATH:?", COMPOSE)
        self.assertIn("target: /workspace", COMPOSE)

    def test_external_endpoints_and_credentials_are_required(self) -> None:
        required_variables = (
            "ANTIGRAVITY_BRIDGE_URL",
            "BACKEND_URL",
            "LLM_API_URL",
            "MINIO_ROOT_USER",
            "MINIO_ROOT_PASSWORD",
            "POSTGRES_PASSWORD",
            "JWT_SECRET",
            "REPORT_SERVICE_API_KEY",
            "REPORT_DOWNLOAD_SIGNING_KEY",
            "REPORT_PUBLIC_BASE_URL",
            "REPORT_PUBLIC_HOST_ALLOWLIST",
        )
        for variable in required_variables:
            with self.subTest(variable=variable):
                self.assertRegex(COMPOSE, rf"\$\{{{variable}:\?")

        self.assertNotIn("http://host.docker.internal", COMPOSE)

    def test_report_service_is_explicitly_single_replica_and_production_mode(self) -> None:
        report_block = COMPOSE.split("  report-service:", 1)[1].split("\n  asset-service:", 1)[0]
        self.assertIn("replicas: 1", report_block)
        self.assertIn("REPORT_SERVICE_REPLICA_COUNT=1", report_block)
        self.assertIn("REPORT_SERVICE_MODE=production", report_block)
        self.assertIn("REPORT_SERVICE_API_KEY=${REPORT_SERVICE_API_KEY:?", report_block)
        self.assertIn("REPORT_DOWNLOAD_SIGNING_KEY=${REPORT_DOWNLOAD_SIGNING_KEY:?", report_block)
        self.assertIn("LOCAL_REPORTS_BASE_URL=${REPORT_PUBLIC_BASE_URL:?", report_block)
        self.assertIn("REPORT_PUBLIC_HOST_ALLOWLIST=${REPORT_PUBLIC_HOST_ALLOWLIST:?", report_block)
        self.assertIn("LOCAL_REPORTS_DIR=/var/lib/report-service", report_block)
        self.assertIn("report_service_data:/var/lib/report-service", report_block)
        self.assertNotIn("MINIO_", report_block)
        self.assertNotIn("depends_on:\n      minio:", report_block)

    def test_gateway_treats_report_service_as_optional_but_health_gated(self) -> None:
        gateway_block = COMPOSE.split("  factory-ai-gateway:", 1)[1].split("\n  antigravity-bridge:", 1)[0]
        self.assertIn("report-service:", gateway_block)
        self.assertIn("condition: service_healthy", gateway_block)
        self.assertIn("required: false", gateway_block)

    def test_env_example_is_explicitly_local_demo(self) -> None:
        self.assertIn("DEPLOYMENT_MODE=local-demo", ENV_EXAMPLE)
        self.assertIn("MOCK_ANTIGRAVITY=true", ENV_EXAMPLE)
        self.assertIn("CEP_MODE=mock", ENV_EXAMPLE)
        self.assertRegex(ENV_EXAMPLE, re.compile(r"^ANTIGRAVITY_WORKSPACE_HOST_PATH=.+$", re.MULTILINE))


if __name__ == "__main__":
    unittest.main()
