using System.Collections.Generic;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Mvc;
using backend.Services;

namespace backend.Controllers
{
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
            if (req == null || string.IsNullOrEmpty(req.MachineId))
            {
                return BadRequest("Invalid sync register request.");
            }

            long ackSeq = await _syncService.GetMaxSequenceAsync(req.MachineId);
            return Ok(new SyncRegisterResponse
            {
                Success = true,
                AckSeq = ackSeq,
                ServerTime = System.DateTime.UtcNow
            });
        }

        [HttpPost("upload")]
        public async Task<IActionResult> UploadBatch([FromBody] BatchUploadRequest req)
        {
            if (req == null || string.IsNullOrEmpty(req.MachineId))
            {
                return BadRequest("Invalid batch upload request.");
            }

            await _syncService.ProcessBatchUploadAsync(req.MachineId, req.Records);
            return Ok(new { success = true });
        }
    }

    public class SyncRegisterRequest
    {
        public string MachineId { get; set; }
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
        public string MachineId { get; set; }
        public List<TelemetryRecordDto> Records { get; set; }
    }
}
