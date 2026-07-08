using System.Windows.Controls;

namespace PLC.Views
{
    public partial class ErrorListPage : UserControl, ILocalizable
    {
        public ErrorListPage()
        {
            InitializeComponent();
        }

        public void TranslateUI()
        {
            ErrorsView.TranslateUI();
        }
    }
}

