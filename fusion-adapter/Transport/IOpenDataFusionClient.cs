using Fusion.Adapter.Mapping;

namespace Fusion.Adapter.Transport;

public interface IOpenDataFusionClient
{
    Task<DeliveryResult> SendAsync(OpenDataFusionBundle bundle, CancellationToken cancellationToken);
}
