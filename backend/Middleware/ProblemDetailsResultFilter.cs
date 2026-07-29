using System.Reflection;
using backend.Security;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.Filters;
using Microsoft.AspNetCore.Mvc.Infrastructure;

namespace backend.Middleware;

public sealed class ProblemDetailsResultFilter : IAsyncResultFilter
{
    public Task OnResultExecutionAsync(
        ResultExecutingContext context,
        ResultExecutionDelegate next)
    {
        var objectResult = context.Result as ObjectResult;
        var problem = objectResult?.Value as ProblemDetails;
        var statusCode = (context.Result as IStatusCodeActionResult)?.StatusCode
            ?? problem?.Status;
        if (statusCode is null or < 400)
        {
            return next();
        }

        if (objectResult is not null && problem is not null)
        {
            objectResult.Value = ApiProblemResponse.Normalize(
                context.HttpContext,
                problem,
                statusCode.Value);
            objectResult.StatusCode = statusCode;
            if (!objectResult.ContentTypes.Contains(
                Mkz.Fusion.Contracts.ApiConventionV1.ProblemMediaType))
            {
                objectResult.ContentTypes.Add(
                    Mkz.Fusion.Contracts.ApiConventionV1.ProblemMediaType);
            }
            return next();
        }

        var detail = statusCode >= StatusCodes.Status500InternalServerError
            ? "Please try again later."
            : ExtractDetail(objectResult?.Value)
                ?? "The request could not be completed.";
        var result = new ObjectResult(
            ApiProblemResponse.Create(context.HttpContext, statusCode.Value, detail))
        {
            StatusCode = statusCode,
        };
        result.ContentTypes.Add(Mkz.Fusion.Contracts.ApiConventionV1.ProblemMediaType);
        context.Result = result;
        return next();
    }

    private static string? ExtractDetail(object? value)
    {
        if (value is string text && !string.IsNullOrWhiteSpace(text))
        {
            return text;
        }

        var property = value?.GetType().GetProperty(
            "error",
            BindingFlags.Instance | BindingFlags.Public | BindingFlags.IgnoreCase);
        return property?.GetValue(value) is string error && !string.IsNullOrWhiteSpace(error)
            ? error
            : null;
    }
}
