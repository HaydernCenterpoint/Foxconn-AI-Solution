using System;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Logging;
using backend.Services;

namespace backend.Controllers
{
    [ApiController]
    [Authorize(Roles = "ADMIN,ENGINEER")]
    [Route("api/v1/predictions")]
    [Route("api/predictions")]
    public class PredictionController : ControllerBase
    {
        private readonly PredictiveService _predictiveService;
        private readonly ILogger<PredictionController> _logger;

        public PredictionController(
            PredictiveService predictiveService,
            ILogger<PredictionController> logger)
        {
            _predictiveService = predictiveService;
            _logger = logger;
        }

        [HttpPost("anomaly")]
        [Authorize(Roles = "ADMIN,ENGINEER")]
        public async Task<IActionResult> DetectAnomaly([FromBody] AnomalyRequest request)
        {
            try
            {
                if (request?.AssetId == Guid.Empty)
                    return BadRequest(new { error = "Valid assetId is required" });

                var startTime = DateTime.UtcNow;
                var prediction = await _predictiveService.DetectAnomalyAsync(
                    request.AssetId,
                    request.MetricType ?? "temperature");
                var latency = (DateTime.UtcNow - startTime).TotalMilliseconds;

                return Ok(new
                {
                    assetId = prediction.AssetId,
                    isAnomaly = prediction.IsAnomaly,
                    score = Math.Round(prediction.Score, 3),
                    confidence = Math.Round(prediction.Confidence, 3),
                    reason = prediction.Reason,
                    contributingFactors = prediction.ContributingFactors,
                    latencyMs = Math.Round(latency, 2),
                    timestamp = DateTime.UtcNow
                });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Anomaly detection failed for request");
                return StatusCode(500, new { error = "Anomaly detection failed" });
            }
        }

        [HttpGet("risk/{assetId}")]
        public async Task<IActionResult> GetFailureRisk(Guid assetId, [FromQuery] string window = "1h")
        {
            try
            {
                var startTime = DateTime.UtcNow;
                var prediction = await _predictiveService.PredictFailureRiskAsync(assetId, window);
                var latency = (DateTime.UtcNow - startTime).TotalMilliseconds;

                return Ok(new
                {
                    assetId = prediction.AssetId,
                    riskScore = Math.Round(prediction.RiskScore, 3),
                    riskLevel = prediction.RiskLevel,
                    confidence = Math.Round(prediction.Confidence, 3),
                    timeWindow = prediction.TimeWindow,
                    contributingFactors = prediction.ContributingFactors,
                    latencyMs = Math.Round(latency, 2),
                    timestamp = DateTime.UtcNow
                });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Failure risk prediction failed for asset {AssetId}", assetId);
                return StatusCode(500, new { error = "Failure risk prediction failed" });
            }
        }
    }

    public class AnomalyRequest
    {
        public Guid AssetId { get; set; }
        public string MetricType { get; set; }
    }
}
