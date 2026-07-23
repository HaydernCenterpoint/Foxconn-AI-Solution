using System.IO;
using System.Text.Json;
using backend.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace backend.Controllers
{
    [ApiController]
    [Route("api/event-rules")]
    [Authorize]
    public class EventRulesController : ControllerBase
    {
        private readonly EventRuleEngine _engine;

        public EventRulesController(EventRuleEngine engine)
        {
            _engine = engine;
        }

        /// <summary>Returns the current event rules loaded in the CEP engine.</summary>
        [HttpGet]
        public IActionResult GetRules()
        {
            return Ok(_engine.GetRules());
        }

        /// <summary>Replaces event-rules.json and reloads the CEP engine.</summary>
        [HttpPut]
        [Authorize(Roles = "ADMIN")]
        public async Task<IActionResult> UpdateRules()
        {
            var path = Path.Combine(Directory.GetCurrentDirectory(), "Configuration", "event-rules.json");
            using var reader = new StreamReader(Request.Body);
            var body = await reader.ReadToEndAsync();

            // Validate it is valid JSON with a rules array
            try
            {
                var doc = JsonSerializer.Deserialize<EventRulesDocument>(body, new JsonSerializerOptions
                {
                    PropertyNameCaseInsensitive = true
                });
                if (doc?.Rules == null)
                    return BadRequest(new { error = "Invalid event rules document: missing 'rules' array." });
            }
            catch (JsonException ex)
            {
                return BadRequest(new { error = $"Invalid JSON: {ex.Message}" });
            }

            await System.IO.File.WriteAllTextAsync(path, body);
            _engine.ReloadRules();
            return Ok(new { message = "Event rules updated and reloaded.", count = _engine.GetRules().Count });
        }
    }
}
