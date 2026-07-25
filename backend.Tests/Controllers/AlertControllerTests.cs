using System;
using Microsoft.AspNetCore.Authorization;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging;
using Xunit;
using backend.Controllers;
using backend.Services;

namespace backend.Tests.Controllers;

/// <summary>
/// Unit tests for AlertController.
/// NOTE: GetAlerts/GetAlert/GetAlertStats hit TimescaleDB directly via Npgsql
/// so they require integration tests with a real database.
/// These tests focus on the action methods that delegate to AlertService.
/// </summary>
public class AlertControllerTests
{
    [Fact]
    public void Constructor_ThrowsWhenTimescaleConnectionMissing()
    {
        var config = new ConfigurationBuilder()
            .AddInMemoryCollection(new Dictionary<string, string?>())
            .Build();
        var logger = LoggerFactory.Create(b => { }).CreateLogger<AlertController>();

        Assert.Throws<ArgumentNullException>(() => new AlertController(null!, config, logger));
    }

    [Fact]
    public void Constructor_DoesNotThrowWhenConnectionPresent()
    {
        var config = new ConfigurationBuilder()
            .AddInMemoryCollection(new Dictionary<string, string?>
            {
                ["ConnectionStrings:Timescale"] = "Host=localhost;Database=test"
            })
            .Build();
        var logger = LoggerFactory.Create(b => { }).CreateLogger<AlertController>();

        var controller = new AlertController(null!, config, logger);

        Assert.NotNull(controller);
    }

    [Fact]
    public void ResolveRequest_HasNotesProperty()
    {
        var request = new ResolveRequest { Notes = "Fixed the issue" };

        Assert.Equal("Fixed the issue", request.Notes);
    }

    [Fact]
    public void AcknowledgeRequest_CanBeInstantiated()
    {
        var request = new AcknowledgeRequest();

        Assert.NotNull(request);
    }

    [Fact]
    public void Controller_HasAuthorizeAttribute()
    {
        var authorizeAttr = Attribute.GetCustomAttribute(
            typeof(AlertController), typeof(AuthorizeAttribute));
        Assert.NotNull(authorizeAttr);
    }

    [Fact]
    public void AcknowledgeAlert_RequiresAdminOrEngineerRole()
    {
        var method = typeof(AlertController).GetMethod("AcknowledgeAlert");
        Assert.NotNull(method);

        var attrs = method!.GetCustomAttributes(typeof(AuthorizeAttribute), false);
        var authorizeAttr = Assert.Single(attrs);
        var authorize = Assert.IsType<AuthorizeAttribute>(authorizeAttr);
        Assert.Contains("ADMIN", authorize.Roles!);
        Assert.Contains("ENGINEER", authorize.Roles!);
    }

    [Fact]
    public void ResolveAlert_RequiresAdminOrEngineerRole()
    {
        var method = typeof(AlertController).GetMethod("ResolveAlert");
        Assert.NotNull(method);

        var attrs = method!.GetCustomAttributes(typeof(AuthorizeAttribute), false);
        var authorizeAttr = Assert.Single(attrs);
        var authorize = Assert.IsType<AuthorizeAttribute>(authorizeAttr);
        Assert.Contains("ADMIN", authorize.Roles!);
        Assert.Contains("ENGINEER", authorize.Roles!);
    }
}
