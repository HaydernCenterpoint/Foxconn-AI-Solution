using System;
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
            [FromQuery] string? eventType,
            [FromQuery] string? severity,
            [FromQuery] DateTime? from,
            [FromQuery] DateTime? to,
            [FromQuery] int limit = 100)
        {
            if (limit < 1 || limit > 1000) limit = 100;
            var events = await _dbService.QueryEventLogAsync(assetId, eventType, severity, from, to, limit);
            return Ok(events);
        }
    }
}
