using System;
using System.Collections.Generic;
using System.Security.Claims;
using System.Text.Json;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using backend.Services;
using backend.Models.Dtos;
using Npgsql;

namespace backend.Controllers
{
    [ApiController]
    [Route("api/machines")]
    public class MachineController : ControllerBase
    {
        private readonly DatabaseService _dbService;
        private readonly IAuditService _auditService;

        public MachineController(DatabaseService dbService, IAuditService auditService)
        {
            _dbService = dbService;
            _auditService = auditService;
        }

        // ── GET /api/machines ────────────────────────────────────────────────────────
        [HttpGet]
        [AllowAnonymous]
        public async Task<IActionResult> GetAllMachines()
        {
            var machines = new List<object>();
            try
            {
                using var conn = _dbService.CreateConnection();
                await conn.OpenAsync();

                string sql = @"
                    SELECT m.id, m.name, m.machine_code, m.ip, m.status, m.plc_connected,
                           m.client_id, m.approval_status, m.cpu_percent, m.ram_percent,
                           m.uptime_seconds, m.last_heartbeat, m.created_at,
                           STRING_AGG(pl.name, ', ' ORDER BY pl.name) AS line_names,
                           m.last_plc_data,
                           STRING_AGG(CAST(lm.sequence_order AS VARCHAR), ', ') AS sequence_orders,
                           STRING_AGG(CAST(pl.id AS VARCHAR), ', ') AS line_ids
                    FROM machines m
                    LEFT JOIN line_machines lm ON lm.machine_id = m.id
                    LEFT JOIN production_lines pl ON pl.id = lm.line_id
                    GROUP BY m.id, m.name, m.machine_code, m.ip, m.status,
                             m.plc_connected, m.client_id, m.approval_status,
                             m.cpu_percent, m.ram_percent, m.uptime_seconds,
                             m.last_heartbeat, m.created_at, m.last_plc_data
                    ORDER BY COALESCE(MIN(lm.sequence_order), 999999) ASC, m.created_at ASC";

                using var cmd = new NpgsqlCommand(sql, conn);
                using var reader = await cmd.ExecuteReaderAsync();
                while (await reader.ReadAsync())
                {
                    string lastPlcDataRaw = reader.IsDBNull(14) ? "{}" : reader.GetString(14);
                    object? parsedPlcData = null;
                    try { parsedPlcData = JsonSerializer.Deserialize<object>(lastPlcDataRaw); }
                    catch { parsedPlcData = lastPlcDataRaw; }

                    int? seqOrder = null;
                    if (!reader.IsDBNull(15))
                    {
                        var seqStr = reader.GetString(15).Split(',')[0];
                        if (int.TryParse(seqStr, out var seqVal))
                        {
                            seqOrder = seqVal;
                        }
                    }

                    string? firstLineId = null;
                    if (!reader.IsDBNull(16))
                    {
                        var ids = reader.GetString(16).Split(',');
                        if (ids.Length > 0 && !string.IsNullOrWhiteSpace(ids[0]))
                        {
                            firstLineId = ids[0].Trim();
                        }
                    }

                    machines.Add(new MachineDto
                    {
                        Id             = reader.GetGuid(0),
                        Name           = reader.GetString(1),
                        MachineCode    = reader.IsDBNull(2) ? "" : reader.GetString(2),
                        Ip             = reader.IsDBNull(3) ? "" : reader.GetString(3),
                        Status         = reader.IsDBNull(4) ? "offline" : reader.GetString(4),
                        PlcConnected   = !reader.IsDBNull(5) && reader.GetBoolean(5),
                        ClientId       = reader.IsDBNull(6) ? null : reader.GetString(6),
                        ApprovalStatus = reader.GetString(7),
                        CpuPercent     = reader.IsDBNull(8)  ? 0.0 : reader.GetDouble(8),
                        RamPercent     = reader.IsDBNull(9)  ? 0.0 : reader.GetDouble(9),
                        UptimeSeconds  = reader.IsDBNull(10) ? 0L  : reader.GetInt64(10),
                        LastHeartbeat  = reader.IsDBNull(11) ? (DateTime?)null : reader.GetDateTime(11),
                        CreatedAt      = reader.GetDateTime(12),
                        LineNames      = reader.IsDBNull(13) ? "" : reader.GetString(13),
                        LastPlcData    = parsedPlcData,
                        SequenceOrder  = seqOrder,
                        LineId         = firstLineId
                    });
                }
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { error = $"Lỗi lấy danh sách máy: {ex.Message}" });
            }
            return Ok(machines);
        }

        // ── GET /api/machines/{id} ───────────────────────────────────────────────────
        [HttpGet("{id}")]
        [AllowAnonymous]
        public async Task<IActionResult> GetMachineById(Guid id)
        {
            try
            {
                using var conn = _dbService.CreateConnection();
                await conn.OpenAsync();

                string sql = @"SELECT m.id, m.name, m.machine_code, m.ip, m.status, m.plc_connected,
                                      m.last_plc_data, m.client_id, m.approval_status, m.cpu_percent,
                                      m.ram_percent, m.uptime_seconds, m.last_heartbeat, m.created_at,
                                      lm.line_id
                               FROM machines m
                               LEFT JOIN line_machines lm ON lm.machine_id = m.id
                               WHERE m.id = @id LIMIT 1";
                using var cmd = new NpgsqlCommand(sql, conn);
                cmd.Parameters.AddWithValue("id", id);
                using var reader = await cmd.ExecuteReaderAsync();
                if (await reader.ReadAsync())
                {
                    string lastPlcDataRaw = reader.IsDBNull(6) ? "{}" : reader.GetString(6);
                    object? parsedPlcData = null;
                    try { parsedPlcData = JsonSerializer.Deserialize<object>(lastPlcDataRaw); }
                    catch { parsedPlcData = lastPlcDataRaw; }

                    string? lineId = reader.IsDBNull(14) ? null : reader.GetGuid(14).ToString();

                    return Ok(new
                    {
                        id             = reader.GetGuid(0),
                        name           = reader.GetString(1),
                        machineCode    = reader.IsDBNull(2) ? "" : reader.GetString(2),
                        ip             = reader.IsDBNull(3) ? "" : reader.GetString(3),
                        status         = reader.IsDBNull(4) ? "offline" : reader.GetString(4),
                        plcConnected   = !reader.IsDBNull(5) && reader.GetBoolean(5),
                        lastPlcData    = parsedPlcData,
                        clientId       = reader.IsDBNull(7) ? null : reader.GetString(7),
                        approvalStatus = reader.GetString(8),
                        cpuPercent     = reader.IsDBNull(9) ? 0.0 : reader.GetDouble(9),
                        ramPercent     = reader.IsDBNull(10) ? 0.0 : reader.GetDouble(10),
                        uptimeSeconds  = reader.IsDBNull(11) ? 0L : reader.GetInt64(11),
                        lastHeartbeat  = reader.IsDBNull(12) ? (DateTime?)null : reader.GetDateTime(12),
                        createdAt      = reader.GetDateTime(13),
                        lineId         = lineId
                    });
                }
                return NotFound(new { error = "Không tìm thấy máy" });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { error = $"Lỗi lấy thông tin máy: {ex.Message}" });
            }
        }

        // ── POST /api/machines ───────────────────────────────────────────────────────
        [HttpPost]
        [Authorize(Roles = "ADMIN,ENGINEER")]
        public async Task<IActionResult> CreateMachine([FromBody] MachineRequest req)
        {
            if (string.IsNullOrWhiteSpace(req.Name))
                return BadRequest(new { error = "Tên máy không được để trống" });

            try
            {
                var currentUser = User.FindFirst(ClaimTypes.Name)?.Value ?? "unknown";
                var newId = Guid.NewGuid();

                string sql = @"
                    INSERT INTO machines (id, name, machine_code, ip, status, client_id, approval_status)
                    VALUES (@id, @name, @machineCode, @ip, 'offline', @clientId, 'APPROVED')
                    RETURNING id, name, machine_code, ip, status, client_id, approval_status, created_at";

                using var conn = _dbService.CreateConnection();
                await conn.OpenAsync();
                using var cmd = new NpgsqlCommand(sql, conn);
                cmd.Parameters.AddWithValue("id",          newId);
                cmd.Parameters.AddWithValue("name",        req.Name.Trim());
                cmd.Parameters.AddWithValue("machineCode", string.IsNullOrWhiteSpace(req.MachineCode) ? (object)DBNull.Value : req.MachineCode.Trim());
                cmd.Parameters.AddWithValue("ip",          string.IsNullOrWhiteSpace(req.Ip) ? (object)DBNull.Value : req.Ip.Trim());
                cmd.Parameters.AddWithValue("clientId",    string.IsNullOrWhiteSpace(req.ClientId) ? (object)DBNull.Value : req.ClientId.Trim());

                using var reader = await cmd.ExecuteReaderAsync();
                if (await reader.ReadAsync())
                {
                    var result = new
                    {
                        id             = reader.GetGuid(0),
                        name           = reader.GetString(1),
                        machineCode    = reader.IsDBNull(2) ? "" : reader.GetString(2),
                        ip             = reader.IsDBNull(3) ? "" : reader.GetString(3),
                        status         = reader.GetString(4),
                        clientId       = reader.IsDBNull(5) ? null : reader.GetString(5),
                        approvalStatus = reader.GetString(6),
                        createdAt      = reader.GetDateTime(7)
                    };

                    reader.Close();

                    // Insert line association if provided
                    if (req.LineId.HasValue)
                    {
                        int seqOrder = 1;
                        using (var seqCmd = new NpgsqlCommand(
                            "SELECT COALESCE(MAX(sequence_order), 0) + 1 FROM line_machines WHERE line_id = @lid", conn))
                        {
                            seqCmd.Parameters.AddWithValue("lid", req.LineId.Value);
                            seqOrder = Convert.ToInt32(await seqCmd.ExecuteScalarAsync() ?? 1);
                        }

                        using (var linkCmd = new NpgsqlCommand(
                            "INSERT INTO line_machines (line_id, machine_id, sequence_order) VALUES (@lid, @mid, @seq)", conn))
                        {
                            linkCmd.Parameters.AddWithValue("lid", req.LineId.Value);
                            linkCmd.Parameters.AddWithValue("mid", newId);
                            linkCmd.Parameters.AddWithValue("seq", seqOrder);
                            await linkCmd.ExecuteNonQueryAsync();
                        }
                    }

                    await _auditService.LogAuditAsync(currentUser, "CREATE_MACHINE", $"Tạo máy: {req.Name} ({req.MachineCode})");
                    return Created($"/api/machines/{newId}", result);
                }
                return StatusCode(500, new { error = "Không tạo được máy" });
            }
            catch (PostgresException pgex) when (pgex.SqlState == "23505")
            {
                return Conflict(new { error = "Mã máy hoặc Client ID đã tồn tại" });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { error = $"Lỗi tạo máy: {ex.Message}" });
            }
        }

        // ── PUT /api/machines/{id} (Update) ──
        [HttpPut("{id}")]
        [Authorize(Roles = "ADMIN,ENGINEER")]
        public async Task<IActionResult> UpdateMachine(Guid id, [FromBody] MachineRequest req)
        {
            if (req == null || string.IsNullOrWhiteSpace(req.Name))
            {
                return BadRequest(new { error = "Tên máy không được để trống" });
            }

            try
            {
                var currentUser = User.FindFirst(ClaimTypes.Name)?.Value ?? "unknown";

                using (var conn = _dbService.CreateConnection())
                {
                    await conn.OpenAsync();

                    string sql = @"UPDATE machines SET
                                       name = @name,
                                       machine_code = @code,
                                       ip = @ip,
                                       client_id = @clientId
                                   WHERE id = @id";
                    using var cmd = new NpgsqlCommand(sql, conn);
                    cmd.Parameters.AddWithValue("id", id);
                    cmd.Parameters.AddWithValue("name", req.Name.Trim());
                    cmd.Parameters.AddWithValue("code", (object?)req.MachineCode?.Trim() ?? DBNull.Value);
                    cmd.Parameters.AddWithValue("ip", (object?)req.Ip?.Trim() ?? DBNull.Value);
                    cmd.Parameters.AddWithValue("clientId", (object?)req.ClientId?.Trim() ?? DBNull.Value);
                    int rows = await cmd.ExecuteNonQueryAsync();
                    if (rows == 0) return NotFound(new { error = "Không tìm thấy máy" });

                    // Update line association if lineId is specified
                    if (req.LineId.HasValue)
                    {
                        // Clean existing link
                        using var cleanCmd = new NpgsqlCommand("DELETE FROM line_machines WHERE machine_id = @mid", conn);
                        cleanCmd.Parameters.AddWithValue("mid", id);
                        await cleanCmd.ExecuteNonQueryAsync();

                        int seqOrder = 1;
                        using (var seqCmd = new NpgsqlCommand(
                            "SELECT COALESCE(MAX(sequence_order), 0) + 1 FROM line_machines WHERE line_id = @lid", conn))
                        {
                            seqCmd.Parameters.AddWithValue("lid", req.LineId.Value);
                            seqOrder = Convert.ToInt32(await seqCmd.ExecuteScalarAsync() ?? 1);
                        }

                        using (var linkCmd = new NpgsqlCommand(
                            "INSERT INTO line_machines (line_id, machine_id, sequence_order) VALUES (@lid, @mid, @seq)", conn))
                        {
                            linkCmd.Parameters.AddWithValue("lid", req.LineId.Value);
                            linkCmd.Parameters.AddWithValue("mid", id);
                            linkCmd.Parameters.AddWithValue("seq", seqOrder);
                            await linkCmd.ExecuteNonQueryAsync();
                        }
                    }
                }

                await _auditService.LogAuditAsync(currentUser, "UPDATE_MACHINE", $"Cập nhật máy ID: {id}");
                return Ok(new { success = true, message = "Đã cập nhật máy" });
            }
            catch (PostgresException pgex) when (pgex.SqlState == "23505")
            {
                return Conflict(new { error = "Client ID đã được sử dụng bởi máy khác" });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { error = $"Lỗi cập nhật máy: {ex.Message}" });
            }
        }

        // ── DELETE /api/machines/{id} ──
        [HttpDelete("{id}")]
        [Authorize(Roles = "ADMIN")]
        public async Task<IActionResult> DeleteMachine(Guid id)
        {
            try
            {
                var currentUser = User.FindFirst(ClaimTypes.Name)?.Value ?? "unknown";

                using var conn = _dbService.CreateConnection();
                await conn.OpenAsync();
                using var cmd = new NpgsqlCommand("DELETE FROM machines WHERE id = @id", conn);
                cmd.Parameters.AddWithValue("id", id);
                int rows = await cmd.ExecuteNonQueryAsync();
                if (rows == 0) return NotFound(new { error = "Không tìm thấy máy" });

                await _auditService.LogAuditAsync(currentUser, "DELETE_MACHINE", $"Xóa máy ID: {id}");
                return Ok(new { success = true, message = "Đã xóa máy" });
            }
            catch (PostgresException pgex) when (pgex.SqlState == "23503")
            {
                return Conflict(new { error = "Không thể xóa – máy đang được dùng trong dây chuyền hoặc có dữ liệu sản lượng" });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { error = $"Lỗi xóa máy: {ex.Message}" });
            }
        }

        // ── POST /api/machines/{id}/approve ──
        [HttpPost("{id}/approve")]
        [Authorize(Roles = "ADMIN,ENGINEER")]
        public async Task<IActionResult> ApproveMachine(Guid id)
        {
            try
            {
                var currentUser = User.FindFirst(ClaimTypes.Name)?.Value ?? "unknown";
                using var conn = _dbService.CreateConnection();
                await conn.OpenAsync();

                string sql = "UPDATE machines SET approval_status = 'APPROVED' WHERE id = @id RETURNING name";
                using var cmd = new NpgsqlCommand(sql, conn);
                cmd.Parameters.AddWithValue("id", id);
                var result = await cmd.ExecuteScalarAsync();
                if (result == null) return NotFound(new { error = "Không tìm thấy máy" });

                await _auditService.LogAuditAsync(currentUser, "APPROVE_MACHINE", $"Duyệt máy '{result}' (ID: {id})");
                return Ok(new { success = true, message = "Đã duyệt máy" });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { error = $"Lỗi duyệt máy: {ex.Message}" });
            }
        }

        // ── POST /api/machines/{id}/reject ──
        [HttpPost("{id}/reject")]
        [Authorize(Roles = "ADMIN")]
        public async Task<IActionResult> RejectMachine(Guid id)
        {
            try
            {
                var currentUser = User.FindFirst(ClaimTypes.Name)?.Value ?? "unknown";
                using var conn = _dbService.CreateConnection();
                await conn.OpenAsync();

                string sql = "UPDATE machines SET approval_status = 'REJECTED' WHERE id = @id RETURNING name";
                using var cmd = new NpgsqlCommand(sql, conn);
                cmd.Parameters.AddWithValue("id", id);
                var result = await cmd.ExecuteScalarAsync();
                if (result == null) return NotFound(new { error = "Không tìm thấy máy" });

                await _auditService.LogAuditAsync(currentUser, "REJECT_MACHINE", $"Từ chối máy '{result}' (ID: {id})");
                return Ok(new { success = true, message = "Đã từ chối máy" });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { error = $"Lỗi từ chối máy: {ex.Message}" });
            }
        }

        // ── POST /api/machines/{id}/revoke ──
        [HttpPost("{id}/revoke")]
        [Authorize(Roles = "ADMIN")]
        public async Task<IActionResult> RevokeMachine(Guid id)
        {
            try
            {
                var currentUser = User.FindFirst(ClaimTypes.Name)?.Value ?? "unknown";
                using var conn = _dbService.CreateConnection();
                await conn.OpenAsync();

                string sql = "UPDATE machines SET approval_status = 'PENDING' WHERE id = @id RETURNING name";
                using var cmd = new NpgsqlCommand(sql, conn);
                cmd.Parameters.AddWithValue("id", id);
                var result = await cmd.ExecuteScalarAsync();
                if (result == null) return NotFound(new { error = "Không tìm thấy máy" });

                await _auditService.LogAuditAsync(currentUser, "REVOKE_MACHINE", $"Thu hồi quyền máy '{result}' (ID: {id})");
                return Ok(new { success = true, message = "Đã thu hồi quyền máy" });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { error = $"Lỗi thu hồi quyền máy: {ex.Message}" });
            }
        }

        // ── GET /api/machines/{id}/hourly-production ─────────────────────────────────
        [HttpGet("{id}/hourly-production")]
        [AllowAnonymous]
        public async Task<IActionResult> GetMachineHourlyProduction(Guid id)
        {
            var history = new List<object>();
            try
            {
                using var conn = _dbService.CreateConnection();
                await conn.OpenAsync();

                string sql = @"
                    SELECT prod_date, prod_hour, produced_qty_start, produced_qty_end, hourly_qty,
                           plc_run_time_start, plc_run_time_end, avg_cpu, avg_ram, received_at
                    FROM machine_hourly_production
                    WHERE machine_id = @machine_id
                    ORDER BY prod_date DESC, prod_hour DESC LIMIT 48";

                using var cmd = new NpgsqlCommand(sql, conn);
                cmd.Parameters.AddWithValue("machine_id", id);
                using var reader = await cmd.ExecuteReaderAsync();
                while (await reader.ReadAsync())
                {
                    history.Add(new
                    {
                        prodDate         = reader.GetDateTime(0).ToString("yyyy-MM-dd"),
                        prodHour         = reader.GetInt32(1),
                        producedQtyStart = reader.GetInt32(2),
                        producedQtyEnd   = reader.GetInt32(3),
                        hourlyQty        = reader.GetInt32(4),
                        plcRunTimeStart  = reader.GetInt32(5),
                        plcRunTimeEnd    = reader.GetInt32(6),
                        avgCpu           = reader.IsDBNull(7) ? 0.0 : reader.GetDouble(7),
                        avgRam           = reader.IsDBNull(8) ? 0.0 : reader.GetDouble(8),
                        receivedAt       = reader.GetDateTime(9)
                    });
                }
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { error = $"Lỗi lấy sản lượng: {ex.Message}" });
            }
            return Ok(history);
        }

    }

    public class MachineRequest
    {
        public string Name { get; set; } = "";
        public string? MachineCode { get; set; }
        public string? Ip { get; set; }
        public string? ClientId { get; set; }
        public Guid? LineId { get; set; }
    }
}
