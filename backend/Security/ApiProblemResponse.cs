using System.Text.Json;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.WebUtilities;
using Mkz.Fusion.Contracts;

namespace backend.Security;

public static class ApiProblemResponse
{
    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web);

    public static ProblemDetails Create(
        HttpContext context,
        int statusCode,
        string detail,
        string? title = null)
    {
        var problem = new ProblemDetails
        {
            Title = title,
            Detail = detail,
        };
        return Normalize(context, problem, statusCode);
    }

    public static ProblemDetails Normalize(
        HttpContext context,
        ProblemDetails problem,
        int statusCode)
    {
        var safeDetail = statusCode >= StatusCodes.Status500InternalServerError
            ? "Please try again later."
            : string.IsNullOrWhiteSpace(problem.Detail)
                ? "The request could not be completed."
                : problem.Detail;
        problem.Status = statusCode;
        problem.Title ??= ReasonPhrases.GetReasonPhrase(statusCode);
        problem.Detail = safeDetail;
        problem.Type ??= "about:blank";
        problem.Instance ??= context.Request.Path;
        problem.Extensions["error"] = safeDetail;
        problem.Extensions["traceId"] = context.TraceIdentifier;
        return problem;
    }

    public static Task WriteAsync(
        HttpContext context,
        int statusCode,
        string detail,
        string? title = null,
        CancellationToken cancellationToken = default)
    {
        if (context.Response.HasStarted)
        {
            return Task.CompletedTask;
        }

        context.Response.StatusCode = statusCode;
        context.Response.ContentType = ApiConventionV1.ProblemMediaType;
        return context.Response.WriteAsync(
            JsonSerializer.Serialize(Create(context, statusCode, detail, title), JsonOptions),
            cancellationToken);
    }
}
