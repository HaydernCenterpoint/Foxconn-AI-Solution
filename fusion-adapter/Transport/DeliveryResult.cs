namespace Fusion.Adapter.Transport;

public enum DeliveryKind
{
    Delivered,
    TransientFailure,
    PermanentFailure
}

public sealed record DeliveryResult(DeliveryKind Kind, string? Error)
{
    public static DeliveryResult Delivered() => new(DeliveryKind.Delivered, null);

    public static DeliveryResult TransientFailure(string error) => new(DeliveryKind.TransientFailure, error);

    public static DeliveryResult PermanentFailure(string error) => new(DeliveryKind.PermanentFailure, error);
}
