using System;
using System.Collections.Generic;
using System.ComponentModel.DataAnnotations;
using System.Security.Claims;
using System.Text.Json;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using backend.Services;
using Npgsql;

namespace backend.Controllers
{
    [ApiController]
    [Route("api/production-lines")]
    public class ProductionLineController : ControllerBase
    {
        private readonly DatabaseService _dbService;
        private readonly IAuditService _auditService;

        public ProductionLineController(DatabaseService dbService, IAuditService auditService)
        {
            _dbService = dbService;
            _auditService = auditService;
        }

        // ── GET /api/production-lines ─────────────────────────────────────────────────
        [HttpGet]
        public async Task<IActionResult> GetLines(
            [FromQuery, Range(1, 1000)] int limit = 500)
        {
            var lines = new List<object>();
            try
            {
                using var conn = _dbService.CreateConnection();
                await conn.OpenAsync();

                string sql = @"
                    SELECT pl.id, pl.name, pl.description, pl.created_at,
                           COUNT(lm.machine_id) AS machine_count
                    FROM production_lines pl
                    LEFT JOIN line_machines lm ON lm.line_id = pl.id
                    GROUP BY pl.id, pl.name, pl.description, pl.created_at
                    ORDER BY pl.created_at ASC
                    LIMIT @limit";

                using var cmd = new NpgsqlCommand(sql, conn);
                cmd.Parameters.AddWithValue("limit", limit);
                using var reader = await cmd.ExecuteReaderAsync();
                while (await reader.ReadAsync())
                {
                    lines.Add(new
                    {
                        id           = reader.GetGuid(0),
                        name         = reader.GetString(1),
                        description  = reader.IsDBNull(2) ? "" : reader.GetString(2),
                        createdAt    = reader.GetDateTime(3),
                        machineCount = reader.GetInt64(4),
                    });
                }
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { error = $"Lỗi lấy danh sách chuyền: {ex.Message}" });
            }
            return Ok(lines);
        }

        // ── POST /api/production-lines ────────────────────────────────────────────────
        [HttpPost]
        [Authorize(Roles = "ADMIN")]
        public async Task<IActionResult> CreateLine([FromBody] LineRequest req)
        {
            if (string.IsNullOrWhiteSpace(req.Name))
                return BadRequest(new { error = "Tên dây chuyền không được để trống" });

            try
            {
                var currentUser = User.FindFirst(ClaimTypes.Name)?.Value ?? "unknown";
                var newId = Guid.NewGuid();

                string sql = @"
                    INSERT INTO production_lines (id, name, description)
                    VALUES (@id, @name, @desc)
                    RETURNING id, name, description, created_at";

                using var conn = _dbService.CreateConnection();
                await conn.OpenAsync();
                using var cmd = new NpgsqlCommand(sql, conn);
                cmd.Parameters.AddWithValue("id",   newId);
                cmd.Parameters.AddWithValue("name", req.Name.Trim());
                cmd.Parameters.AddWithValue("desc", string.IsNullOrWhiteSpace(req.Description) ? (object)DBNull.Value : req.Description.Trim());

                using var reader = await cmd.ExecuteReaderAsync();
                if (await reader.ReadAsync())
                {
                    var result = new
                    {
                        id          = reader.GetGuid(0),
                        name        = reader.GetString(1),
                        description = reader.IsDBNull(2) ? "" : reader.GetString(2),
                        createdAt   = reader.GetDateTime(3),
                    };
                    await _auditService.LogAuditAsync(currentUser, "CREATE_LINE", $"Tạo dây chuyền: {req.Name}");
                    return Created($"/api/production-lines/{newId}", result);
                }
                return StatusCode(500, new { error = "Không tạo được dây chuyền" });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { error = $"Lỗi tạo dây chuyền: {ex.Message}" });
            }
        }

        // ── PUT /api/production-lines/{id} ────────────────────────────────────────────
        [HttpPut("{id}")]
        [Authorize(Roles = "ADMIN")]
        public async Task<IActionResult> UpdateLine(Guid id, [FromBody] LineRequest req)
        {
            if (string.IsNullOrWhiteSpace(req.Name))
                return BadRequest(new { error = "Tên dây chuyền không được để trống" });

            try
            {
                var currentUser = User.FindFirst(ClaimTypes.Name)?.Value ?? "unknown";
                using var conn = _dbService.CreateConnection();
                await conn.OpenAsync();
                using var cmd = new NpgsqlCommand(
                    "UPDATE production_lines SET name=@name, description=@desc WHERE id=@id", conn);
                cmd.Parameters.AddWithValue("id",   id);
                cmd.Parameters.AddWithValue("name", req.Name.Trim());
                cmd.Parameters.AddWithValue("desc", string.IsNullOrWhiteSpace(req.Description) ? (object)DBNull.Value : req.Description.Trim());
                int rows = await cmd.ExecuteNonQueryAsync();
                if (rows == 0) return NotFound(new { error = "Không tìm thấy dây chuyền" });
                await _auditService.LogAuditAsync(currentUser, "UPDATE_LINE", $"Sửa dây chuyền ID: {id}");
                return Ok(new { success = true });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { error = $"Lỗi cập nhật dây chuyền: {ex.Message}" });
            }
        }

        // ── DELETE /api/production-lines/{id} ─────────────────────────────────────────
        [HttpDelete("{id}")]
        [Authorize(Roles = "ADMIN")]
        public async Task<IActionResult> DeleteLine(Guid id)
        {
            try
            {
                var currentUser = User.FindFirst(ClaimTypes.Name)?.Value ?? "unknown";
                using var conn = _dbService.CreateConnection();
                await conn.OpenAsync();
                using var cmd = new NpgsqlCommand("DELETE FROM production_lines WHERE id=@id", conn);
                cmd.Parameters.AddWithValue("id", id);
                int rows = await cmd.ExecuteNonQueryAsync();
                if (rows == 0) return NotFound(new { error = "Không tìm thấy dây chuyền" });
                await _auditService.LogAuditAsync(currentUser, "DELETE_LINE", $"Xóa dây chuyền ID: {id}");
                return Ok(new { success = true });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { error = $"Lỗi xóa dây chuyền: {ex.Message}" });
            }
        }

        // ── GET /api/production-lines/{id}/machines ───────────────────────────────────
        [HttpGet("{id}/machines")]
        public async Task<IActionResult> GetLineMachines(Guid id)
        {
            var machines = new List<object>();
            try
            {
                using var conn = _dbService.CreateConnection();
                await conn.OpenAsync();

                string sql = @"
                    SELECT m.id, m.name, m.machine_code, m.ip, m.status, m.plc_connected,
                           m.last_plc_data, lm.sequence_order
                    FROM line_machines lm
                    JOIN machines m ON lm.machine_id = m.id
                    WHERE lm.line_id = @line_id
                    ORDER BY lm.sequence_order";

                using var cmd = new NpgsqlCommand(sql, conn);
                cmd.Parameters.AddWithValue("line_id", id);
                using var reader = await cmd.ExecuteReaderAsync();
                while (await reader.ReadAsync())
                {
                    string lastPlcDataRaw = reader.IsDBNull(6) ? "{}" : reader.GetString(6);
                    object? parsedPlcData = null;
                    try { parsedPlcData = JsonSerializer.Deserialize<object>(lastPlcDataRaw); }
                    catch { parsedPlcData = lastPlcDataRaw; }

                    machines.Add(new
                    {
                        id           = reader.GetGuid(0),
                        name         = reader.GetString(1),
                        machineCode  = reader.IsDBNull(2) ? "" : reader.GetString(2),
                        ip           = reader.IsDBNull(3) ? "" : reader.GetString(3),
                        status       = reader.IsDBNull(4) ? "offline" : reader.GetString(4),
                        plcConnected = !reader.IsDBNull(5) && reader.GetBoolean(5),
                        lastPlcData  = parsedPlcData,
                        sequenceOrder = reader.GetInt32(7),
                    });
                }
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { error = $"Lỗi lấy máy trong chuyền: {ex.Message}" });
            }
            return Ok(machines);
        }

        // ── POST /api/production-lines/{id}/machines ──────────────────────────────────
        // Thêm máy vào chuyền
        [HttpPost("{id}/machines")]
        [Authorize(Roles = "ADMIN,ENGINEER")]
        public async Task<IActionResult> AddMachineToLine(Guid id, [FromBody] AddMachineToLineRequest req)
        {
            try
            {
                var currentUser = User.FindFirst(ClaimTypes.Name)?.Value ?? "unknown";
                using var conn = _dbService.CreateConnection();
                await conn.OpenAsync();

                // Lấy sequence_order tối đa hiện tại nếu không truyền vào
                int seqOrder = req.SequenceOrder;
                if (seqOrder <= 0)
                {
                    using var seqCmd = new NpgsqlCommand(
                        "SELECT COALESCE(MAX(sequence_order), 0) + 1 FROM line_machines WHERE line_id = @lid", conn);
                    seqCmd.Parameters.AddWithValue("lid", id);
                    seqOrder = (int)(await seqCmd.ExecuteScalarAsync() ?? 1);
                }

                string sql = @"
                    INSERT INTO line_machines (line_id, machine_id, sequence_order)
                    VALUES (@lid, @mid, @seq)
                    ON CONFLICT (line_id, machine_id) DO UPDATE SET sequence_order = EXCLUDED.sequence_order";

                using var cmd = new NpgsqlCommand(sql, conn);
                cmd.Parameters.AddWithValue("lid", id);
                cmd.Parameters.AddWithValue("mid", req.MachineId);
                cmd.Parameters.AddWithValue("seq", seqOrder);
                await cmd.ExecuteNonQueryAsync();

                await _auditService.LogAuditAsync(currentUser, "ADD_MACHINE_TO_LINE", $"Thêm máy {req.MachineId} vào chuyền {id} (thứ tự {seqOrder})");
                return Ok(new { success = true, sequenceOrder = seqOrder });
            }
            catch (PostgresException pgex) when (pgex.SqlState == "23503")
            {
                return BadRequest(new { error = "Máy hoặc dây chuyền không tồn tại" });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { error = $"Lỗi thêm máy vào chuyền: {ex.Message}" });
            }
        }

        // ── DELETE /api/production-lines/{id}/machines/{machineId} ───────────────────
        [HttpDelete("{id}/machines/{machineId}")]
        [Authorize(Roles = "ADMIN,ENGINEER")]
        public async Task<IActionResult> RemoveMachineFromLine(Guid id, Guid machineId)
        {
            try
            {
                var currentUser = User.FindFirst(ClaimTypes.Name)?.Value ?? "unknown";
                using var conn = _dbService.CreateConnection();
                await conn.OpenAsync();
                using var cmd = new NpgsqlCommand(
                    "DELETE FROM line_machines WHERE line_id=@lid AND machine_id=@mid", conn);
                cmd.Parameters.AddWithValue("lid", id);
                cmd.Parameters.AddWithValue("mid", machineId);
                int rows = await cmd.ExecuteNonQueryAsync();
                if (rows == 0) return NotFound(new { error = "Máy không có trong dây chuyền này" });
                await _auditService.LogAuditAsync(currentUser, "REMOVE_MACHINE_FROM_LINE", $"Xóa máy {machineId} khỏi chuyền {id}");
                return Ok(new { success = true });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { error = $"Lỗi xóa máy khỏi chuyền: {ex.Message}" });
            }
        }

        // ── PUT /api/production-lines/{id}/machines/{machineId}/order ─────────────────
        [HttpPut("{id}/machines/{machineId}/order")]
        [Authorize(Roles = "ADMIN,ENGINEER")]
        public async Task<IActionResult> UpdateMachineOrder(Guid id, Guid machineId, [FromBody] UpdateOrderRequest req)
        {
            try
            {
                var currentUser = User.FindFirst(ClaimTypes.Name)?.Value ?? "unknown";
                using var conn = _dbService.CreateConnection();
                await conn.OpenAsync();
                using var cmd = new NpgsqlCommand(
                    "UPDATE line_machines SET sequence_order=@seq WHERE line_id=@lid AND machine_id=@mid", conn);
                cmd.Parameters.AddWithValue("lid", id);
                cmd.Parameters.AddWithValue("mid", machineId);
                cmd.Parameters.AddWithValue("seq", req.SequenceOrder);
                int rows = await cmd.ExecuteNonQueryAsync();
                if (rows == 0) return NotFound(new { error = "Máy không có trong dây chuyền" });
                await _auditService.LogAuditAsync(currentUser, "REORDER_LINE_MACHINE", $"Đổi thứ tự máy {machineId} trong chuyền {id} → {req.SequenceOrder}");
                return Ok(new { success = true });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { error = $"Lỗi đổi thứ tự máy: {ex.Message}" });
            }
        }

    }

    public class LineRequest
    {
        public string Name { get; set; } = "";
        public string? Description { get; set; }
    }

    public class AddMachineToLineRequest
    {
        public Guid MachineId { get; set; }
        public int SequenceOrder { get; set; } = 0; // 0 = auto (append to end)
    }

    public class UpdateOrderRequest
    {
        public int SequenceOrder { get; set; }
    }
}
