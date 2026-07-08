namespace PLC.Database;

public interface IAppConfigRepository
{
    string GetValue(string key, string defaultValue);
    void SaveValue(string key, string value);
}
