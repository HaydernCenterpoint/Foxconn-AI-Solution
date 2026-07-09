"""Health score scheduled job — runs every 15 minutes.
Computes health score for all active assets and saves to asset_metrics.

Schedule: every 15 minutes via APScheduler or external cron.
Usage:
  python -m app.scripts.health_score_job
  Or run as a background task: python -m app.scripts.health_score_job --daemon
"""
from __future__ import annotations

import argparse
import asyncio
import logging
import time
from datetime import datetime, timezone

from sqlalchemy import select, and_

from app.db.database import get_db_session
from app.models.asset import Asset, AssetMetric
from app.services.asset_service import AssetService

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s — %(message)s",
)
logger = logging.getLogger("health_score_job")


async def refresh_all_health_scores():
    """Compute and save health scores for all active assets."""
    now = datetime.now(timezone.utc)
    logger.info(f"Starting health score refresh at {now.isoformat()}")

    async with get_db_session() as session:
        # Get all active assets
        result = await session.execute(
            select(Asset).where(Asset.status == "active")
        )
        assets = list(result.scalars().all())

        logger.info(f"Computing health scores for {len(assets)} assets...")
        service = AssetService(session)
        success_count = 0
        error_count = 0

        for asset in assets:
            try:
                score = await service.compute_health_score(asset.id, now)
                await service.save_health_score(asset.id, score)
                success_count += 1
                logger.debug(
                    f"  {asset.name} ({asset.type}): "
                    f"health={score.health_score}, uptime={score.uptime_pct}%, "
                    f"alarms={score.alarm_frequency}, perf={score.performance_pct}%"
                )
            except Exception as e:
                error_count += 1
                logger.error(f"  Failed to compute health for {asset.name} ({asset.id}): {e}")

        await session.commit()

        logger.info(
            f"Health score refresh complete: "
            f"{success_count} succeeded, {error_count} failed"
        )
        return success_count, error_count


async def run_daemon(interval_minutes: int = 15):
    """Run as a background daemon, refreshing health scores every N minutes."""
    logger.info(f"Starting health score daemon (interval: {interval_minutes} min)")
    while True:
        try:
            await refresh_all_health_scores()
        except Exception as e:
            logger.exception(f"Daemon error: {e}")
        logger.info(f"Sleeping for {interval_minutes} minutes...")
        await asyncio.sleep(interval_minutes * 60)


async def refresh_single_asset(asset_id: str):
    """Refresh health score for a single asset."""
    import uuid
    try:
        aid = uuid.UUID(asset_id)
    except ValueError:
        logger.error(f"Invalid UUID: {asset_id}")
        return

    now = datetime.now(timezone.utc)
    async with get_db_session() as session:
        service = AssetService(session)
        asset = await service.get_asset(aid)
        if not asset:
            logger.error(f"Asset not found: {asset_id}")
            return

        score = await service.compute_health_score(aid, now)
        await service.save_health_score(aid, score)
        await session.commit()
        logger.info(
            f"Asset: {asset.name}\n"
            f"  Health Score: {score.health_score}/100\n"
            f"  Uptime: {score.uptime_pct}%\n"
            f"  Alarm Frequency: {score.alarm_frequency}\n"
            f"  Performance: {score.performance_pct}%\n"
            f"  Maintenance Overdue: {score.maintenance_overdue}\n"
            f"  Breakdown: {score.breakdown}"
        )


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Asset Health Score Job")
    parser.add_argument("--daemon", action="store_true", help="Run as background daemon")
    parser.add_argument("--interval", type=int, default=15, help="Daemon interval in minutes (default: 15)")
    parser.add_argument("--asset-id", type=str, help="Compute health score for a single asset UUID")
    args = parser.parse_args()

    if args.asset_id:
        asyncio.run(refresh_single_asset(args.asset_id))
    elif args.daemon:
        asyncio.run(run_daemon(args.interval))
    else:
        asyncio.run(refresh_all_health_scores())
