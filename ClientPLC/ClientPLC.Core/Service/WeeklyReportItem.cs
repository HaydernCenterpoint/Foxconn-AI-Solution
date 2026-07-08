namespace PLC.Service;

public class WeeklyReportItem
{
	public string Date { get; set; } = string.Empty;

	public string Shift { get; set; } = string.Empty;

	public int Qty { get; set; }

	public double Oee { get; set; }
}
