using System;

using HslCommunication;

using HslCommunication.Language;

using Microsoft.Extensions.DependencyInjection;

using PLC.Config;

using PLC.Database;

using PLC.Infrastructure.Database;

using PLC.Network;

using PLC.Service;

using PLC.ViewModels;



namespace PLC;



public static class Program

{

	public static int Language { get; set; } = 1;

	public static IServiceProvider? Services { get; private set; }



	[STAThread]

	public static void Main()

	{

		var serviceCollection = new ServiceCollection();

		ConfigureServices(serviceCollection);

		Services = serviceCollection.BuildServiceProvider();

		AppServiceProvider.Services = Services;



		AppConfig.Storage = Services.GetRequiredService<LocalDbService>();

		var mqttEncryptionKey = Environment.GetEnvironmentVariable("FII_MQTT_ENCRYPTION_KEY")
			?? throw new InvalidOperationException("FII_MQTT_ENCRYPTION_KEY is required.");
		CryptoHelper.Initialize(mqttEncryptionKey);

		AppSettings current = AppSettings.Current;

		PLC.Service.LanguageManager.Initialize();

		if (current.Language.Equals("zh", StringComparison.OrdinalIgnoreCase))

		{

			Language = 1;

			StringResources.Language = new DefaultLanguage();

		}

		else

		{

			Language = 2;

			StringResources.Language = new English();

		}



		Services.GetRequiredService<MqttClientService>().Start();

		Services.GetRequiredService<TelemetryPruner>().Start();

		Services.GetRequiredService<ServerMessageHandler>(); // Instantiate to bind transport events



		App app = new App();

		app.InitializeComponent();

		MainWindow window = new MainWindow();

		app.Run(window);



		Services.GetRequiredService<TelemetryPruner>().Stop();

		Services.GetRequiredService<MqttClientService>().Stop();

	}



	private static void ConfigureServices(IServiceCollection services)

	{

		// Database & Repositories

		services.AddSingleton<IDatabaseConnectionFactory, SqliteConnectionFactory>();

		services.AddSingleton<ITelemetryRepository, SqliteTelemetryRepository>();

		services.AddSingleton<IErrorHistoryRepository, SqliteErrorHistoryRepository>();

		services.AddSingleton<IUnitHistoryRepository, SqliteUnitHistoryRepository>();

		services.AddSingleton<IOfflineQueueRepository, SqliteOfflineQueueRepository>();

		services.AddSingleton<IAppConfigRepository, SqliteAppConfigRepository>();

		services.AddSingleton<TelemetryPruner>();



		// Services

		services.AddSingleton<ShiftService>();

		services.AddSingleton<LocalDbService>();

		services.AddSingleton<IServerTransport, MqttTransport>();

		services.AddSingleton<ServerMessageHandler>();

		services.AddSingleton<IPLCPollingService, PLCPollingService>();

		services.AddSingleton<MqttClientService>();


		// ViewModels

		services.AddTransient<DashboardViewModel>();

	}

}
