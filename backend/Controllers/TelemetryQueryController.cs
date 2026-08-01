using System;
using System.ComponentModel.DataAnnotations;
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
            [FromQuery, Required, StringLength(100)] string metric,
            [FromQuery] DateTime? from,
            [FromQuery] DateTime? to,
            [FromQuery, Range(1, 10000)] int limit = 1000)
        {
            if (assetId == Guid.Empty)
                return BadRequest(new { error = "assetId is required." });
            if (string.IsNullOrWhiteSpace(metric))
                return BadRequest(new { error = "metric is required." });

            var fromDate = from ?? DateTime.UtcNow.AddDays(-1);
            var toDate = to ?? DateTime.UtcNow;
            if (fromDate > toDate)
                return Problem(
                    statusCode: StatusCodes.Status400BadRequest,
                    detail: "from must be before or equal to to.");
            if (toDate - fromDate > TimeSpan.FromDays(31))
                return Problem(
                    statusCode: StatusCodes.Status400BadRequest,
                    detail: "The query window cannot exceed 31 days.");

            var data = await _dbService.QueryTelemetryDataAsync(assetId, metric, fromDate, toDate, limit);
            return Ok(data);
        }
    }
}
