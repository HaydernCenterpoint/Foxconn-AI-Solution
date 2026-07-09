"""Rate limiting middleware using in-memory sliding window.
Sprint C4: Access Control & Hardening.
"""
from __future__ import annotations

import asyncio
import time
from collections import defaultdict
from typing import Dict, Tuple

from fastapi import HTTPException, Request, status


class RateLimiter:
    """Simple in-memory sliding window rate limiter.
    For production, use Redis-based rate limiting (see architecture: redis service).
    """

    def __init__(self, requests_per_minute: int = 60):
        self.rpm = requests_per_minute
        self.window_secs = 60
        self._requests: Dict[str, list] = defaultdict(list)
        self._lock = asyncio.Lock()

    async def is_allowed(self, key: str) -> Tuple[bool, int, int]:
        """Returns (allowed, remaining, reset_in_seconds)."""
        async with self._lock:
            now = time.time()
            cutoff = now - self.window_secs

            # Prune old entries
            self._requests[key] = [ts for ts in self._requests[key] if ts > cutoff]

            if len(self._requests[key]) >= self.rpm:
                oldest = min(self._requests[key])
                reset_in = int(oldest + self.window_secs - now) + 1
                return False, 0, max(1, reset_in)

            self._requests[key].append(now)
            remaining = self.rpm - len(self._requests[key])
            return True, remaining, self.window_secs


# Global limiter instances
_default_limiter = RateLimiter(requests_per_minute=60)
_search_limiter = RateLimiter(requests_per_minute=30)


async def check_rate_limit(request: Request, limiter: RateLimiter = _default_limiter):
    """Dependency to enforce rate limits per IP."""
    client_ip = request.client.host if request.client else "unknown"
    allowed, remaining, reset_in = await limiter.is_allowed(client_ip)

    if not allowed:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=f"Rate limit exceeded. Try again in {reset_in} seconds.",
            headers={
                "X-RateLimit-Limit": str(limiter.rpm),
                "X-RateLimit-Remaining": "0",
                "X-RateLimit-Reset": str(reset_in),
                "Retry-After": str(reset_in),
            },
        )
    return remaining
