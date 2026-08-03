using System.Collections.Generic;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using backend.Services;

namespace backend.Controllers
{
    [Authorize(Roles = "ADMIN,ENGINEER")]
    [ApiController]
    [Route("api/sync")]
    public class SyncController : ControllerBase
    {
        private readonly SyncService _syncService;

        public SyncController(SyncService syncService)
        {
            _syncService = syncService;
        }

        [HttpPost("register")]
        public async Task<IActionResult> Register([FromBody] SyncRegisterRequest req)
        {
            var machineId = req?.MachineId?.Trim();
            var validationError = SyncService.ValidateMachineId(machineId);
            if (validationError is not null)
            {
                return Problem(
                    statusCode: StatusCodes.Status400BadRequest,
                    detail: validationError);
            }

            long ackSeq = await _syncService.GetMaxSequenceAsync(machineId!);
            return Ok(new SyncRegisterResponse
            {
                Success = true,
                AckSeq = ackSeq,
                ServerTime = System.DateTime.UtcNow
            });
        }

        [HttpPost("upload")]
        public async Task<IActionResult> UploadBatch(
            [FromBody] BatchUploadRequest req,
            CancellationToken cancellationToken = default)
        {
            var machineId = req?.MachineId?.Trim();
            var validationError = SyncService.ValidateBatch(machineId, req?.Records);
            if (validationError is not null)
            {
                return Problem(
                    statusCode: StatusCodes.Status400BadRequest,
                    detail: validationError);
            }

            var result = await _syncService.ProcessBatchUploadAsync(
                machineId!,
                req!.Records,
                cancellationToken);
            if (result.IsSuccess)
            {
                return Ok(new
                {
                    success = true,
                    state = result.State.ToString(),
                });
            }

            var statusCode = result.State switch
            {
                TelemetryDeliveryState.Malformed => StatusCodes.Status400BadRequest,
                TelemetryDeliveryState.PayloadTooLarge => StatusCodes.Status413PayloadTooLarge,
                TelemetryDeliveryState.Conflict => StatusCodes.Status409Conflict,
                TelemetryDeliveryState.Busy or TelemetryDeliveryState.RetryableFailure =>
                    StatusCodes.Status503ServiceUnavailable,
                _ => StatusCodes.Status422UnprocessableEntity,
            };
            return Problem(
                statusCode: statusCode,
                title: result.State.ToString(),
                detail: result.Detail ?? "Sync delivery failed.");
        }
    }

    public class SyncRegisterRequest
    {
        public string MachineId { get; set; } = string.Empty;
        public long LastSyncSeq { get; set; }
    }

    public class SyncRegisterResponse
    {
        public bool Success { get; set; }
        public long AckSeq { get; set; }
        public System.DateTime ServerTime { get; set; }
    }

    public class BatchUploadRequest
    {
        public string MachineId { get; set; } = string.Empty;
        public List<TelemetryRecordDto> Records { get; set; } = [];
    }
}
