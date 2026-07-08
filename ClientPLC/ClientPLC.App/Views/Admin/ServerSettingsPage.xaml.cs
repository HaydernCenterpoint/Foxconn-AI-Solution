using PLC.Views;
using System;
using System.Net.Sockets;
using System.Threading;
using System.Threading.Tasks;
using System.Windows;
using System.Windows.Controls;
using MQTTnet;
using PLC.Config;
using PLC.Network;
using PLC.Service;
using MessageBox = PLC.Views.CustomMessageBox;

namespace PLC.Views
{
    public partial class ServerSettingsPage : UserControl
    {
        public ServerSettingsPage()
        {
            InitializeComponent();
            this.Loaded += ServerSettingsPage_Loaded;
            BtnSave.Click += BtnSave_Click;
            BtnTestConnection.Click += BtnTestConnection_Click;
            BtnViewJson.Click += BtnViewJson_Click;
            BtnSendTest.Click += BtnSendTest_Click;
        }

        private void ServerSettingsPage_Loaded(object sender, RoutedEventArgs e)
        {
            LoadConfig();
        }

        private void LoadConfig()
        {
            AppConfig config = AppConfig.Current;
            TxtServerHost.Text = config.ServerHost;
            TxtServerPort.Text = config.ServerPort.ToString();
            TxtServerToken.Text = config.ServerToken;
        }

        private async void BtnTestConnection_Click(object sender, RoutedEventArgs e)
        {
            string host = TxtServerHost.Text.Trim();
            if (!int.TryParse(TxtServerPort.Text.Trim(), out int port))
            {
                CustomMessageBox.Show("Cổng Server không hợp lệ!", "Lỗi nhập liệu", MessageBoxButton.OK, MessageBoxImage.Warning);
                return;
            }

            BtnTestConnection.IsEnabled = false;
            try
            {
                var factory = new MqttClientFactory();
                using (var client = factory.CreateMqttClient())
                {
                    var options = factory.CreateClientOptionsBuilder()
                        .WithTcpServer(host, port)
                        .WithClientId("TestClient_" + Guid.NewGuid().ToString())
                        .WithCleanSession(true)
                        .Build();

                    using (var cts = new CancellationTokenSource(TimeSpan.FromSeconds(3)))
                    {
                        var connectResult = await client.ConnectAsync(options, cts.Token);
                        if (connectResult.ResultCode == MqttClientConnectResultCode.Success)
                        {
                            await client.DisconnectAsync();
                            CustomMessageBox.Show($"Kết nối đến MQTT Broker ({host}:{port}) thành công!", "Thành công", MessageBoxButton.OK, MessageBoxImage.Asterisk);
                        }
                        else
                        {
                            CustomMessageBox.Show($"Kết nối thất bại. Mã phản hồi: {connectResult.ResultCode}", "Lỗi", MessageBoxButton.OK, MessageBoxImage.Error);
                        }
                    }
                }
            }
            catch (Exception ex)
            {
                CustomMessageBox.Show("Lỗi kết nối MQTT: " + ex.Message, "Lỗi", MessageBoxButton.OK, MessageBoxImage.Error);
            }
            finally
            {
                BtnTestConnection.IsEnabled = true;
            }
        }

        private void BtnViewJson_Click(object sender, RoutedEventArgs e)
        {
            try
            {
                string json = MqttClientService.Instance.GenerateTelemetryJson();
                TxtJsonPreview.Text = json;
            }
            catch (Exception ex)
            {
                CustomMessageBox.Show("Lỗi tạo JSON: " + ex.Message, "Lỗi", MessageBoxButton.OK, MessageBoxImage.Error);
            }
        }

        private async void BtnSendTest_Click(object sender, RoutedEventArgs e)
        {
            if (!MqttClientService.Instance.IsConnectedToServer)
            {
                CustomMessageBox.Show("Server chưa kết nối hoặc đã bị tắt!", "Lỗi", MessageBoxButton.OK, MessageBoxImage.Warning);
                return;
            }

            BtnSendTest.IsEnabled = false;
            try
            {
                await MqttClientService.Instance.SendTelemetryManualAsync();
                CustomMessageBox.Show("Đã gửi thử dữ liệu Telemetry thành công!", "Thành công", MessageBoxButton.OK, MessageBoxImage.Asterisk);
            }
            catch (Exception ex)
            {
                CustomMessageBox.Show("Gửi dữ liệu lỗi: " + ex.Message, "Lỗi", MessageBoxButton.OK, MessageBoxImage.Error);
            }
            finally
            {
                BtnSendTest.IsEnabled = true;
            }
        }

        private void BtnSave_Click(object sender, RoutedEventArgs e)
        {
            try
            {
                AppConfig config = AppConfig.Current;
                config.ServerHost = TxtServerHost.Text.Trim();
                if (int.TryParse(TxtServerPort.Text.Trim(), out int port))
                {
                    config.ServerPort = port;
                }
                config.ServerToken = TxtServerToken.Text.Trim();
                config.Save();

                CustomMessageBox.Show("Đã lưu cấu hình kết nối Server thành công!", "Thông báo", MessageBoxButton.OK, MessageBoxImage.Information);

                if (Application.Current.MainWindow is MainWindow main)
                {
                    main.TranslateUI();
                }
            }
            catch (Exception ex)
            {
                CustomMessageBox.Show("Lỗi lưu cấu hình: " + ex.Message, "Lỗi", MessageBoxButton.OK, MessageBoxImage.Error);
            }
        }
    }
}


