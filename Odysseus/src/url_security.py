"""URL validation helpers for untrusted public outbound endpoints.

Uses ``url_safety.check_outbound_url(block_private=True)`` as the single SSRF
IP policy, plus a hostname denylist for cloud metadata / internal suffixes.

``_resolve_hostname_ips`` remains a patch point for unit tests.
"""

from __future__ import annotations

import ipaddress
import socket
from urllib.parse import urlparse

from src.url_safety import check_outbound_url

_INTERNAL_HOSTNAMES = {
    "localhost",
    "metadata",
    "metadata.google.internal",
}

_INTERNAL_SUFFIXES = (
    ".localhost",
    ".local",
    ".internal",
    ".lan",
    ".intranet",
)


def _resolve_hostname_ips(hostname: str) -> list[ipaddress._BaseAddress]:
    """Resolve hostname → IPs. Tests monkeypatch this name."""
    ips: list[ipaddress._BaseAddress] = []
    for family, _, _, _, sockaddr in socket.getaddrinfo(hostname, None):
        if family in (socket.AF_INET, socket.AF_INET6):
            ips.append(ipaddress.ip_address(sockaddr[0]))
    return ips


def _resolver_for_safety(host: str) -> list[str]:
    """Adapter: url_safety expects string IPs; we expose IP objects for tests."""
    return [str(ip) for ip in _resolve_hostname_ips(host)]


def is_public_http_url(url: str) -> bool:
    cleaned = (url or "").strip()
    parsed = urlparse(cleaned)
    if parsed.scheme not in ("http", "https") or not parsed.hostname:
        return False
    host = parsed.hostname.strip().lower()
    if host in _INTERNAL_HOSTNAMES or host.endswith(_INTERNAL_SUFFIXES):
        return False
    ok, _ = check_outbound_url(
        cleaned,
        block_private=True,
        resolver=_resolver_for_safety,
    )
    return ok


def validate_public_http_url(url: str, *, max_length: int = 2048) -> str:
    """Validate a user/API-token supplied server-side HTTP(S) endpoint.

    This is for untrusted outbound URLs, not admin-created model endpoints
    that are intentionally allowed to point at private model providers. DNS
    failures fail closed, and DNS checks reduce obvious private-network
    targets but do not eliminate every DNS rebinding race by themselves.
    """
    cleaned = (url or "").strip()
    if len(cleaned) > max_length:
        raise ValueError("URL is too long")
    if not is_public_http_url(cleaned):
        raise ValueError("URL must point to a public HTTP(S) endpoint")
    return cleaned
