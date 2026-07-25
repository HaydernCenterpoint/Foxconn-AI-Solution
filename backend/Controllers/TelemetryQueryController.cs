using System;
using backend.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace backend.Controllers
{
    [ApiController]
    [Route("api/telemetry")]
    [Authorize]
    public class TelemetryQueryController : ControllerBase
    {
        private readonly DatabaseService _dbService;

        public TelemetryQueryController(DatabaseService dbService)
        {
            _dbService = dbService;
        }

        /// <summary>
        /// Query time-series telemetry data for charts.
        /// GET /api/telemetry/query?assetId=...&metric=production_quantity&from=...&to=...&limit=1000
        /// </summary>
        [HttpGet("query")]
        public async Task<IActionResult> Query(
            [FromQuery] Guid assetId,
            [FromQuery] string metric,
            [FromQuery] DateTime? from,
            [FromQuery] DateTime? to,
            [FromQuery] int limit = 1000)
        {
            if (assetId == Guid.Empty)
                return BadRequest(new { error = "assetId is required." });
            if (string.IsNullOrWhiteSpace(metric))
                return BadRequest(new { error = "metric is required." });

            var fromDate = from ?? DateTime.UtcNow.AddDays(-1);
            var toDate = to ?? DateTime.UtcNow;
            if (limit < 1 || limit > 10000) limit = 1000;

            var data = await _dbService.QueryTelemetryDataAsync(assetId, metric, fromDate, toDate, limit);
            return Ok(data);
        }
    }
}
