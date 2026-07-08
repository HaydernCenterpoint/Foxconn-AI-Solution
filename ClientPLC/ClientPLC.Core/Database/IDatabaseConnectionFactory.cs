using System.Data.Common;

namespace PLC.Database;

public interface IDatabaseConnectionFactory
{
    DbConnection CreateConnection();
    string DbPath { get; }
}
