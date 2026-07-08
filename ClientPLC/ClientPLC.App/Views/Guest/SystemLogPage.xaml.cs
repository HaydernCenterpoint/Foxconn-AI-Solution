using System.Windows.Controls;

namespace PLC.Views
{
    public partial class SystemLogPage : UserControl, ILocalizable
    {
        public SystemLogPage()
        {
            InitializeComponent();
        }

        public void TranslateUI()
        {
            LogView.TranslateUI();
        }
    }
}

