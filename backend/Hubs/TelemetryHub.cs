using System.Threading.Tasks;
using Microsoft.AspNetCore.SignalR;

namespace backend.Hubs
{
    public class TelemetryHub : Hub
    {
        public async Task JoinMachineGroup(string machineId)
        {
            await Groups.AddToGroupAsync(Context.ConnectionId, $"machine_{machineId}");
        }

        public async Task LeaveMachineGroup(string machineId)
        {
            await Groups.RemoveFromGroupAsync(Context.ConnectionId, $"machine_{machineId}");
        }

        public async Task JoinAll()
        {
            await Groups.AddToGroupAsync(Context.ConnectionId, "all_clients");
        }
    }
}
