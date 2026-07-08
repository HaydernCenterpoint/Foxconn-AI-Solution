using System;
using System.IO;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Media;
using Microsoft.Win32;
using PLC.Config;
using MessageBox = PLC.Views.CustomMessageBox;

namespace PLC;

public partial class MainWindow
{
	private void BtnLangQuick_Click(object sender, RoutedEventArgs e)
	{
		if (BtnLangQuick.ContextMenu != null)
		{
			BtnLangQuick.ContextMenu.PlacementTarget = BtnLangQuick;
			BtnLangQuick.ContextMenu.Placement = System.Windows.Controls.Primitives.PlacementMode.Bottom;
			BtnLangQuick.ContextMenu.IsOpen = true;
		}
	}

	private void BtnThemeQuick_Click(object sender, RoutedEventArgs e)
	{
		if (BtnThemeQuick.ContextMenu != null)
		{
			BtnThemeQuick.ContextMenu.PlacementTarget = BtnThemeQuick;
			BtnThemeQuick.ContextMenu.Placement = System.Windows.Controls.Primitives.PlacementMode.Bottom;
			BtnThemeQuick.ContextMenu.IsOpen = true;
		}
	}

	private void MnuTheme_Click(object sender, RoutedEventArgs e)
	{
		if (sender is MenuItem menuItem && menuItem.Tag is string themeTag)
		{
			AppSettings.Current.Theme = themeTag;
			AppSettings.Current.Save();
			App.ChangeTheme(themeTag);
		}
	}

	private void ToggleFullScreen()
	{
		if (this.WindowStyle == WindowStyle.None && this.WindowState == WindowState.Maximized)
		{
			this.WindowStyle = WindowStyle.SingleBorderWindow;
			this.WindowState = WindowState.Normal;
		}
		else
		{
			this.WindowStyle = WindowStyle.None;
			this.WindowState = WindowState.Maximized;
		}
	}

	private bool PromptSaveIfDirty()
	{
		return true;
	}

	private void GenerateTemplateExcelFile(bool isMachine, bool isAlarm)
	{
		var saveFileDialog = new SaveFileDialog
		{
			Filter = "Excel files (*.xlsx)|*.xlsx|JSON files (*.json)|*.json",
			FileName = isMachine ? "Machine_Template.xlsx" : (isAlarm ? "Alarm_Template.xlsx" : "Empty_Template.xlsx")
		};

		if (saveFileDialog.ShowDialog() == true)
		{
			try
			{
				string path = saveFileDialog.FileName;
				if (path.EndsWith(".json"))
				{
					// Save sample json structure
					string sampleJson = "[\n  {\n    \"Address\": \"M100\",\n    \"Type\": \"Bool\",\n    \"Alias\": \"Start\",\n    \"Group\": \"Nhóm trạng thái\",\n    \"Enabled\": true\n  }\n]";
					File.WriteAllText(path, sampleJson, System.Text.Encoding.UTF8);
				}
				else
				{
					// We'll write a clean XML spreadsheet structure format compatible with Excel
					string xmlContent = GetExcelXmlTemplate(isMachine, isAlarm);
					File.WriteAllText(path, xmlContent, System.Text.Encoding.UTF8);
				}

				MessageBox.Show("Tạo file mẫu thành công!", "Thành công", MessageBoxButton.OK, MessageBoxImage.Information);
				_currentFilePath = path;
				IsDirty = false;
				AddToRecentFiles(path);

				// Reload in Table view if selected
				ShowView("DataTable");
			}
			catch (Exception ex)
			{
				MessageBox.Show("Không thể tạo file mẫu: " + ex.Message, "Lỗi", MessageBoxButton.OK, MessageBoxImage.Error);
			}
		}
	}

	private string GetExcelXmlTemplate(bool isMachine, bool isAlarm)
	{
		// Generates simple valid spreadsheet XML
		string dataRows = "";
		if (isMachine)
		{
			dataRows = @"
   <Row>
    <Cell><Data ss:Type=""String"">Nhóm trạng thái</Data></Cell>
    <Cell><Data ss:Type=""String"">START</Data></Cell>
    <Cell><Data ss:Type=""String"">M100</Data></Cell>
    <Cell><Data ss:Type=""String"">Nút khởi động</Data></Cell>
    <Cell><Data ss:Type=""String"">Bool</Data></Cell>
   </Row>
   <Row>
    <Cell><Data ss:Type=""String"">Nhóm sản phẩm</Data></Cell>
    <Cell><Data ss:Type=""String"">QUANTITY</Data></Cell>
    <Cell><Data ss:Type=""String"">D1026</Data></Cell>
    <Cell><Data ss:Type=""String"">Số lượng sản xuất</Data></Cell>
    <Cell><Data ss:Type=""String"">Int16</Data></Cell>
   </Row>";
		}
		else if (isAlarm)
		{
			dataRows = @"
   <Row>
    <Cell><Data ss:Type=""String"">Quy trình báo động</Data></Cell>
    <Cell><Data ss:Type=""String"">E001</Data></Cell>
    <Cell><Data ss:Type=""String"">M60</Data></Cell>
    <Cell><Data ss:Type=""String"">Lỗi kẹt phôi</Data></Cell>
    <Cell><Data ss:Type=""String"">Bool</Data></Cell>
   </Row>";
		}

		return $@"<?xml version=""1.0""?>
<?mso-application BureauVersion=""12""?>
<Workbook xmlns=""urn:schemas-microsoft-com:office:spreadsheet""
 xmlns:o=""urn:schemas-microsoft-com:office:office""
 xmlns:x=""urn:schemas-microsoft-com:office:excel""
 xmlns:ss=""urn:schemas-microsoft-com:office:spreadsheet""
 xmlns:html=""http://www.w3.org/TR/REC-html40"">
 <Worksheet ss:Name=""DataPoints"">
  <Table>
   <Row>
    <Cell><Data ss:Type=""String"">Group</Data></Cell>
    <Cell><Data ss:Type=""String"">Code</Data></Cell>
    <Cell><Data ss:Type=""String"">RegisterAddress</Data></Cell>
    <Cell><Data ss:Type=""String"">AliasName</Data></Cell>
    <Cell><Data ss:Type=""String"">DataType</Data></Cell>
   </Row>{dataRows}
  </Table>
 </Worksheet>
</Workbook>";
	}

	private void AddToRecentFiles(string path)
	{
		if (_recentFiles.Contains(path)) _recentFiles.Remove(path);
		_recentFiles.Insert(0, path);
		if (_recentFiles.Count > 5) _recentFiles.RemoveAt(5);
	}

	private void ToggleMaximize()
	{
		if (this.WindowState == WindowState.Maximized)
		{
			this.WindowState = WindowState.Normal;
		}
		else
		{
			this.WindowState = WindowState.Maximized;
		}
	}
}
