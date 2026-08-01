import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { Express } from 'express';
import { SignJWT } from 'jose';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createApp } from '../src/app.js';
import { FiiSsoIdentityProvider } from '../src/auth.js';
import { FusionDatabase } from '../src/database.js';
import { SqliteIndustrialPersistence } from '../src/sqlite-industrial-persistence.js';

const SECRET = 'a_very_secret_key_that_is_at_least_32_bytes_long_12345';
const TENANT = 'demo';
const PROJECT = 'north-plant';

function platformHeaders() {
  return {
    'x-odf-tenant-id': TENANT,
    'x-odf-project-id': PROJECT,
  };
}

describe('FII SSO Identity Provider', () => {
  let tempDirectory: string;
  let database: FusionDatabase;
  let app: Express;
  let fiiProvider: FiiSsoIdentityProvider;

  beforeEach(() => {
    tempDirectory = mkdtempSync(join(tmpdir(), 'odf-fii-sso-'));
    database = new FusionDatabase({ path: join(tempDirectory, 'test.db') });
    fiiProvider = new FiiSsoIdentityProvider(SECRET, 'MKZ_PLC_Server', 'MKZ_PLC_Client');
    app = createApp(database, undefined, {
      identityProvider: fiiProvider,
      defaultPlatformContext: { tenantId: TENANT, projectId: PROJECT },
      industrialPersistence: new SqliteIndustrialPersistence(database.database),
    });
  });

  afterEach(() => {
    database.close();
    rmSync(tempDirectory, { recursive: true, force: true });
  });

  async function makeFiiToken(username: string, role = 'ADMIN', expiresHours = 2) {
    const secretBytes = new TextEncoder().encode(SECRET);
    return new SignJWT({
      sub: username.toLowerCase(),
      role,
      name: username,
    })
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuer('MKZ_PLC_Server')
      .setAudience('MKZ_PLC_Client')
      .setIssuedAt()
      .setExpirationTime(`${expiresHours}h`)
      .sign(secretBytes);
  }

  it('authenticates request via fii_sso cookie', async () => {
    const token = await makeFiiToken('harper.dennis');

    const res = await request(app)
      .get('/api/v1/platform/annotations')
      .set(platformHeaders())
      .set('cookie', `fii_sso=${token}`);

    expect(res.status).toBe(200);
  });

  it('authenticates request via Bearer header', async () => {
    const token = await makeFiiToken('harper.dennis');

    const res = await request(app)
      .get('/api/v1/platform/annotations')
      .set(platformHeaders())
      .set('authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
  });

  it('rejects request with invalid token', async () => {
    const res = await request(app)
      .get('/api/v1/platform/annotations')
      .set(platformHeaders())
      .set('cookie', 'fii_sso=invalid.token.here');

    expect(res.status).toBe(401);
  });
});
