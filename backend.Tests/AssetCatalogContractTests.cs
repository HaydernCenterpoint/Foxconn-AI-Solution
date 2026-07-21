using Mkz.Fusion.Contracts;

namespace backend.Tests;

public sealed class AssetCatalogContractTests
{
    [Fact]
    public void LegacyAssets_KeepTheirOperationalUuidAndStableSourceCode()
    {
        var id = Guid.Parse("11111111-1111-1111-1111-111111111111");

        Assert.Equal("line:11111111-1111-1111-1111-111111111111", AssetCatalogContract.LineCode(id));
        Assert.Equal("machine:11111111-1111-1111-1111-111111111111", AssetCatalogContract.MachineCode(id));
        Assert.Equal("MKZ-PLANT", AssetCatalogContract.PlantCode);
    }

    [Theory]
    [InlineData("PLANT", true)]
    [InlineData("AREA", true)]
    [InlineData("SENSOR", true)]
    [InlineData("LINE", false)]
    [InlineData("MACHINE", false)]
    [InlineData("unknown", false)]
    public void CatalogOwnership_AllowsOnlyCatalogNativeTypes(string type, bool expected)
    {
        Assert.Equal(expected, AssetCatalogContract.IsCatalogOwned(type));
    }
}
