using System.Windows.Controls;

namespace PLC.Views
{
    public partial class MitsubishiMelsecPage : UserControl
    {
        public MitsubishiMelsecPage()
        {
            InitializeComponent();
            MainGrid.Children.Add(new PlcGenericView("MelsecMcNet"));
        }
    }
}

