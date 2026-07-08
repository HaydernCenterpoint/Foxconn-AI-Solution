using System;
using System.Reflection;
using HslCommunication;
using HslCommunication.Core;
using PLC.Config;

namespace PLC;

public class PLCGeneric : IPLCAdapter
{
	private readonly IReadWriteNet _plc;

	public IReadWriteNet Plc => _plc;

	public string ClassName { get; }

	public string IpAddressOrPort { get; }

	public int PortOrBaudRate { get; }

	private static readonly Dictionary<string, Type> _typeCache = new Dictionary<string, Type>(StringComparer.OrdinalIgnoreCase);
	private static readonly object _cacheLock = new object();

	public PLCGeneric(string plcClassName, string ipAddressOrPort, int portOrBaudRate)
	{
		ClassName = plcClassName;
		IpAddressOrPort = ipAddressOrPort;
		PortOrBaudRate = portOrBaudRate;
		string text = plcClassName;
		if (plcClassName.StartsWith("SiemensS7Net", StringComparison.OrdinalIgnoreCase))
		{
			text = "SiemensS7Net";
		}
		Type type = null;
		lock (_cacheLock)
		{
			if (!_typeCache.TryGetValue(text, out type))
			{
				Assembly assembly = typeof(OperateResult).Assembly;
				Type[] types = assembly.GetTypes();
				foreach (Type type2 in types)
				{
					if (type2.IsClass && type2.IsPublic && !type2.IsAbstract && type2.Name.Equals(text, StringComparison.OrdinalIgnoreCase))
					{
						type = type2;
						break;
					}
				}
				if (type != null)
				{
					_typeCache[text] = type;
				}
			}
		}
		if (type == null)
		{
			throw new NotSupportedException("The PLC driver class '" + plcClassName + "' was not found in the installed HslCommunication library. Please verify the class name or upgrade HslCommunication.");
		}
		if (!typeof(IReadWriteNet).IsAssignableFrom(type))
		{
			throw new InvalidOperationException("The class '" + plcClassName + "' does not implement IReadWriteNet interface.");
		}
		try
		{
			if (!(Activator.CreateInstance(type) is IReadWriteNet readWriteNet))
			{
				throw new InvalidOperationException("Failed to create parameterless instance of " + text + ".");
			}
			type.GetProperty("IpAddress")?.SetValue(readWriteNet, ipAddressOrPort);
			type.GetProperty("Port")?.SetValue(readWriteNet, portOrBaudRate);
			type.GetProperty("PortName")?.SetValue(readWriteNet, ipAddressOrPort);
			type.GetProperty("BaudRate")?.SetValue(readWriteNet, portOrBaudRate);
			if (plcClassName.StartsWith("SiemensS7Net", StringComparison.OrdinalIgnoreCase))
			{
				PropertyInfo property = type.GetProperty("CurrentPlcs");
				if (property != null)
				{
					object obj = null;
					obj = (plcClassName.EndsWith("_S1500") ? Enum.Parse(property.PropertyType, "S1500") : (plcClassName.EndsWith("_S300") ? Enum.Parse(property.PropertyType, "S300") : (plcClassName.EndsWith("_S400") ? Enum.Parse(property.PropertyType, "S400") : (plcClassName.EndsWith("_S200Smart") ? Enum.Parse(property.PropertyType, "S200Smart") : ((!plcClassName.EndsWith("_S200")) ? Enum.Parse(property.PropertyType, "S1200") : Enum.Parse(property.PropertyType, "S200"))))));
					property.SetValue(readWriteNet, obj);
				}
			}
			AppConfig current = AppConfig.Current;
			PropertyInfo property2 = type.GetProperty("Rack");
			if (property2 != null && property2.CanWrite)
			{
				try
				{
					property2.SetValue(readWriteNet, Convert.ChangeType(current.PlcRack, property2.PropertyType));
				}
				catch
				{
				}
			}
			PropertyInfo property3 = type.GetProperty("Slot");
			if (property3 != null && property3.CanWrite)
			{
				try
				{
					property3.SetValue(readWriteNet, Convert.ChangeType(current.PlcSlot, property3.PropertyType));
				}
				catch
				{
				}
			}
			PropertyInfo property4 = type.GetProperty("Station");
			if (property4 != null && property4.CanWrite)
			{
				try
				{
					property4.SetValue(readWriteNet, Convert.ChangeType(current.PlcStation, property4.PropertyType));
				}
				catch
				{
				}
			}
			PropertyInfo property5 = type.GetProperty("ConnectTimeout");
			if (property5 != null && property5.CanWrite)
			{
				try
				{
					property5.SetValue(readWriteNet, 1000);
				}
				catch
				{
				}
			}
			PropertyInfo property6 = type.GetProperty("ReceiveTimeout");
			if (property6 != null && property6.CanWrite)
			{
				try
				{
					property6.SetValue(readWriteNet, 1000);
				}
				catch
				{
				}
			}
			_plc = readWriteNet;
		}
		catch (Exception ex)
		{
			throw new InvalidOperationException("Error instantiating " + plcClassName + ": " + ex.Message, ex);
		}
	}

	public OperateResult Connect()
	{
		if (_plc == null)
		{
			return new OperateResult("PLC not initialized");
		}
		MethodInfo method = _plc.GetType().GetMethod("ConnectServer", Type.EmptyTypes);
		if (method != null)
		{
			return (OperateResult)method.Invoke(_plc, null);
		}
		MethodInfo method2 = _plc.GetType().GetMethod("Open", Type.EmptyTypes);
		if (method2 != null)
		{
			return (OperateResult)method2.Invoke(_plc, null);
		}
		return OperateResult.CreateSuccessResult();
	}

	public OperateResult Disconnect()
	{
		if (_plc == null)
		{
			return new OperateResult("PLC not initialized");
		}
		MethodInfo method = _plc.GetType().GetMethod("ConnectClose", Type.EmptyTypes);
		if (method != null)
		{
			return (OperateResult)method.Invoke(_plc, null);
		}
		MethodInfo method2 = _plc.GetType().GetMethod("Close", Type.EmptyTypes);
		if (method2 != null)
		{
			return (OperateResult)method2.Invoke(_plc, null);
		}
		return OperateResult.CreateSuccessResult();
	}

	public OperateResult<short> ReadInt16(string address)
	{
		return _plc.ReadInt16(address);
	}

	public OperateResult<short[]> ReadInt16(string address, ushort length)
	{
		return _plc.ReadInt16(address, length);
	}

	public OperateResult<ushort> ReadUInt16(string address)
	{
		return _plc.ReadUInt16(address);
	}

	public OperateResult<ushort[]> ReadUInt16(string address, ushort length)
	{
		return _plc.ReadUInt16(address, length);
	}

	public OperateResult<int> ReadInt32(string address)
	{
		return _plc.ReadInt32(address);
	}

	public OperateResult<int[]> ReadInt32(string address, ushort length)
	{
		return _plc.ReadInt32(address, length);
	}

	public OperateResult<uint> ReadUInt32(string address)
	{
		return _plc.ReadUInt32(address);
	}

	public OperateResult<uint[]> ReadUInt32(string address, ushort length)
	{
		return _plc.ReadUInt32(address, length);
	}

	public OperateResult<float> ReadFloat(string address)
	{
		return _plc.ReadFloat(address);
	}

	public OperateResult<float[]> ReadFloat(string address, ushort length)
	{
		return _plc.ReadFloat(address, length);
	}

	public OperateResult<double> ReadDouble(string address)
	{
		return _plc.ReadDouble(address);
	}

	public OperateResult<double[]> ReadDouble(string address, ushort length)
	{
		return _plc.ReadDouble(address, length);
	}

	public OperateResult<bool> ReadBool(string address)
	{
		return _plc.ReadBool(address);
	}

	public OperateResult<bool[]> ReadBool(string address, ushort length)
	{
		return _plc.ReadBool(address, length);
	}

	public OperateResult<string> ReadString(string address, ushort length)
	{
		return _plc.ReadString(address, length);
	}

	public OperateResult Write(string address, short value)
	{
		return _plc.Write(address, value);
	}

	public OperateResult Write(string address, short[] values)
	{
		return _plc.Write(address, values);
	}

	public OperateResult Write(string address, ushort value)
	{
		return _plc.Write(address, value);
	}

	public OperateResult Write(string address, ushort[] values)
	{
		return _plc.Write(address, values);
	}

	public OperateResult Write(string address, int value)
	{
		return _plc.Write(address, value);
	}

	public OperateResult Write(string address, int[] values)
	{
		return _plc.Write(address, values);
	}

	public OperateResult Write(string address, uint value)
	{
		return _plc.Write(address, value);
	}

	public OperateResult Write(string address, uint[] values)
	{
		return _plc.Write(address, values);
	}

	public OperateResult Write(string address, float value)
	{
		return _plc.Write(address, value);
	}

	public OperateResult Write(string address, float[] values)
	{
		return _plc.Write(address, values);
	}

	public OperateResult Write(string address, double value)
	{
		return _plc.Write(address, value);
	}

	public OperateResult Write(string address, double[] values)
	{
		return _plc.Write(address, values);
	}

	public OperateResult Write(string address, bool value)
	{
		return _plc.Write(address, value);
	}

	public OperateResult Write(string address, bool[] values)
	{
		return _plc.Write(address, values);
	}

	public OperateResult Write(string address, string value)
	{
		return _plc.Write(address, value);
	}
}
