# Shared Login for FII Frontend, FII AE AI, and FII Data Fusion

**Date:** 2026-07-18  
**Status:** Approved design  
**Scope:** Same-host deployment, currently `localhost` on separate ports

## Goal

Require login before any FII frontend screen is shown. One successful login in the main frontend must also authenticate the same user in FII AE AI (the Odysseus application at port 7000) and FII Data Fusion (the Open Data Fusion application), without a second credential prompt.

## Chosen approach

The main backend remains the single login authority. Its existing signed JWT is also written to a shared `HttpOnly` cookie. The three backend services validate that cookie independently with the same configured signing secret, issuer, and audience.

This is the smallest secure change for the current deployment because cookies are scoped by hostname rather than port. It avoids a new identity server, new dependencies, password fan-out, browser storage sharing, and tokens in URLs.

The approach is intentionally limited to applications served from the same hostname. A future deployment across unrelated domains must migrate to a shared OIDC provider instead of weakening cookie policy.

## Authentication contract

### JWT

The main backend continues issuing an HS256 JWT with a two-hour lifetime. It adds standard claims while preserving existing .NET claims:

- `sub`: normalized username
- `role`: one of `ADMIN`, `ENGINEER`, or `GUEST`
- `iss`: configured main-backend issuer
- `aud`: configured main-backend audience
- `exp`: token expiration

Every consumer must verify the signature, algorithm, issuer, audience, and expiration. Decoding claims without verification is never sufficient at a service boundary.

### Cookie

The successful login response sets one cookie named `fii_sso`:

- `HttpOnly=true`
- `SameSite=Strict`
- `Path=/`
- `Secure=true` outside explicitly configured local HTTP development
- expiration no later than the JWT expiration
- no `Domain` attribute for localhost; an optional configured parent domain may be used for same-site production subdomains

The cookie is never exposed to JavaScript and the token is never placed in a query string, URL fragment, browser message, or log.

### Role mapping

The signed main role is authoritative.

| Main role | Odysseus | Open Data Fusion |
| --- | --- | --- |
| `ADMIN` | administrator | all data-plane permissions |
| `ENGINEER` | standard user | read, ingest, relation review, and writeback request |
| `GUEST` | standard user | read only |

Open Data Fusion workspace and project membership checks remain in force. A valid SSO identity does not automatically grant membership or ownership.

## Main frontend and backend

### Entry routing

`/login` remains public. All application pages, including viewer routes and slideshow, pass through the existing `ProtectedRoute`. An unauthenticated visit to `/` or any application route redirects to `/login`. After login, existing role-based navigation continues to choose the appropriate application experience.

### Login

`POST /api/auth/login` keeps its current response for compatibility and additionally sets `fii_sso`. The frontend keeps the current in-memory/persisted state for its existing API client; sibling applications rely only on the HttpOnly cookie.

### Session and logout

The backend adds:

- `GET /api/auth/session`: authenticated session metadata only (`username`, `role`, and expiration), never the token
- `POST /api/auth/logout`: clears `fii_sso`

Main logout calls the backend endpoint and always clears local frontend state. A backend failure is surfaced to the user because the server cookie may remain until it expires.

ASP.NET JWT bearer authentication accepts the token from the existing `Authorization` header first and from `fii_sso` when the header is absent. Exact-origin credentialed CORS remains required; wildcard origins are forbidden.

## FII AE AI (Odysseus)

Odysseus retains its native cookie login as a compatibility fallback. When `FII_SSO_ENABLED=true`, its authentication middleware first checks `fii_sso` and validates the main JWT using Python standard-library HMAC primitives. No JWT package is added.

On the first valid SSO request, Odysseus creates or updates a shadow user keyed by the signed `sub` claim. Shadow users have no usable local password. Their administrator flag follows the signed main role; other privileges use Odysseus defaults. The middleware sets the existing `current_user`, so owner scoping and authorization continue through established code paths.

An invalid, expired, wrongly issued, or wrongly targeted SSO cookie is rejected. It must never fall through to an unrelated identity. When no SSO cookie is present, the existing native session behavior remains unchanged.

## FII Data Fusion (Open Data Fusion)

Open Data Fusion adds a `factory` authentication mode alongside its existing `development` and `oidc` modes.

The API implements a factory identity provider using the already installed `jose` package. It validates `fii_sso`, applies the explicit role-permission map, and returns the existing authenticated identity shape. `GET /api/v1/auth/session` exposes only verified identity metadata for the web authentication boundary.

The web authentication boundary calls that same-origin session endpoint. A valid session renders the app immediately; a 401 shows a link back to the main frontend login. API fetches include credentials, so the HttpOnly cookie reaches the ODF API through the existing Vite or deployment proxy. Existing OIDC behavior remains untouched when OIDC mode is selected.

## Logout behavior

The main application owns global logout. Clearing `fii_sso` immediately removes shared authentication for subsequent Odysseus and ODF requests. Both applications respond to the next 401 by directing the browser to the main login URL.

Native Odysseus sessions created through its own login remain independent; shared-login shadow users do not receive a native Odysseus session. This prevents global logout from being bypassed by a second cookie created during SSO.

## Error handling

- Invalid credentials: main login remains unauthenticated and no shared cookie is set.
- Missing or expired cookie: sibling app returns 401 and directs the user to the main login.
- Invalid signature, issuer, audience, algorithm, role, or subject: fail closed with 401 and do not create/update an account.
- Unknown role: fail closed; never default to administrator or full permissions.
- ODF identity without project membership: authenticate successfully but preserve the existing no-access/empty-state response.
- Backend unavailable during logout: clear local state, report that server logout did not complete, and do not claim global logout succeeded.

## Configuration

All services use environment-provided values in deployed environments:

- shared JWT secret
- JWT issuer and audience
- `FII_SSO_ENABLED`
- secure-cookie toggle for local HTTP only
- optional cookie domain
- main login URL used by sibling 401 screens

Local links and configuration must consistently use `localhost`; mixing `localhost` and `127.0.0.1` creates different cookie hosts.

No real secret is added to source control. Existing development fallbacks remain development-only and deployment examples require an explicit secret.

## Verification

Implementation is complete only when all of the following pass with fresh evidence:

1. Main backend tests prove cookie attributes, standard JWT claims, header/cookie authentication, session metadata, logout clearing, invalid/expired token rejection, and exact-origin credentialed CORS.
2. Main frontend tests prove `/`, viewer routes, admin routes, and slideshow redirect to `/login` without a session; successful login enters the app; logout calls the backend and clears local state.
3. Odysseus tests prove valid, tampered, expired, wrong-issuer, wrong-audience, unknown-role, and missing-subject cookies; shadow-user role mapping; and native-session fallback when no SSO cookie exists.
4. ODF API tests prove factory-cookie validation and role-permission mapping while retaining membership enforcement.
5. ODF web tests prove a valid factory session opens directly and a 401 points to the main login without exposing a token.
6. Existing focused test suites, type checks, and production builds for all touched applications pass.
7. A same-host runtime smoke check proves: visit frontend → login UI → login once → open FII AE AI without another login → open FII Data Fusion without another login → global logout → both sibling apps reject the next authenticated request.

## Out of scope

- Cross-domain SSO between unrelated registrable domains
- Refresh tokens or server-side JWT revocation
- Replacing native Odysseus login
- Automatic ODF workspace/project membership grants
- A new Keycloak/OIDC deployment
- Password synchronization between user databases

