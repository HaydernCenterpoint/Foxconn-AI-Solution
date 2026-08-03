using System;
using System.Text.Json;
using PLC.Database;

namespace PLC.Network;

public enum ApplicationAcknowledgementDisposition
{
    Ignored,
    NotFound,
    TypeMismatch,
    Completed,
    RetryScheduled,
    Quarantined
}

public sealed class ApplicationAcknowledgementHandler
{
    private readonly IOfflineQueueRepository _queue;
    private readonly Action<OfflineQueueMessage, ApplicationAcknowledgement> _onCompleted;

    public ApplicationAcknowledgementHandler(
        IOfflineQueueRepository queue,
        Action<OfflineQueueMessage, ApplicationAcknowledgement> onCompleted)
    {
        _queue = queue ?? throw new ArgumentNullException(nameof(queue));
        _onCompleted = onCompleted ?? throw new ArgumentNullException(nameof(onCompleted));
    }

    public ApplicationAcknowledgementDisposition Handle(string json)
    {
        if (!TryParse(json, out ApplicationAcknowledgement? acknowledgement))
        {
            return ApplicationAcknowledgementDisposition.Ignored;
        }

        string error = string.IsNullOrWhiteSpace(acknowledgement.Detail)
            ? acknowledgement.State.ToString()
            : $"{acknowledgement.State}: {acknowledgement.Detail}";

        OfflineQueueMessage? correlated = _queue.Find(acknowledgement.MessageId);
        if (correlated is null)
        {
            return ApplicationAcknowledgementDisposition.NotFound;
        }

        if (!AcknowledgementMatchesQueuedEnvelope(acknowledgement.MessageType, correlated.Payload))
        {
            return ApplicationAcknowledgementDisposition.TypeMismatch;
        }

        switch (acknowledgement.State)
        {
            case ApplicationAcknowledgementState.Committed:
            case ApplicationAcknowledgementState.Duplicate:
                _onCompleted(correlated, acknowledgement);
                _queue.Complete(acknowledgement.MessageId);
                return ApplicationAcknowledgementDisposition.Completed;

            case ApplicationAcknowledgementState.Busy:
            case ApplicationAcknowledgementState.RetryableFailure:
                OfflineQueueMessage? retried = _queue.ScheduleRetry(acknowledgement.MessageId, error);
                if (retried is null)
                {
                    return ApplicationAcknowledgementDisposition.NotFound;
                }

                return retried.Status == OfflineQueueStatus.Dead
                    ? ApplicationAcknowledgementDisposition.Quarantined
                    : ApplicationAcknowledgementDisposition.RetryScheduled;

            case ApplicationAcknowledgementState.Malformed:
            case ApplicationAcknowledgementState.PayloadTooLarge:
            case ApplicationAcknowledgementState.PermanentFailure:
            case ApplicationAcknowledgementState.Conflict:
                return _queue.Quarantine(acknowledgement.MessageId, error) is null
                    ? ApplicationAcknowledgementDisposition.NotFound
                    : ApplicationAcknowledgementDisposition.Quarantined;

            default:
                return ApplicationAcknowledgementDisposition.Ignored;
        }
    }

    private static bool AcknowledgementMatchesQueuedEnvelope(
        string acknowledgementType,
        string queuedPayload)
    {
        try
        {
            using JsonDocument document = JsonDocument.Parse(queuedPayload);
            if (!document.RootElement.TryGetProperty("messageType", out JsonElement messageType) ||
                messageType.ValueKind != JsonValueKind.String)
            {
                return false;
            }

            return (acknowledgementType, messageType.GetString()) switch
            {
                ("ack", "telemetry") => true,
                ("syncAck", "sync") => true,
                _ => false
            };
        }
        catch (JsonException)
        {
            return false;
        }
    }

    public static bool TryParse(string json, out ApplicationAcknowledgement? acknowledgement)
    {
        acknowledgement = null;
        try
        {
            using JsonDocument document = JsonDocument.Parse(json);
            JsonElement root = document.RootElement;
            if (root.ValueKind != JsonValueKind.Object ||
                !root.TryGetProperty("messageType", out JsonElement messageTypeElement) ||
                messageTypeElement.ValueKind != JsonValueKind.String ||
                !root.TryGetProperty("messageId", out JsonElement messageIdElement) ||
                messageIdElement.ValueKind != JsonValueKind.String ||
                !root.TryGetProperty("payload", out JsonElement payload) ||
                payload.ValueKind != JsonValueKind.Object ||
                !payload.TryGetProperty("state", out JsonElement stateElement) ||
                stateElement.ValueKind != JsonValueKind.String)
            {
                return false;
            }

            string? messageType = messageTypeElement.GetString();
            string? messageId = messageIdElement.GetString()?.Trim();
            if (messageType is not ("ack" or "syncAck") || string.IsNullOrWhiteSpace(messageId) ||
                !Enum.TryParse(stateElement.GetString(), ignoreCase: true, out ApplicationAcknowledgementState state))
            {
                return false;
            }

            string? detail = payload.TryGetProperty("detail", out JsonElement detailElement) &&
                detailElement.ValueKind == JsonValueKind.String
                    ? detailElement.GetString()
                    : null;
            acknowledgement = new ApplicationAcknowledgement(messageType, messageId, state, detail);
            return true;
        }
        catch (JsonException)
        {
            return false;
        }
    }
}
