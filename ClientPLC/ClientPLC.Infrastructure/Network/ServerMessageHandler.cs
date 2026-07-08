using System;
using System.Text.Json;
using System.Threading;
using System.Threading.Tasks;
using PLC.Config;
using PLC.Service;

namespace PLC.Network;

public class ServerMessageHandler
{
    private readonly IServerTransport _transport;
    private readonly MqttClientService _mqttClientService;

    public ServerMessageHandler(IServerTransport transport, MqttClientService mqttClientService)
    {
        _transport = transport;
        _mqttClientService = mqttClientService;
        _transport.OnMessageReceived += ProcessServerMessageAsync;
    }

    private void Log(string msg)
    {
        System.Diagnostics.Debug.WriteLine($"[{DateTime.Now:yyyy-MM-dd HH:mm:ss}] [ServerMessageHandler] {msg}");
    }

    private async Task ProcessServerMessageAsync(string json)
    {
        try
        {
            using JsonDocument doc = JsonDocument.Parse(json);
            JsonElement root = doc.RootElement;
            
            string? messageType = root.TryGetProperty("messageType", out var mt) ? mt.GetString() : null;
            string? messageId = root.TryGetProperty("messageId", out var mid) ? mid.GetString() : null;
            
            switch (messageType)
            {
                case "registerAck":
                    bool success = root.TryGetProperty("payload", out var p) && p.TryGetProperty("success", out var s) && s.GetBoolean();
                    Log($"Server: RegisterAck nhận được — Success={success}");
                    break;
                case "heartbeatAck":
                    Log("Server: HeartbeatAck nhận được.");
                    break;
                case "ack":
                    Log("Server: ACK nhận được cho message " + messageId);
                    break;
                case "command":
                    if (root.TryGetProperty("payload", out var cmdPayload))
                    {
                        await HandleServerCommandAsync(messageId ?? Guid.NewGuid().ToString(), cmdPayload);
                    }
                    break;
                default:
                    if (root.TryGetProperty("cmd", out var _))
                    {
                        await ProcessCommandAsync(json);
                    }
                    break;
            }
        }
        catch (Exception ex)
        {
            System.Diagnostics.Debug.WriteLine("[ServerMessageHandler] Error processing server message: " + ex.Message);
        }
    }

    private async Task ProcessCommandAsync(string jsonCmd)
    {
        try
        {
            using JsonDocument doc = JsonDocument.Parse(jsonCmd);
            JsonElement root = doc.RootElement;
            if (!root.TryGetProperty("cmd", out var cmdProp))
            {
                return;
            }
            string? cmd = cmdProp.GetString();
            string reqId = (root.TryGetProperty("id", out var idProp) ? idProp.GetString() : Guid.NewGuid().ToString()) ?? Guid.NewGuid().ToString();
            Log($"Server Command: Nhận lệnh '{cmd}' (ID: {reqId})");
            
            switch (cmd?.ToLower())
            {
                case "connect":
                    await HandleConnectCommandAsync(reqId, root);
                    break;
                case "disconnect":
                    await HandleDisconnectCommandAsync(reqId);
                    break;
                case "configure":
                    await HandleConfigureCommandAsync(reqId, root);
                    break;
                case "read":
                    await HandleReadCommandAsync(reqId, root);
                    break;
                case "write":
                    await HandleWriteCommandAsync(reqId, root);
                    break;
                default:
                    await SendErrorResponseAsync(reqId, "Unknown command '" + cmd + "'");
                    break;
            }
        }
        catch (Exception ex)
        {
            System.Diagnostics.Debug.WriteLine("[ServerMessageHandler] Error processing command: " + ex.Message);
        }
    }

    private async Task HandleServerCommandAsync(string commandId, JsonElement payload)
    {
        string? commandType = payload.TryGetProperty("commandType", out var ct) ? ct.GetString() : null;
        Log($"Server Command: Nhận lệnh '{commandType}' (ID: {commandId})");
        switch (commandType?.ToLower())
        {
            case "reloadconfig":
                if (payload.TryGetProperty("parameters", out var prms))
                {
                    await HandleConfigureCommandAsync(commandId, prms);
                }
                break;
            case "getstatus":
            case "refreshmachinedata":
                await _mqttClientService.RefreshStatusAsync();
                await SendCommandResultAsync(commandId, success: true, "Status refreshed");
                break;
            case "getversion":
                await SendCommandResultAsync(commandId, success: true, "1.0.0");
                break;
            case "restartconnection":
                await SendCommandResultAsync(commandId, success: true, "Reconnecting...");
                _mqttClientService.RestartConnection();
                break;
            case "synctime":
                await SendCommandResultAsync(commandId, success: true, DateTime.UtcNow.ToString("o"));
                break;
            default:
                await SendCommandResultAsync(commandId, success: false, "Unknown command: " + commandType);
                break;
        }
    }

    private async Task HandleConnectCommandAsync(string reqId, JsonElement root)
    {
        try
        {
            if (!root.TryGetProperty("brand", out var brandProp) || !root.TryGetProperty("ip", out var ipProp) || !root.TryGetProperty("port", out var portProp))
            {
                await SendErrorResponseAsync(reqId, "Missing connection parameters (brand, ip, port)");
                return;
            }
            string? brand = brandProp.GetString();
            string? ip = ipProp.GetString();
            int port = portProp.GetInt32();
            if (brand != null && ip != null)
            {
                bool success = await _mqttClientService.ConnectPlcAsync(brand, ip, port);
                if (success)
                {
                    await SendResponseAsync(new
                    {
                        type = "response",
                        id = reqId,
                        success = true,
                        message = $"Connected to PLC {brand} ({ip}:{port}) successfully."
                    });
                }
                else
                {
                    await SendErrorResponseAsync(reqId, "Failed to connect to PLC.");
                }
            }
            else
            {
                await SendErrorResponseAsync(reqId, "Connect parameters null.");
            }
        }
        catch (Exception ex)
        {
            await SendErrorResponseAsync(reqId, "Exception: " + ex.Message);
        }
    }

    private async Task HandleDisconnectCommandAsync(string reqId)
    {
        try
        {
            await _mqttClientService.DisconnectPlcAsync();
            await SendResponseAsync(new
            {
                type = "response",
                id = reqId,
                success = true,
                message = "PLC disconnected successfully."
            });
        }
        catch (Exception ex)
        {
            await SendErrorResponseAsync(reqId, ex.Message);
        }
    }

    private async Task HandleReadCommandAsync(string reqId, JsonElement root)
    {
        try
        {
            if (!root.TryGetProperty("address", out var addrProp) || !root.TryGetProperty("dataType", out var typeProp))
            {
                await SendErrorResponseAsync(reqId, "Missing read parameters (address, dataType)");
                return;
            }
            string? address = addrProp.GetString();
            string? dataType = typeProp.GetString();
            ushort length = root.TryGetProperty("length", out var lenProp) ? lenProp.GetUInt16() : (ushort)1;

            if (address != null && dataType != null)
            {
                var (success, value, error) = await _mqttClientService.ReadPlcAsync(address, dataType, length);
                if (success)
                {
                    await SendResponseAsync(new
                    {
                        type = "response",
                        id = reqId,
                        success = true,
                        value = value
                    });
                }
                else
                {
                    await SendErrorResponseAsync(reqId, "Read failed: " + error);
                }
            }
        }
        catch (Exception ex)
        {
            await SendErrorResponseAsync(reqId, ex.Message);
        }
    }

    private async Task HandleWriteCommandAsync(string reqId, JsonElement root)
    {
        try
        {
            if (!root.TryGetProperty("address", out var addrProp) || !root.TryGetProperty("dataType", out var typeProp) || !root.TryGetProperty("value", out var valProp))
            {
                await SendErrorResponseAsync(reqId, "Missing write parameters (address, dataType, value)");
                return;
            }
            string? address = addrProp.GetString();
            string? dataType = typeProp.GetString();

            if (address != null && dataType != null)
            {
                var (success, error) = await _mqttClientService.WritePlcAsync(address, dataType, valProp);
                if (success)
                {
                    await SendResponseAsync(new
                    {
                        type = "response",
                        id = reqId,
                        success = true,
                        message = "Write successful."
                    });
                }
                else
                {
                    await SendErrorResponseAsync(reqId, error);
                }
            }
        }
        catch (Exception ex)
        {
            await SendErrorResponseAsync(reqId, ex.Message);
        }
    }

    private async Task HandleConfigureCommandAsync(string reqId, JsonElement root)
    {
        try
        {
            string? brand = root.TryGetProperty("brand", out var bProp) ? bProp.GetString() : null;
            string? ip = root.TryGetProperty("ip", out var ipProp) ? ipProp.GetString() : null;
            int port = root.TryGetProperty("port", out var pProp) ? pProp.GetInt32() : 0;
            string readAddresses = (root.TryGetProperty("read_addresses", out var raProp) ? raProp.GetString() : "") ?? "";

            await _mqttClientService.ConfigurePlcAsync(brand ?? "", ip ?? "", port, readAddresses);

            await SendResponseAsync(new
            {
                type = "response",
                id = reqId,
                success = true,
                message = "Configuration applied and PLC reconnected successfully."
            });
        }
        catch (Exception ex)
        {
            await SendErrorResponseAsync(reqId, ex.Message);
        }
    }

    private async Task SendCommandResultAsync(string commandId, bool success, string message)
    {
        if (!_transport.IsConnected) return;
        AppConfig config = AppConfig.Current;
        var envelope = new
        {
            protocolVersion = 1,
            messageId = Guid.NewGuid().ToString(),
            messageType = "commandResult",
            clientId = config.MachineId,
            sentAt = DateTime.UtcNow,
            payload = new { commandId, success, message }
        };

        string topic = $"client/{config.MachineId}/command_result";
        string json = JsonSerializer.Serialize(envelope, new JsonSerializerOptions
        {
            PropertyNamingPolicy = JsonNamingPolicy.CamelCase
        });
        await _transport.SendMessageAsync(topic, json, CancellationToken.None);
    }

    private async Task SendErrorResponseAsync(string reqId, string errorMsg)
    {
        await SendResponseAsync(new
        {
            type = "response",
            id = reqId,
            success = false,
            error = errorMsg
        });
    }

    private async Task SendResponseAsync(object obj)
    {
        AppConfig config = AppConfig.Current;
        string topic = $"client/{config.MachineId}/command_result";
        string json = JsonSerializer.Serialize(obj, new JsonSerializerOptions
        {
            PropertyNamingPolicy = JsonNamingPolicy.CamelCase
        });
        await _transport.SendMessageAsync(topic, json, CancellationToken.None);
    }
}
