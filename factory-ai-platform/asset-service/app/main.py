"""FastAPI main application — Asset Service."""
from __future__ import annotations

import os
from http import HTTPStatus

from fastapi import FastAPI, HTTPException, Request, status
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse


def _load_local_env():
    cur = os.path.dirname(os.path.abspath(__file__))
    for _ in range(5):
        env_file = os.path.join(cur, "..", "infrastructure", ".env")
        if os.path.exists(env_file):
            with open(env_file, "r", encoding="utf-8") as f:
                for line in f:
                    line = line.strip()
                    if not line or line.startswith("#"):
                        continue
                    if "=" in line:
                        k, v = line.split("=", 1)
                        os.environ.setdefault(k.strip(), v.strip().strip("'\"").strip())
            break
        parent = os.path.dirname(cur)
        if parent == cur:
            break
        cur = parent

_load_local_env()

# Local env loading must happen before routes import the database module.
from app.api.routes import router as assets_router  # noqa: E402

app = FastAPI(
    title="Asset Service",
    description=(
        "Asset hierarchy management for MKZ Factory Monitor. "
        "Provides CRUD, tree traversal, document linking, and health scoring. "
        "**asset_id (UUID) is the canonical reference used across all services.**"
    ),
    version="1.0.0",
    docs_url="/docs",
    redoc_url="/redoc",
    openapi_url="/openapi.json",
)

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request: Request, exc: RequestValidationError):
    errors = []
    for err in exc.errors():
        errors.append({
            "field": ".".join(str(loc) for loc in err["loc"]),
            "message": err["msg"],
            "type": err["type"],
        })
    return JSONResponse(
        status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
        media_type="application/problem+json",
        content={
            "type": "https://factory-monitor.example.com/errors/validation",
            "title": "Validation Error",
            "status": 422,
            "detail": "One or more fields failed validation",
            "instance": str(request.url),
            "extensions": {"errors": errors},
        },
    )


@app.exception_handler(HTTPException)
async def http_exception_handler(request: Request, exc: HTTPException):
    try:
        title = HTTPStatus(exc.status_code).phrase
    except ValueError:
        title = "HTTP Error"

    return JSONResponse(
        status_code=exc.status_code,
        media_type="application/problem+json",
        headers=exc.headers,
        content={
            "type": f"https://factory-monitor.example.com/errors/http-{exc.status_code}",
            "title": title,
            "status": exc.status_code,
            "detail": str(exc.detail),
            "instance": str(request.url),
        },
    )


@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    return JSONResponse(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        media_type="application/problem+json",
        content={
            "type": "https://factory-monitor.example.com/errors/internal",
            "title": "Internal Server Error",
            "status": 500,
            "detail": str(exc) if os.environ.get("DEBUG") else "An unexpected error occurred",
            "instance": str(request.url),
        },
    )


# Include routers
app.include_router(assets_router)


@app.get("/health")
async def health():
    return {"service": "asset-service", "status": "healthy"}


@app.get("/")
async def root():
    return {
        "service": "Asset Service",
        "version": "1.0.0",
        "docs": "/docs",
        "schema_contract": {
            "asset_id": "UUID — canonical reference across all services",
            "telemetry_schema": "(time, asset_id, metric, value)",
            "event_schema": "(event_id, timestamp, asset_id, type, severity, payload)",
            "api_convention": "REST /api/v1/assets, JWT Bearer, RFC 7807 errors",
        }
    }


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "app.main:app",
        host="0.0.0.0",
        port=8084,
        reload=True,
        log_level="info",
    )
