using HslCommunication;

namespace PLC;

public interface IPLCAdapter
{
    string ClassName { get; }
    string IpAddressOrPort { get; }
    int PortOrBaudRate { get; }

    OperateResult Connect();
    OperateResult Disconnect();

    OperateResult<short> ReadInt16(string address);
    OperateResult<short[]> ReadInt16(string address, ushort length);
    OperateResult<ushort> ReadUInt16(string address);
    OperateResult<ushort[]> ReadUInt16(string address, ushort length);
    OperateResult<int> ReadInt32(string address);
    OperateResult<int[]> ReadInt32(string address, ushort length);
    OperateResult<uint> ReadUInt32(string address);
    OperateResult<uint[]> ReadUInt32(string address, ushort length);
    OperateResult<float> ReadFloat(string address);
    OperateResult<float[]> ReadFloat(string address, ushort length);
    OperateResult<double> ReadDouble(string address);
    OperateResult<double[]> ReadDouble(string address, ushort length);
    OperateResult<bool> ReadBool(string address);
    OperateResult<bool[]> ReadBool(string address, ushort length);
    OperateResult<string> ReadString(string address, ushort length);

    OperateResult Write(string address, short value);
    OperateResult Write(string address, short[] values);
    OperateResult Write(string address, ushort value);
    OperateResult Write(string address, ushort[] values);
    OperateResult Write(string address, int value);
    OperateResult Write(string address, int[] values);
    OperateResult Write(string address, uint value);
    OperateResult Write(string address, uint[] values);
    OperateResult Write(string address, float value);
    OperateResult Write(string address, float[] values);
    OperateResult Write(string address, double value);
    OperateResult Write(string address, double[] values);
    OperateResult Write(string address, bool value);
    OperateResult Write(string address, bool[] values);
    OperateResult Write(string address, string value);
}
