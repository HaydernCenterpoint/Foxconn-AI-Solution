using PLC.Views;
using System;
using System.Collections.Generic;
using System.Windows;
using System.Windows.Controls;
using HslCommunication;
using PLC.Config;
using PLC.Network;
using PLC.Service;
using MessageBox = PLC.Views.CustomMessageBox;

namespace PLC.Views
{
    public partial class PlcIpPortConfigPage : UserControl
    {
        private readonly Dictionary<string, List<string>> _brandProtocols = new Dictionary<string, List<string>>
        {
            {
                "Mitsubishi Melsec",
                new List<string> { "MelsecMcNet", "MelsecMcAsciiNet", "MelsecMcUdp", "MelsecMcAsciiUdp", "MelsecA1ENet", "MelsecA1EUdp" }
            },
            {
                "Siemens",
                new List<string> { "SiemensS7Net_S1200", "SiemensS7Net_S1500", "SiemensS7Net_S300", "SiemensS7Net_S400", "SiemensS7Net_S200Smart", "SiemensFetchWriteNet" }
            },
            {
                "Common / Modbus",
                new List<string> { "ModbusTcpNet", "ModbusUdpNet", "ModbusRtuOverTcp", "ModbusAsciiOverTcp" }
            },
            {
                "Omron",
                new List<string> { "OmronFinsNet", "OmronFinsUdp", "OmronCipNet" }
            },
            {
                "Keyence",
                new List<string> { "KeyenceMcNet", "KeyenceMcAsciiNet", "KeyenceMcUdp", "KeyenceMcAsciiUdp" }
            },
            {
                "Delta",
                new List<string> { "DeltaDvpTcpNet", "DeltaDvpUdpNet", "DeltaDvpSerialOverTcp" }
            },
            {
                "Panasonic",
                new List<string> { "PanasonicMewtocOverTcp" }
            },
            {
                "LSIS",
                new List<string> { "LnetFastTcp" }
            },
            {
                "Fuji",
                new List<string> { "FujiSPHNet" }
            },
            {
                "Beckhoff",
                new List<string> { "BeckhoffAdsNet" }
            },
            {
                "Fatek",
                new List<string> { "FatekProLinkOverTcp" }
            },
            {
                "Khác / Hợp chuẩn",
                new List<string> { "PLCGeneric" }
            }
        };

        public PlcIpPortConfigPage()
        {
            InitializeComponent();
            this.Loaded += PlcIpPortConfigPage_Loaded;
            BtnSave.Click += BtnSave_Click;
            BtnTest.Click += BtnTest_Click;
            CboBrand.SelectionChanged += CboBrand_SelectionChanged;
            CboProtocol.SelectionChanged += CboProtocol_SelectionChanged;
        }

        private void PlcIpPortConfigPage_Loaded(object sender, RoutedEventArgs e)
        {
            LoadConfig();
            UpdateConnectionStatusDisplay();
        }

        private void LoadConfig()
        {
            AppConfig config = AppConfig.Current;
            CboBrand.Items.Clear();
            foreach (string key in _brandProtocols.Keys)
            {
                CboBrand.Items.Add(key);
            }

            string plcBrand = config.PlcBrand;
            string selectedBrand = "Khác / Hợp chuẩn";
            foreach (var bp in _brandProtocols)
            {
                if (bp.Value.Contains(plcBrand))
                {
                    selectedBrand = bp.Key;
                    break;
                }
            }

            CboBrand.SelectedItem = selectedBrand;
            CboProtocol.SelectedItem = plcBrand;

            TxtPlcIp.Text = config.PlcIp;
            TxtPlcPort.Text = config.PlcPort.ToString();
            TxtPlcRack.Text = config.PlcRack.ToString();
            TxtPlcSlot.Text = config.PlcSlot.ToString();
            TxtPlcStation.Text = config.PlcStation.ToString();
        }

        private void CboBrand_SelectionChanged(object sender, SelectionChangedEventArgs e)
        {
            if (CboBrand.SelectedItem is string key)
            {
                CboProtocol.Items.Clear();
                if (_brandProtocols.TryGetValue(key, out List<string>? list))
                {
                    foreach (string item in list)
                    {
                        CboProtocol.Items.Add(item);
                    }
                    if (CboProtocol.Items.Count > 0)
                    {
                        CboProtocol.SelectedIndex = 0;
                    }
                }
            }
        }

        private void CboProtocol_SelectionChanged(object sender, SelectionChangedEventArgs e)
        {
            if (CboProtocol.SelectedItem is string proto)
            {
                bool showAdv = proto.Contains("SiemensS7Net") || proto.Contains("Modbus") || proto.Contains("Omron") || proto.Contains("Fins");
                PanelAdvanced.Visibility = showAdv ? Visibility.Visible : Visibility.Collapsed;
                PanelRack.Visibility = proto.Contains("SiemensS7Net") ? Visibility.Visible : Visibility.Collapsed;
                PanelSlot.Visibility = proto.Contains("SiemensS7Net") ? Visibility.Visible : Visibility.Collapsed;
                PanelStation.Visibility = (proto.Contains("Modbus") || proto.Contains("Omron") || proto.Contains("Fins")) ? Visibility.Visible : Visibility.Collapsed;
            }
        }

        private void UpdateConnectionStatusDisplay()
        {
            if (MqttClientService.Instance.IsPlcConnected)
            {
                TxtConnStatus.Text = "Trạng thái: ĐÃ KẾT NỐI (" + MqttClientService.Instance.ConnectedPlcBrand + ")";
                TxtConnStatus.Foreground = new System.Windows.Media.SolidColorBrush(System.Windows.Media.Color.FromRgb(22, 163, 74));
            }
            else
            {
                TxtConnStatus.Text = "Trạng thái: MẤT KẾT NỐI";
                TxtConnStatus.Foreground = new System.Windows.Media.SolidColorBrush(System.Windows.Media.Color.FromRgb(220, 38, 38));
            }
        }

        private async void BtnTest_Click(object sender, RoutedEventArgs e)
        {
            string ip = TxtPlcIp.Text.Trim();
            if (!int.TryParse(TxtPlcPort.Text.Trim(), out int port))
            {
                CustomMessageBox.Show("Cổng PLC không hợp lệ!", "Lỗi nhập liệu", MessageBoxButton.OK, MessageBoxImage.Warning);
                return;
            }

            string proto = CboProtocol.SelectedItem?.ToString() ?? "MelsecMcNet";
            BtnTest.IsEnabled = false;
            TxtConnStatus.Text = "Trạng thái: Đang kết nối...";
            TxtConnStatus.Foreground = new System.Windows.Media.SolidColorBrush(System.Windows.Media.Color.FromRgb(249, 115, 22));

            try
            {
                int rack = int.TryParse(TxtPlcRack.Text, out int r) ? r : 0;
                int slot = int.TryParse(TxtPlcSlot.Text, out int s) ? s : 0;
                byte station = byte.TryParse(TxtPlcStation.Text, out byte st) ? st : (byte)1;

                bool success = await Task.Run(() => {
                    try
                    {
                        var oldRack = AppConfig.Current.PlcRack;
                        var oldSlot = AppConfig.Current.PlcSlot;
                        var oldStation = AppConfig.Current.PlcStation;

                        AppConfig.Current.PlcRack = rack;
                        AppConfig.Current.PlcSlot = slot;
                        AppConfig.Current.PlcStation = station;

                        var readWriteDevice = new PLCGeneric(proto, ip, port);

                        AppConfig.Current.PlcRack = oldRack;
                        AppConfig.Current.PlcSlot = oldSlot;
                        AppConfig.Current.PlcStation = oldStation;

                        if (readWriteDevice != null)
                        {
                            OperateResult operateResult = readWriteDevice.Connect();
                            if (operateResult.IsSuccess)
                            {
                                readWriteDevice.Disconnect();
                                return true;
                            }
                        }
                    }
                    catch { }
                    return false;
                });

                if (success)
                {
                    TxtConnStatus.Text = "Trạng thái: Kết nối THÀNH CÔNG!";
                    TxtConnStatus.Foreground = new System.Windows.Media.SolidColorBrush(System.Windows.Media.Color.FromRgb(22, 163, 74));
                    CustomMessageBox.Show($"Kết nối đến PLC ({proto} @ {ip}:{port}) thành công!", "Kết nối tốt", MessageBoxButton.OK, MessageBoxImage.Asterisk);
                }
                else
                {
                    TxtConnStatus.Text = "Trạng thái: Thử kết nối THẤT BẠI";
                    TxtConnStatus.Foreground = new System.Windows.Media.SolidColorBrush(System.Windows.Media.Color.FromRgb(220, 38, 38));
                    CustomMessageBox.Show($"Không thể kết nối đến PLC ({proto} @ {ip}:{port}). Hãy kiểm tra lại cấu hình và cáp mạng.", "Lỗi kết nối", MessageBoxButton.OK, MessageBoxImage.Hand);
                }
            }
            catch (Exception ex)
            {
                TxtConnStatus.Text = "Trạng thái: Lỗi kết nối";
                TxtConnStatus.Foreground = new System.Windows.Media.SolidColorBrush(System.Windows.Media.Color.FromRgb(220, 38, 38));
                CustomMessageBox.Show("Lỗi kết nối PLC: " + ex.Message, "Lỗi", MessageBoxButton.OK, MessageBoxImage.Error);
            }
            finally
            {
                BtnTest.IsEnabled = true;
            }
        }

        private void BtnSave_Click(object sender, RoutedEventArgs e)
        {
            try
            {
                AppConfig config = AppConfig.Current;
                config.PlcBrand = CboProtocol.SelectedItem?.ToString() ?? "MelsecMcNet";
                config.PlcIp = TxtPlcIp.Text.Trim();
                if (int.TryParse(TxtPlcPort.Text.Trim(), out int port))
                {
                    config.PlcPort = port;
                }
                if (int.TryParse(TxtPlcRack.Text.Trim(), out int rack)) config.PlcRack = rack;
                if (int.TryParse(TxtPlcSlot.Text.Trim(), out int slot)) config.PlcSlot = slot;
                if (int.TryParse(TxtPlcStation.Text.Trim(), out int station)) config.PlcStation = station;
                config.Save();

                MqttClientService.Instance.ReconnectDefaultPlc();
                UpdateConnectionStatusDisplay();

                CustomMessageBox.Show("Đã lưu cấu hình IP / Port PLC thành công!", "Thông báo", MessageBoxButton.OK, MessageBoxImage.Information);

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


