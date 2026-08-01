using System;
using System.ComponentModel.DataAnnotations;
using backend.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace backend.Controllers
{
    [ApiController]
    [Route("api/events")]
    [Authorize]
    public class EventLogController : ControllerBase
    {
        private readonly DatabaseService _dbService;

        public EventLogController(DatabaseService dbService)
        {
            _dbService = dbService;
        }

        /// <summary>
        /// Query the event log with optional filters.
        /// GET /api/events?assetId=...&eventType=...&severity=...&from=...&to=...&limit=100
        /// </summary>
        [HttpGet]
        public async Task<IActionResult> GetEvents(
            [FromQuery] Guid? assetId,
            [FromQuery, StringLength(100)] string? eventType,
            [FromQuery, StringLength(50)] string? severity,
            [FromQuery] DateTime? from,
            [FromQuery] DateTime? to,
            [FromQuery, Range(1, 1000)] int limit = 100)
        {
            if (from.HasValue || to.HasValue)
            {
                to ??= DateTime.UtcNow;
                from ??= to.Value.AddDays(-31);
                if (from > to)
                {
                    return Problem(
                        statusCode: StatusCodes.Status400BadRequest,
                        detail: "from must be before or equal to to.");
                }
                if (to.Value - from.Value > TimeSpan.FromDays(31))
                {
                    return Problem(
                        statusCode: StatusCodes.Status400BadRequest,
                        detail: "The query window cannot exceed 31 days.");
                }
            }

            var events = await _dbService.QueryEventLogAsync(assetId, eventType, severity, from, to, limit);
            return Ok(events);
        }
    }
}
