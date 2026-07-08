using System.Text.Json;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using backend.Services;

namespace backend.Controllers
{
    [ApiController]
    [Route("api/telemetry")]
    public class TelemetryController : ControllerBase
    {
        private readonly TelemetryStore _store;

        public TelemetryController(TelemetryStore store)
        {
            _store = store;
        }

        /// <summary>
        /// GET /api/telemetry/live
        /// Returns the latest raw telemetry snapshot per connected PLC client.
        /// No authentication required – public endpoint for the live monitor screen.
        /// </summary>
        [HttpGet("live")]
        public IActionResult GetLive()
        {
            var snapshots = _store.GetLatest();
            var result = snapshots.Select(s =>
            {
                object? parsed = null;
                try { parsed = JsonSerializer.Deserialize<object>(s.RawJson); }
                catch { parsed = s.RawJson; }

                return new
                {
                    clientId    = s.ClientId,
                    machineName = s.MachineName,
                    ipAddress   = s.IpAddress,
                    receivedAt  = s.ReceivedAt,
                    payload     = parsed
                };
            });
            return Ok(result);
        }

        /// <summary>
        /// GET /api/telemetry/log?count=50
        /// Returns the last N raw messages received across all clients (rolling log).
        /// No authentication required.
        /// </summary>
        [HttpGet("log")]
        public IActionResult GetLog([FromQuery] int count = 50)
        {
            var log = _store.GetLog(Math.Min(count, 200));
            var result = log.Select(s =>
            {
                object? parsed = null;
                try { parsed = JsonSerializer.Deserialize<object>(s.RawJson); }
                catch { parsed = s.RawJson; }

                return new
                {
                    clientId    = s.ClientId,
                    machineName = s.MachineName,
                    ipAddress   = s.IpAddress,
                    receivedAt  = s.ReceivedAt,
                    payload     = parsed
                };
            });
            return Ok(result);
        }
    }
}
