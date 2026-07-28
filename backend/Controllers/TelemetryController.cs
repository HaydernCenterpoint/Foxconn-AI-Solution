using System.Text.Json;
using System.ComponentModel.DataAnnotations;
using Microsoft.AspNetCore.Mvc;
using backend.Services;
using Mkz.Fusion.Contracts;

namespace backend.Controllers
{
    [ApiController]
    [Route("api/telemetry")]
    [Route(ApiConventionV1.RoutePrefix + "/telemetry")]
    public class TelemetryController : ControllerBase
    {
        private readonly TelemetryStore _store;
        private readonly TimescaleTelemetryService _timescaleTelemetry;

        public TelemetryController(TelemetryStore store, TimescaleTelemetryService timescaleTelemetry)
        {
            _store = store;
            _timescaleTelemetry = timescaleTelemetry;
        }

        /// <summary>
        /// GET /api/telemetry/live
        /// Returns the latest raw telemetry snapshot per connected PLC client.
        /// Requires an authenticated FII session.
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
        /// Requires an authenticated FII session.
        /// </summary>
        [HttpGet("log")]
        public IActionResult GetLog([FromQuery, Range(1, 200)] int count = 50)
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

        [HttpGet("timescale/{machineId:guid}")]
        public async Task<IActionResult> GetTimescalePoints(
            Guid machineId,
            [FromQuery, Range(1, 1000)] int limit = 100)
        {
            if (!_timescaleTelemetry.IsEnabled)
            {
                return Problem(statusCode: StatusCodes.Status503ServiceUnavailable, detail: "Timescale telemetry is not enabled");
            }

            return Ok(await _timescaleTelemetry.GetRecentAsync(machineId, limit, HttpContext.RequestAborted));
        }

        [HttpGet("timescale/{machineId:guid}/hourly")]
        public async Task<IActionResult> GetTimescaleHourlyRollups(
            Guid machineId,
            [FromQuery, Range(1, 1000)] int limit = 48)
        {
            if (!_timescaleTelemetry.IsEnabled)
            {
                return Problem(statusCode: StatusCodes.Status503ServiceUnavailable, detail: "Timescale telemetry is not enabled");
            }

            return Ok(await _timescaleTelemetry.GetHourlyRollupsAsync(machineId, limit, HttpContext.RequestAborted));
        }
    }
}
