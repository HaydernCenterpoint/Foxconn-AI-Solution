namespace Mkz.Fusion.Contracts;

public static class AssetCatalogContract
{
    public const string PlantCode = "MKZ-PLANT";

    public static string NormalizeType(string? type) => type?.Trim().ToUpperInvariant() ?? string.Empty;

    public static string LineCode(Guid id) => $"line:{id:D}";

    public static string MachineCode(Guid id) => $"machine:{id:D}";

    public static bool IsCatalogOwned(string? type) => NormalizeType(type) is "PLANT" or "AREA" or "SENSOR";

    public static bool IsKnownType(string? type) => NormalizeType(type) is "PLANT" or "AREA" or "LINE" or "MACHINE" or "SENSOR";
}
