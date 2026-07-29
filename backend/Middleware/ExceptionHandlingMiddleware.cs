using backend.Security;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.Logging;

namespace backend.Middleware
{
    public class ExceptionHandlingMiddleware
    {
        private readonly RequestDelegate _next;
        private readonly ILogger<ExceptionHandlingMiddleware> _logger;

        public ExceptionHandlingMiddleware(RequestDelegate next, ILogger<ExceptionHandlingMiddleware> logger)
        {
            _next = next;
            _logger = logger;
        }

        public async Task InvokeAsync(HttpContext context)
        {
            try
            {
                await _next(context);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "An unhandled exception occurred during request processing.");
                if (context.Response.HasStarted)
                {
                    throw;
                }

                context.Response.Clear();
                await HandleExceptionAsync(context);
            }
        }

        private static Task HandleExceptionAsync(HttpContext context) =>
            ApiProblemResponse.WriteAsync(
                context,
                StatusCodes.Status500InternalServerError,
                "Please try again later.",
                "Internal server error",
                context.RequestAborted);
    }
}
