using System;
using System.ComponentModel;
using System.Linq;
using System.Runtime.CompilerServices;

namespace PLC.Model;

public class DataAddressItem : INotifyPropertyChanged
{
	private int _index;
	private string _address = string.Empty;
	private string _alias = string.Empty;
	private string _type = "Int16";
	private string _value = "Chờ đọc...";
	private string _lastUpdate = "Never";
	private bool _enabled = true;
	private string _group = "Khác";
	private string _activeValue = "true";
	private string _severity = "Medium";
	private string _description = string.Empty;
	private string _solution = string.Empty;

	public int Index
	{
		get => _index;
		set { _index = value; OnPropertyChanged(); }
	}

	public string Address
	{
		get => _address;
		set
		{
			_address = value;
			OnPropertyChanged();
			UpdateGroup();
		}
	}

	public string Alias
	{
		get => _alias;
		set
		{
			_alias = value;
			OnPropertyChanged();
			UpdateGroup();
		}
	}

	public string Type
	{
		get => _type;
		set { _type = value; OnPropertyChanged(); }
	}

	public string Value
	{
		get => _value;
		set { _value = value; OnPropertyChanged(); }
	}

	public string LastUpdate
	{
		get => _lastUpdate;
		set { _lastUpdate = value; OnPropertyChanged(); }
	}

	public bool Enabled
	{
		get => _enabled;
		set { _enabled = value; OnPropertyChanged(); }
	}

	public string Group
	{
		get => _group;
		set
		{
			string val = (value ?? "").Trim();
			string aliasClean = (_alias ?? "").Trim().ToLower();

			if (val.Equals("Status", StringComparison.OrdinalIgnoreCase) || val.Equals("Nhóm trạng thái", StringComparison.OrdinalIgnoreCase))
			{
				if (aliasClean == "start" || aliasClean == "stop" || aliasClean == "error")
				{
					_group = "Nhóm trạng thái";
				}
				else
				{
					_group = IsAlarmAliasOrAddress() ? "Quy trình báo động" : "Khác";
				}
			}
			else if (val.Equals("Production", StringComparison.OrdinalIgnoreCase) || val.Equals("Nhóm sản phẩm", StringComparison.OrdinalIgnoreCase))
			{
				if (aliasClean == "quantity" || aliasClean == "cycle time")
				{
					_group = "Nhóm sản phẩm";
				}
				else
				{
					_group = IsAlarmAliasOrAddress() ? "Quy trình báo động" : "Khác";
				}
			}
			else if (val.Equals("Error", StringComparison.OrdinalIgnoreCase) || val.Equals("Nhóm lỗi", StringComparison.OrdinalIgnoreCase) || val.Equals("Quy trình báo động", StringComparison.OrdinalIgnoreCase))
			{
				_group = "Quy trình báo động";
			}
			else
			{
				_group = "Khác";
			}
			OnPropertyChanged();
		}
	}

	public string ActiveValue
	{
		get => _activeValue;
		set { _activeValue = value; OnPropertyChanged(); }
	}

	public string Severity
	{
		get => _severity;
		set { _severity = value; OnPropertyChanged(); }
	}

	public string Description
	{
		get => _description;
		set { _description = value; OnPropertyChanged(); }
	}

	public string Solution
	{
		get => _solution;
		set { _solution = value; OnPropertyChanged(); }
	}

	public event PropertyChangedEventHandler? PropertyChanged;

	protected void OnPropertyChanged([CallerMemberName] string? propertyName = null)
	{
		PropertyChanged?.Invoke(this, new PropertyChangedEventArgs(propertyName));
	}

	public void UpdateGroup()
	{
		string alClean = (_alias ?? "").Trim().ToLower();

		// Nhóm trạng thái: only Start, Stop, Error
		if (alClean == "start" || alClean == "stop" || alClean == "error")
		{
			_group = "Nhóm trạng thái";
			OnPropertyChanged(nameof(Group));
			return;
		}

		// Nhóm sản phẩm: only Quantity, Cycle Time
		if (alClean == "quantity" || alClean == "cycle time")
		{
			_group = "Nhóm sản phẩm";
			OnPropertyChanged(nameof(Group));
			return;
		}

		// Quy trình báo động
		if (IsAlarmAliasOrAddress())
		{
			_group = "Quy trình báo động";
			OnPropertyChanged(nameof(Group));
			return;
		}

		_group = "Khác";
		OnPropertyChanged(nameof(Group));
	}

	private bool IsAlarmAliasOrAddress()
	{
		string addr = (_address ?? "").Trim().ToLower();
		string al = (_alias ?? "").Trim().ToLower();

		if (addr.StartsWith("m") || (addr.StartsWith("d") && TryParseAddressNumber(addr, out int num) && num >= 20 && num <= 30))
		{
			if (TryParseAddressNumber(addr, out int mNum))
			{
				if (addr.StartsWith("m") && mNum >= 60 && mNum <= 199)
				{
					return true;
				}
				if (addr.StartsWith("d") && mNum >= 20 && mNum <= 30)
				{
					return true;
				}
			}
			
			if (addr.StartsWith("m") && (al.Contains("alarm") || al.Contains("lỗi") || al.Contains("fault") || al.Contains("e-stop") || al.Contains("guard") || al.Contains("cảnh báo") || al.Contains("báo động")))
			{
				return true;
			}
		}

		return false;
	}

	private bool TryParseAddressNumber(string address, out int number)
	{
		number = 0;
		if (string.IsNullOrEmpty(address)) return false;
		string numStr = new string(address.Where(char.IsDigit).ToArray());
		return int.TryParse(numStr, out number);
	}
}
