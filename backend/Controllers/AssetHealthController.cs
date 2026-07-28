using System;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Logging;
using backend.Services;

namespace backend.Controllers
{
    [ApiController]
    [Route("api/v1/assets/{assetId}/health")]
    public class AssetHealthController : ControllerBase
    {
        private readonly HealthScoringService _healthService;
        private readonly ILogger<AssetHealthController> _logger;

        public AssetHealthController(
            HealthScoringService healthService,
            ILogger<AssetHealthController> logger)
        {
            _healthService = healthService;
            _logger = logger;
        }

        [HttpGet]
        public async Task<IActionResult> GetHealthScore(Guid assetId)
        {
            try
            {
                var breakdown = await _healthService.GetHealthScoreBreakdownAsync(assetId);
                
                return Ok(new
                {
                    assetId = breakdown.AssetId,
                    overallScore = Math.Round(breakdown.OverallScore, 1),
                    colorCode = breakdown.ColorCode,
                    breakdown = new
                    {
                        uptime = new
                        {
                            value = Math.Round(breakdown.UptimePercent, 1),
                            weight = 40,
                            contribution = Math.Round(breakdown.UptimePercent * 0.4, 1)
                        },
                        alarms = new
                        {
                            count = breakdown.AlarmCount,
                            weight = 30,
                            score = Math.Max(0, 100 - (breakdown.AlarmCount * 10)),
                            contribution = Math.Round(Math.Max(0, 100 - (breakdown.AlarmCount * 10)) * 0.3, 1)
                        },
                        performance = new
                        {
                            ratio = Math.Round(breakdown.PerformanceRatio, 1),
                            weight = 20,
                            contribution = Math.Round(breakdown.PerformanceRatio * 0.2, 1)
                        },
                        maintenance = new
                        {
                            overdueDays = Math.Round(breakdown.MaintenanceOverdueDays, 1),
                            weight = 10,
                            score = Math.Max(0, 100 - (breakdown.MaintenanceOverdueDays * 2)),
                            contribution = Math.Round(Math.Max(0, 100 - (breakdown.MaintenanceOverdueDays * 2)) * 0.1, 1)
                        }
                    }
                });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Failed to get health score for asset {AssetId}", assetId);
                return StatusCode(500, new { error = "Failed to retrieve health score" });
            }
        }

        [HttpGet("history")]
        public async Task<IActionResult> GetHealthHistory(
            Guid assetId,
            [FromQuery] DateTime? from,
            [FromQuery] DateTime? to)
        {
            try
            {
                var fromDate = from ?? DateTime.UtcNow.AddDays(-7);
                var toDate = to ?? DateTime.UtcNow;
                if (fromDate > toDate)
                {
                    return Problem(
                        statusCode: StatusCodes.Status400BadRequest,
                        detail: "from must be before or equal to to.");
                }
                if (toDate - fromDate > TimeSpan.FromDays(31))
                {
                    return Problem(
                        statusCode: StatusCodes.Status400BadRequest,
                        detail: "The query window cannot exceed 31 days.");
                }

                var history = await _healthService.GetHealthScoreHistoryAsync(assetId, fromDate, toDate);

                return Ok(new
                {
                    assetId,
                    from = fromDate,
                    to = toDate,
                    count = history.Count,
                    history
                });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Failed to get health history for asset {AssetId}", assetId);
                return StatusCode(500, new { error = "Failed to retrieve health history" });
            }
        }

        [HttpPost("compute")]
        [Authorize(Roles = "ADMIN,ENGINEER")]
        public async Task<IActionResult> ComputeHealthScore(Guid assetId)
        {
            try
            {
                var score = await _healthService.ComputeAndStoreHealthScoreAsync(assetId);

                return Ok(new
                {
                    assetId,
                    score = Math.Round(score, 1),
                    computedAt = DateTime.UtcNow
                });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Failed to compute health score for asset {AssetId}", assetId);
                return StatusCode(500, new { error = "Failed to compute health score" });
            }
        }
    }
}
