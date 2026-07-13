namespace Fusion.Adapter.Outbox;

public static class RetryPolicy
{
    public static TimeSpan NextDelay(int attempts)
    {
        var exponent = Math.Min(Math.Max(attempts - 1, 0), 6);
        return TimeSpan.FromSeconds(Math.Min(300, 5 * Math.Pow(2, exponent)));
    }
}
