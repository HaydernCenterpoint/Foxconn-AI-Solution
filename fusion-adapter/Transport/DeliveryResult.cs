namespace Fusion.Adapter.Transport;

public enum DeliveryKind
{
    Delivered,
    TransientFailure,
    PermanentFailure
}

public sealed record DeliveryResult(DeliveryKind Kind, string? Error, bool IsAuthenticationFailure = false)
{
    public static DeliveryResult Delivered() => new(DeliveryKind.Delivered, null);

    public static DeliveryResult TransientFailure(string error, bool isAuthenticationFailure = false) =>
        new(DeliveryKind.TransientFailure, error, isAuthenticationFailure);

    public static DeliveryResult PermanentFailure(string error) => new(DeliveryKind.PermanentFailure, error);
}
