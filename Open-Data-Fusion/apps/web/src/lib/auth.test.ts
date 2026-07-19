import { beforeEach, describe, expect, it, vi } from "vitest";

const oidcMocks = vi.hoisted(() => ({
  managerSettings: [] as Array<Record<string, unknown>>,
  storageOptions: [] as Array<{ prefix?: string; store?: Storage }>,
  getUser: vi.fn(),
  signinSilent: vi.fn(),
  signinRedirect: vi.fn(),
  signinRedirectCallback: vi.fn(),
  signoutRedirect: vi.fn(),
  signoutRedirectCallback: vi.fn(),
  addUserLoaded: vi.fn(),
  addUserUnloaded: vi.fn(),
  addUserSignedOut: vi.fn(),
}));

vi.mock("oidc-client-ts", () => {
  class MockWebStorageStateStore {
    constructor(readonly options: { prefix?: string; store?: Storage } = {}) {
      oidcMocks.storageOptions.push(options);
    }
  }

  class MockUserManager {
    readonly events = {
      addUserLoaded: oidcMocks.addUserLoaded,
      addUserUnloaded: oidcMocks.addUserUnloaded,
      addUserSignedOut: oidcMocks.addUserSignedOut,
    };

    constructor(settings: Record<string, unknown>) {
      oidcMocks.managerSettings.push(settings);
    }

    getUser() {
      return oidcMocks.getUser();
    }

    signinSilent() {
      return oidcMocks.signinSilent();
    }

    signinRedirect(args?: unknown) {
      return oidcMocks.signinRedirect(args);
    }

    signinRedirectCallback(url?: string) {
      return oidcMocks.signinRedirectCallback(url);
    }

    signoutRedirect(args?: unknown) {
      return oidcMocks.signoutRedirect(args);
    }

    signoutRedirectCallback(url?: string) {
      return oidcMocks.signoutRedirectCallback(url);
    }
  }

  return { UserManager: MockUserManager, WebStorageStateStore: MockWebStorageStateStore };
});

const ENVIRONMENT_KEYS = [
  "VITE_OIDC_AUTHORITY",
  "VITE_OIDC_CLIENT_ID",
  "VITE_OIDC_SCOPE",
  "VITE_OIDC_REDIRECT_URI",
  "VITE_OIDC_POST_LOGOUT_REDIRECT_URI",
  "VITE_OIDC_USER_CLAIM",
  "VITE_FII_SSO",
  "VITE_FII_LOGIN_URL",
  "VITE_FII_APP_NAME",
] as const;

function configureOidc(): void {
  vi.stubEnv("VITE_OIDC_AUTHORITY", "https://identity.example.test/realms/odf");
  vi.stubEnv("VITE_OIDC_CLIENT_ID", "open-data-fusion-web");
  vi.stubEnv("VITE_OIDC_USER_CLAIM", "preferred_username");
}

function authenticatedUser(overrides: Record<string, unknown> = {}) {
  return {
    access_token: "access-token-123",
    expired: false,
    expires_at: 1_900_000_000,
    profile: {
      sub: "subject-123",
      preferred_username: "harper.dennis",
      name: "Harper Dennis",
      email: "harper@example.test",
    },
    state: null,
    ...overrides,
  };
}

describe("OIDC browser session", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.unstubAllEnvs();
    for (const key of ENVIRONMENT_KEYS) vi.stubEnv(key, "");
    oidcMocks.managerSettings.length = 0;
    oidcMocks.storageOptions.length = 0;
    oidcMocks.getUser.mockReset().mockResolvedValue(null);
    oidcMocks.signinSilent.mockReset();
    oidcMocks.signinRedirect.mockReset().mockResolvedValue(undefined);
    oidcMocks.signinRedirectCallback.mockReset();
    oidcMocks.signoutRedirect.mockReset().mockResolvedValue(undefined);
    oidcMocks.signoutRedirectCallback.mockReset();
    oidcMocks.addUserLoaded.mockReset();
    oidcMocks.addUserUnloaded.mockReset();
    oidcMocks.addUserSignedOut.mockReset();
    window.sessionStorage.clear();
    window.history.replaceState({}, "", "/");
    vi.restoreAllMocks();
  });

  it("stays disabled unless auth is configured", async () => {
    const auth = await import("./auth");

    await expect(auth.initialize()).resolves.toEqual({
      enabled: false,
      mode: "disabled",
      authenticated: false,
      identity: null,
    });
    await expect(auth.getAccessToken()).resolves.toBeNull();
    await expect(auth.getSessionIdentity()).resolves.toBeNull();
    await expect(auth.signIn()).rejects.toBeInstanceOf(auth.OidcConfigurationError);
    expect(oidcMocks.managerSettings).toHaveLength(0);
  });

  it("fails clearly for partial or unsafe configuration", async () => {
    vi.stubEnv("VITE_OIDC_AUTHORITY", "https://identity.example.test/realms/odf");
    let auth = await import("./auth");
    await expect(auth.initialize()).rejects.toThrow(
      "OIDC authentication requires both VITE_OIDC_AUTHORITY and VITE_OIDC_CLIENT_ID",
    );

    vi.resetModules();
    configureOidc();
    vi.stubEnv("VITE_OIDC_REDIRECT_URI", "https://attacker.example.test/callback");
    auth = await import("./auth");
    await expect(auth.initialize()).rejects.toThrow("must resolve to this application's origin");
  });

  it("uses Authorization Code with PKCE, sessionStorage, and StrictMode-safe singleton initialization", async () => {
    configureOidc();
    window.history.replaceState({}, "", "/canvas/cooling-water?panel=history#pump");
    const auth = await import("./auth");

    const firstInitialization = auth.initialize();
    const secondInitialization = auth.initialize();
    expect(secondInitialization).toBe(firstInitialization);
    await expect(Promise.all([firstInitialization, secondInitialization])).resolves.toEqual([
      { enabled: true, mode: "oidc", authenticated: false, identity: null },
      { enabled: true, mode: "oidc", authenticated: false, identity: null },
    ]);

    expect(oidcMocks.managerSettings).toHaveLength(1);
    expect(oidcMocks.getUser).toHaveBeenCalledTimes(1);
    expect(oidcMocks.managerSettings[0]).toMatchObject({
      authority: "https://identity.example.test/realms/odf",
      client_id: "open-data-fusion-web",
      response_type: "code",
      response_mode: "query",
      disablePKCE: false,
      scope: "openid profile email",
      automaticSilentRenew: true,
      revokeTokensOnSignout: true,
    });
    expect(oidcMocks.managerSettings[0]).not.toHaveProperty("client_secret");
    expect(oidcMocks.storageOptions).toHaveLength(2);
    expect(oidcMocks.storageOptions.every((options) => options.store === window.sessionStorage)).toBe(true);

    const firstSignIn = auth.signIn();
    const secondSignIn = auth.signIn();
    expect(secondSignIn).toBe(firstSignIn);
    await firstSignIn;
    expect(oidcMocks.signinRedirect).toHaveBeenCalledTimes(1);
    expect(oidcMocks.signinRedirect).toHaveBeenCalledWith({
      state: { returnUrl: "/canvas/cooling-water?panel=history#pump" },
    });
  });

  it("processes a code/state callback once, restores the route, and exposes session identity", async () => {
    configureOidc();
    window.history.replaceState({}, "", "/auth/callback?code=code-1&state=state-1&keep=yes#callback");
    oidcMocks.signinRedirectCallback.mockResolvedValue(
      authenticatedUser({
        state: { returnUrl: "/canvas/cooling-water?panel=history#pump" },
      }),
    );
    const auth = await import("./auth");

    const first = auth.initialize();
    const second = auth.initialize();
    const [session] = await Promise.all([first, second]);

    expect(oidcMocks.signinRedirectCallback).toHaveBeenCalledTimes(1);
    expect(oidcMocks.getUser).not.toHaveBeenCalled();
    expect(window.location.pathname).toBe("/canvas/cooling-water");
    expect(window.location.search).toBe("?panel=history");
    expect(window.location.hash).toBe("#pump");
    expect(session).toEqual({
      enabled: true,
      mode: "oidc",
      authenticated: true,
      identity: {
        userId: "harper.dennis",
        displayName: "Harper Dennis",
        email: "harper@example.test",
      },
      expiresAt: 1_900_000_000,
    });
    await expect(auth.getAccessToken()).resolves.toBe("access-token-123");
    await expect(auth.getSessionIdentity()).resolves.toEqual(session.identity);
    await auth.initialize();
    expect(oidcMocks.signinRedirectCallback).toHaveBeenCalledTimes(1);
  });

  it("renews an expired stored session through its refresh token", async () => {
    configureOidc();
    oidcMocks.getUser.mockResolvedValue(authenticatedUser({
      access_token: "expired-token",
      expired: true,
      refresh_token: "refresh-token",
    }));
    oidcMocks.signinSilent.mockResolvedValue(authenticatedUser({ access_token: "renewed-token" }));
    const auth = await import("./auth");

    await expect(auth.initialize()).resolves.toMatchObject({ enabled: true, mode: "oidc", authenticated: true });
    await expect(auth.getAccessToken()).resolves.toBe("renewed-token");
    expect(oidcMocks.signinSilent).toHaveBeenCalledTimes(1);
  });

  it("cleans callback parameters and preserves the current route when callback validation fails", async () => {
    configureOidc();
    window.history.replaceState({}, "", "/auth/callback?code=bad&state=wrong&keep=yes#details");
    oidcMocks.signinRedirectCallback.mockRejectedValue(new Error("state mismatch"));
    const auth = await import("./auth");

    await expect(auth.initialize()).rejects.toThrow("OIDC sign-in callback failed: state mismatch");
    expect(window.location.pathname).toBe("/auth/callback");
    expect(window.location.search).toBe("?keep=yes");
    expect(window.location.hash).toBe("#details");
    await expect(auth.initialize()).rejects.toThrow("state mismatch");
    expect(oidcMocks.signinRedirectCallback).toHaveBeenCalledTimes(1);
  });

  it("deduplicates sign-out redirects and keeps the local return route", async () => {
    configureOidc();
    window.history.replaceState({}, "", "/canvas/cooling-water#node-1");
    oidcMocks.getUser.mockResolvedValue(authenticatedUser());
    const auth = await import("./auth");

    const firstSignOut = auth.signOut();
    const secondSignOut = auth.signOut();
    expect(secondSignOut).toBe(firstSignOut);
    await firstSignOut;
    expect(oidcMocks.signoutRedirect).toHaveBeenCalledTimes(1);
    expect(oidcMocks.signoutRedirect).toHaveBeenCalledWith({
      state: { returnUrl: "/canvas/cooling-water#node-1" },
      post_logout_redirect_uri: `${window.location.origin}/`,
    });
  });

  it("processes a sign-out callback, clears its state, and restores the local route", async () => {
    configureOidc();
    window.history.replaceState({}, "", "/?state=logout-state&keep=yes");
    oidcMocks.signoutRedirectCallback.mockResolvedValue({
      userState: { returnUrl: "/signed-out?complete=yes" },
    });
    const auth = await import("./auth");

    await expect(auth.initialize()).resolves.toEqual({
      enabled: true,
      mode: "oidc",
      authenticated: false,
      identity: null,
    });
    expect(oidcMocks.signoutRedirectCallback).toHaveBeenCalledTimes(1);
    expect(window.location.pathname).toBe("/signed-out");
    expect(window.location.search).toBe("?complete=yes");
  });

  it("supports shared session mode when FII SSO is enabled", async () => {
    vi.stubEnv("VITE_FII_SSO", "true");
    vi.stubEnv("VITE_FII_LOGIN_URL", "/fii/login");
    vi.stubEnv("VITE_FII_APP_NAME", "FII Data Fusion");

    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      userId: "factory-user",
      displayName: "Factory User",
      email: "factory.user@example.local",
    }), {
      status: 200,
      headers: { "content-type": "application/json" },
    }));
    vi.stubGlobal("fetch", fetchMock);

    const auth = await import("./auth");
    const session = await auth.initialize();

    expect(session).toEqual({
      enabled: true,
      mode: "factory",
      authenticated: true,
      identity: {
        userId: "factory-user",
        displayName: "Factory User",
        email: "factory.user@example.local",
      },
    });
    expect(fetchMock).toHaveBeenCalledWith("/api/v1/auth/session", {
      credentials: "include",
      cache: "no-store",
    });
    await expect(auth.getSessionIdentity()).resolves.toEqual({
      userId: "factory-user",
      displayName: "Factory User",
      email: "factory.user@example.local",
    });
  });

  it("redirects to shared login url on signIn in factory mode", async () => {
    vi.stubEnv("VITE_FII_SSO", "on");
    vi.stubEnv("VITE_FII_LOGIN_URL", "https://fii.example.test/login");

    const fetchMock = vi.fn().mockResolvedValue(new Response("", { status: 401 }));
    vi.stubGlobal("fetch", fetchMock);
    const auth = await import("./auth");
    await auth.initialize();

    const assign = vi.fn();
    Object.defineProperty(window, "location", {
      value: { ...window.location, assign },
      writable: true,
    });

    await auth.signIn();

    expect(assign).toHaveBeenCalledWith("https://fii.example.test/login");
  });

  it("ignores FII login URL without an explicit FII SSO toggle", async () => {
    vi.stubEnv("VITE_FII_LOGIN_URL", "/login");
    const auth = await import("./auth");

    await expect(auth.initialize()).resolves.toEqual({
      enabled: false,
      mode: "disabled",
      authenticated: false,
      identity: null,
    });
  });

  it("rejects combined OIDC and FII SSO configuration", async () => {
    vi.stubEnv("VITE_OIDC_AUTHORITY", "https://identity.example.test/realms/odf");
    vi.stubEnv("VITE_OIDC_CLIENT_ID", "open-data-fusion-web");
    vi.stubEnv("VITE_FII_SSO", "true");
    const auth = await import("./auth");

    await expect(auth.initialize()).rejects.toThrow(
      "Only one authentication mode can be enabled at once (OIDC or FII SSO)",
    );
  });
});
