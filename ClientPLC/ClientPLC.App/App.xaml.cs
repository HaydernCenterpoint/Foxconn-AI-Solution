using System;
using System.CodeDom.Compiler;
using System.Diagnostics;
using System.Linq;
using System.Windows;
using System.Windows.Media;

namespace PLC;

public partial class App : Application
{
	public static void ChangeTheme(string themeName)
	{
		var app = Application.Current;
		if (app == null) return;

		var dictionaries = app.Resources.MergedDictionaries;

		// Remove old theme
		var oldTheme = dictionaries.FirstOrDefault(d =>
			d.Source?.OriginalString?.Contains("Themes/") == true);
		if (oldTheme != null)
			dictionaries.Remove(oldTheme);

		// Load new theme
		string themeFile = themeName.ToLower() switch
		{
			"dark" => "Themes/DarkTheme.xaml",
			"blue" => "Themes/BlueTheme.xaml",
			_ => "Themes/LightTheme.xaml"
		};

		var newTheme = new ResourceDictionary
		{
			Source = new Uri(themeFile, UriKind.Relative)
		};
		dictionaries.Insert(0, newTheme);
	}

	public static void ChangeFontSize(float fontSize)
	{
		Application current = Application.Current;
		if (current != null)
		{
			double num = ((fontSize > 6f) ? ((double)fontSize) : 12.0);
			current.Resources["BaseFontSize"] = num;
			current.Resources["HeaderFontSize"] = num + 2.0;
			current.Resources["TitleFontSize"] = num + 6.0;
		}
	}

}
