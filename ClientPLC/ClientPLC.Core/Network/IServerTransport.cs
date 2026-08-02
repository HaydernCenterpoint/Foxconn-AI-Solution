using System;
using System.Threading;
using System.Threading.Tasks;

namespace PLC.Network;

public interface IServerTransport
{
    bool IsConnected { get; }
    event Action<string> OnLogReceived;
    event Func<string, Task> OnMessageReceived;
    event Func<Task> OnConnected;

    void Start();
    void Stop();
    Task StopAsync();
    Task<bool> SendMessageAsync(string topic, string payload, CancellationToken token);
}
