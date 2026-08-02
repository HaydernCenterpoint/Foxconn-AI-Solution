# Backend deployment identity

The backend issues the JWT consumed by Factory AI Gateway. Every deployment must
configure one canonical tenant identifier through either `Jwt:TenantId` (for
environment-variable configuration, `Jwt__TenantId`) or `FII_TENANT_ID`.

Token issuance fails closed when neither value is present. This is a configured
single-tenant boundary only: the current `users` table has no per-user tenant
ownership mapping, and the backend does not infer a tenant from the username.
