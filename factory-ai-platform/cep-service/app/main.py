"""
FastAPI entry point for the CEP Service.

Provides:
- Event ingestion API
- CEP rule management
- Alert management
- ML inference (anomaly detection, failure prediction)
- RCA endpoints
"""

import logging
import os
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api import ml_routes, routes
from app.ml.models import AnomalyDetector, FailurePredictor
from app.rules.engine import CEPEngine
from app.rules.rca import RCAService
from app.rules.sample_rules import ALL_RULES

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(name)s %(levelname)s %(message)s",
)
logger = logging.getLogger(__name__)

# Global instances
cep_engine = CEPEngine()
rca_service = RCAService()
anomaly_detector: AnomalyDetector | None = None
failure_predictor: FailurePredictor | None = None


@asynccontextmanager
async def lifespan(app: FastAPI):
    global anomaly_detector, failure_predictor

    # Initialize ML models
    logger.info("Initializing ML models...")
    anomaly_detector = AnomalyDetector()
    failure_predictor = FailurePredictor()

    # Register sample rules
    logger.info("Registering %d CEP rules...", len(ALL_RULES))
    for rule in ALL_RULES:
        cep_engine.register_rule(rule)

    # Start periodic evaluation
    await cep_engine.start_periodic_evaluation(interval_seconds=10.0)

    logger.info("CEP Service started successfully")
    yield

    # Shutdown
    await cep_engine.stop()
    logger.info("CEP Service shutdown complete")


app = FastAPI(
    title="Factory AI CEP Service",
    description="Complex Event Processing for MKZ Factory Monitor",
    version="1.0.0",
    lifespan=lifespan,
)

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Initialize routers with engine instances
routes.init_router(cep_engine, rca_service)
ml_routes.init_ml()

# Include routers
app.include_router(routes.router)
app.include_router(ml_routes.router)


@app.get("/health")
async def health():
    return {
        "status": "healthy",
        "service": "cep-service",
        "version": "1.0.0",
        "cep_rules_active": sum(
            1 for s in cep_engine._rules.values() if s.rule.status.value == "active"
        ),
        "ml_ready": anomaly_detector is not None,
    }


@app.get("/")
async def root():
    return {
        "service": "Factory AI CEP Service",
        "version": "1.0.0",
        "docs": "/docs",
        "health": "/health",
    }


if __name__ == "__main__":
    import uvicorn

    port = int(os.environ.get("CEP_PORT", "8084"))
    uvicorn.run("app.main:app", host="0.0.0.0", port=port, reload=True)
