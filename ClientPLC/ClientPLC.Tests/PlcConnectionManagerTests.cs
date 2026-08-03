using System;
using PLC.Config;
using PLC.Network;

namespace ClientPLC.Tests;

/// <summary>
/// Unit tests for <see cref="PlcConnectionManager"/> connection-state transitions.
/// </summary>
/// <remarks>
/// PlcConnectionManager is tightly coupled to the static <c>AppConfig.Current</c>
/// singleton and instantiates concrete <c>PLCGeneric</c> adapters, so only the
/// configuration-validation and no-op paths are unit-testable without a live PLC.
/// Testing the live Connect / backoff / reconnect paths requires the GĐ 3
/// refactor (inject an <c>IPLCAdapter</c> factory) and is left to integration tests.
/// No other test class touches <c>AppConfig.Current</c>, so it is safe to
/// reconfigure it here while restoring the original storage in a finally block.
/// </remarks>
public class PlcConnectionManagerTests
{
    private const string NotConfiguredConfigJson =
        "{\"plcIp\":\"\",\"plcBrand\":\"\",\"plcPort\":0,\"machineId\":\"unit-test-machine\",\"machineName\":\"Unit Test\"}";

    /// <summary>
    /// Reconfigures <c>AppConfig.Current</c> with the supplied JSON and restores
    /// the original storage on dispose.
    /// </summary>
    private static IDisposable BeginConfig(string json) => new AppConfigScope(json);

    private sealed class AppConfigScope : IDisposable
    {
        private readonly IConfigStorage _originalStorage;
        private bool _disposed;

        public AppConfigScope(string json)
        {
            _originalStorage = AppConfig.Storage;
            AppConfig.Storage = new InMemoryConfigStorage(json);
            AppConfig.Reload();
        }

        public void Dispose()
        {
            if (_disposed)
            {
                return;
            }
            _disposed = true;
            AppConfig.Storage = _originalStorage;
            AppConfig.Reload();
        }
    }

    [Fact]
    public void InitialState_IsDisconnectedAndNotConnected()
    {
        var mgr = new PlcConnectionManager();

        Assert.Equal(PlcConnectionState.Disconnected, mgr.ConnectionState);
        Assert.False(mgr.IsConnected);
        Assert.Null(mgr.PlcInstance);
        Assert.Equal(string.Empty, mgr.ConnectedBrand);
        Assert.Equal(string.Empty, mgr.LastError);
    }

    [Fact]
    public void EnsureConnected_WhenPlcNotConfigured_SetsNotConfiguredState()
    {
        using (BeginConfig(NotConfiguredConfigJson))
        {
            var mgr = new PlcConnectionManager();

            mgr.EnsureConnected();

            Assert.Equal(PlcConnectionState.NotConfigured, mgr.ConnectionState);
            Assert.False(mgr.IsConnected);
        }
    }

    [Fact]
    public void EnsureConnected_WhenPlcNotConfigured_DoesNotCreatePlcInstance()
    {
        using (BeginConfig(NotConfiguredConfigJson))
        {
            var mgr = new PlcConnectionManager();

            // Repeated calls must remain side-effect free: no background
            // connection attempt is spawned when PLC is not configured.
            mgr.EnsureConnected();
            mgr.EnsureConnected();
            mgr.EnsureConnected();

            Assert.Null(mgr.PlcInstance);
            Assert.Equal(PlcConnectionState.NotConfigured, mgr.ConnectionState);
        }
    }

    [Fact]
    public void ReconnectDefault_WhenPlcNotConfigured_SetsNotConfiguredState()
    {
        using (BeginConfig(NotConfiguredConfigJson))
        {
            var mgr = new PlcConnectionManager();

            mgr.ReconnectDefault();

            Assert.Equal(PlcConnectionState.NotConfigured, mgr.ConnectionState);
            Assert.False(mgr.IsConnected);
            Assert.Null(mgr.PlcInstance);
        }
    }

    [Fact]
    public void Disconnect_WhenNotConnected_KeepsDisconnectedAndNullPlcInstance()
    {
        // No AppConfig dependency: Disconnect only mutates the in-memory state.
        var mgr = new PlcConnectionManager();

        mgr.Disconnect();

        Assert.Equal(PlcConnectionState.Disconnected, mgr.ConnectionState);
        Assert.False(mgr.IsConnected);
        Assert.Null(mgr.PlcInstance);
    }
}
