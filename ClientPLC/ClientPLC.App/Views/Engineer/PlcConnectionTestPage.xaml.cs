using System;
using System.Collections.Generic;
using System.Net.NetworkInformation;
using System.Net.Sockets;
using System.Text;
using System.Threading.Tasks;
using System.Windows;
using System.Windows.Controls;
using HslCommunication;
using PLC.Config;
using PLC.Network;
using PLC.Service;
using MessageBox = PLC.Views.CustomMessageBox;

namespace PLC.Views;

public partial class PlcConnectionTestPage : UserControl, ILocalizable
{
    private static readonly Dictionary<string, string> _viTexts = new Dictionary<string, string>
    {
        { "StartDiag", "--- Bắt đầu phiên chẩn đoán PLC ({0}) ---" },
        { "PingStart", "Đang gửi ICMP Ping đến {0}..." },
        { "PingSuccess", "Ping thành công! Thời gian phản hồi: {0} ms. TTL: {1}" },
        { "PingFail", "Ping thất bại: {0}" },
        { "PingErr", "Ping lỗi: {0}" },
        { "TcpStart", "Đang kiểm tra kết nối cổng TCP {0}:{1}..." },
        { "TcpSuccess", "TCP Socket kết nối THÀNH CÔNG đến {0}:{1}!" },
        { "TcpTimeout", "TCP Socket kết nối THẤT BẠI: Hết thời gian chờ (Timeout)." },
        { "TcpErr", "TCP Socket lỗi: {0}" },
        { "ReadStart", "Đang thử đọc thanh ghi thử nghiệm với driver {0}..." },
        { "ReadTestAddr", "Thử đọc địa chỉ mặc định {0}..." },
        { "ReadSuccess", "Đọc thành công! Giá trị Int16 tại {0} = {1}" },
        { "ReadFail", "Lỗi đọc thanh ghi: {0}" },
        { "DriverErr", "Không thể mở kết nối driver PLC: {0}" },
        { "ThreadErr", "Lỗi luồng test: {0}" },
        { "TestFinishSuccess", "Kiểm tra đọc ghi driver kết thúc: THÀNH CÔNG" },
        { "TestFinishFail", "Kiểm tra đọc ghi driver kết thúc: THẤT BẠI" },
        { "ExecErr", "Lỗi thực thi kiểm tra: {0}" }
    };

    private static readonly Dictionary<string, string> _enTexts = new Dictionary<string, string>
    {
        { "StartDiag", "--- Starting PLC diagnostics ({0}) ---" },
        { "PingStart", "Sending ICMP Ping to {0}..." },
        { "PingSuccess", "Ping successful! Response time: {0} ms. TTL: {1}" },
        { "PingFail", "Ping failed: {0}" },
        { "PingErr", "Ping error: {0}" },
        { "TcpStart", "Testing TCP connection to {0}:{1}..." },
        { "TcpSuccess", "TCP Socket connected SUCCESSFULLY to {0}:{1}!" },
        { "TcpTimeout", "TCP Socket connection FAILED: Timeout." },
        { "TcpErr", "TCP Socket error: {0}" },
        { "ReadStart", "Testing register read with driver {0}..." },
        { "ReadTestAddr", "Testing read at default address {0}..." },
        { "ReadSuccess", "Read successful! Int16 value at {0} = {1}" },
        { "ReadFail", "Register read failed: {0}" },
        { "DriverErr", "Cannot open PLC driver connection: {0}" },
        { "ThreadErr", "Thread test error: {0}" },
        { "TestFinishSuccess", "Driver read/write test finished: SUCCESS" },
        { "TestFinishFail", "Driver read/write test finished: FAILED" },
        { "ExecErr", "Test execution error: {0}" }
    };

    private static readonly Dictionary<string, string> _zhTexts = new Dictionary<string, string>
    {
        { "StartDiag", "--- 开始 PLC 诊断 ({0}) ---" },
        { "PingStart", "正在向 {0} 发送 ICMP Ping..." },
        { "PingSuccess", "Ping 成功！响应时间: {0} ms. TTL: {1}" },
        { "PingFail", "Ping 失败: {0}" },
        { "PingErr", "Ping 错误: {0}" },
        { "TcpStart", "正在测试到 {0}:{1} 的 TCP 连接..." },
        { "TcpSuccess", "TCP 套接字成功连接 to {0}:{1}！" },
        { "TcpTimeout", "TCP 套接字连接失败: 超时。" },
        { "TcpErr", "TCP 套接字错误: {0}" },
        { "ReadStart", "正在使用驱动程序 {0} 测试寄存器读取..." },
        { "ReadTestAddr", "正在测试默认地址 {0} 的读取..." },
        { "ReadSuccess", "读取成功！ {0} 处的 Int16 值 = {1}" },
        { "ReadFail", "寄存器读取失败: {0}" },
        { "DriverErr", "无法打开 PLC 驱动程序连接: {0}" },
        { "ThreadErr", "线程测试错误: {0}" },
        { "TestFinishSuccess", "驱动读写测试完成: 成功" },
        { "TestFinishFail", "驱动读写测试完成: 失败" },
        { "ExecErr", "测试执行错误: {0}" }
    };

    public PlcConnectionTestPage()
    {
        InitializeComponent();
        this.Loaded += PlcConnectionTestPage_Loaded;
        BtnPing.Click += BtnPing_Click;
        BtnTestTcp.Click += BtnTestTcp_Click;
        BtnReadTest.Click += BtnReadTest_Click;
        BtnClear.Click += BtnClear_Click;
    }

    private void PlcConnectionTestPage_Loaded(object sender, RoutedEventArgs e)
    {
        AppConfig config = AppConfig.Current;
        TxtPlcIp.Text = config.PlcIp;
        TxtPlcPort.Text = config.PlcPort.ToString();
        TranslateUI();
        Log(GetLogText("StartDiag", config.PlcBrand));
    }

    public void TranslateUI()
    {
        string lang = LanguageManager.CurrentLanguageCode.ToLower();
        if (lang.StartsWith("zh"))
        {
            TxtTitle.Text = "PLC 连接测试与诊断";
            LblIp.Content = "PLC IP 地址 / 主机:";
            LblPort.Content = "连接端口:";
            BtnPing.Content = "Ping PLC IP";
            BtnTestTcp.Content = "测试 TCP";
            BtnReadTest.Content = "测试寄存器读取";
            BtnClear.Content = "清除日志";
            TxtResultLabel.Text = "诊断结果:";
        }
        else if (lang.StartsWith("en"))
        {
            TxtTitle.Text = "PLC Connection & Diagnostics";
            LblIp.Content = "PLC IP / Host:";
            LblPort.Content = "Connection Port:";
            BtnPing.Content = "Ping PLC IP";
            BtnTestTcp.Content = "Test TCP";
            BtnReadTest.Content = "Read Register Test";
            BtnClear.Content = "Clear Logs";
            TxtResultLabel.Text = "Diagnostic Results:";
        }
        else
        {
            TxtTitle.Text = "Kiểm tra kết nối PLC & Chẩn đoán";
            LblIp.Content = "IP Address / Host PLC:";
            LblPort.Content = "Cổng kết nối (Port):";
            BtnPing.Content = "Ping PLC IP";
            BtnTestTcp.Content = "Kiểm tra TCP";
            BtnReadTest.Content = "Đọc thử thanh ghi";
            BtnClear.Content = "Xóa nhật ký";
            TxtResultLabel.Text = "Kết quả chẩn đoán:";
        }
    }

    private string GetLogText(string key, params object[] args)
    {
        string lang = LanguageManager.CurrentLanguageCode.ToLower();
        string? pattern = null;
        if (lang.StartsWith("zh"))
        {
            _zhTexts.TryGetValue(key, out pattern);
        }
        else if (lang.StartsWith("en"))
        {
            _enTexts.TryGetValue(key, out pattern);
        }
        else
        {
            _viTexts.TryGetValue(key, out pattern);
        }
        pattern ??= key;
        try
        {
            return string.Format(pattern, args);
        }
        catch
        {
            return pattern;
        }
    }

    private void Log(string message)
    {
        TxtLogConsole.AppendText($"[{DateTime.Now:HH:mm:ss}] {message}\n");
        TxtLogConsole.ScrollToEnd();
    }

    private void BtnClear_Click(object sender, RoutedEventArgs e)
    {
        TxtLogConsole.Clear();
    }

    private async void BtnPing_Click(object sender, RoutedEventArgs e)
    {
        string ip = TxtPlcIp.Text.Trim();
        if (string.IsNullOrEmpty(ip)) return;
        Log(GetLogText("PingStart", ip));
        BtnPing.IsEnabled = false;

        try
        {
            using (Ping ping = new Ping())
            {
                PingReply reply = await ping.SendPingAsync(ip, 2000);
                if (reply.Status == IPStatus.Success)
                {
                    Log(GetLogText("PingSuccess", reply.RoundtripTime, reply.Options?.Ttl));
                }
                else
                {
                    Log(GetLogText("PingFail", reply.Status));
                }
            }
        }
        catch (Exception ex)
        {
            Log(GetLogText("PingErr", ex.Message));
        }
        finally
        {
            BtnPing.IsEnabled = true;
        }
    }

    private async void BtnTestTcp_Click(object sender, RoutedEventArgs e)
    {
        string ip = TxtPlcIp.Text.Trim();
        if (!int.TryParse(TxtPlcPort.Text.Trim(), out int port)) return;
        Log(GetLogText("TcpStart", ip, port));
        BtnTestTcp.IsEnabled = false;

        try
        {
            using (TcpClient client = new TcpClient())
            {
                var connectTask = client.ConnectAsync(ip, port);
                var delayTask = Task.Delay(2500);
                if (await Task.WhenAny(connectTask, delayTask) == connectTask)
                {
                    await connectTask;
                    Log(GetLogText("TcpSuccess", ip, port));
                }
                else
                {
                    Log(GetLogText("TcpTimeout"));
                }
            }
        }
        catch (Exception ex)
        {
            Log(GetLogText("TcpErr", ex.Message));
        }
        finally
        {
            BtnTestTcp.IsEnabled = true;
        }
    }

    private async void BtnReadTest_Click(object sender, RoutedEventArgs e)
    {
        AppConfig config = AppConfig.Current;
        string ip = config.PlcIp;
        int port = config.PlcPort;
        string proto = config.PlcBrand;
        Log(GetLogText("ReadStart", proto));
        BtnReadTest.IsEnabled = false;

        try
        {
            bool success = await Task.Run(() => {
                try
                {
                    var device = new PLCGeneric(proto, ip, port);
                    if (device != null)
                    {
                        OperateResult operateResult = device.Connect();
                        if (operateResult.IsSuccess)
                        {
                            string testAddr = proto.Contains("Melsec") ? "D100" : (proto.Contains("Siemens") ? "DB1.DBD0" : "40001");
                            Log(GetLogText("ReadTestAddr", testAddr));
                            var read = device.ReadInt16(testAddr);
                            if (read.IsSuccess)
                            {
                                Log(GetLogText("ReadSuccess", testAddr, read.Content));
                                device.Disconnect();
                                return true;
                            }
                            else
                            {
                                Log(GetLogText("ReadFail", read.Message));
                            }
                            device.Disconnect();
                        }
                        else
                        {
                            Log(GetLogText("DriverErr", operateResult.Message));
                        }
                    }
                }
                catch (Exception ex)
                {
                    Log(GetLogText("ThreadErr", ex.Message));
                }
                return false;
            });

            if (success)
            {
                Log(GetLogText("TestFinishSuccess"));
            }
            else
            {
                Log(GetLogText("TestFinishFail"));
            }
        }
        catch (Exception ex)
        {
            Log(GetLogText("ExecErr", ex.Message));
        }
        finally
        {
            BtnReadTest.IsEnabled = true;
        }
    }
}

