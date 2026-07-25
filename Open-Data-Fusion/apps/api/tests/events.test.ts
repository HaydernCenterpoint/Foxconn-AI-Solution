import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { Express } from 'express';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createApp } from '../src/app.js';
import { DevelopmentIdentityProvider } from '../src/auth.js';
import { FusionDatabase } from '../src/database.js';
import { _resetEventStore } from '../src/events-routes.js';
import { SqliteIndustrialPersistence } from '../src/sqlite-industrial-persistence.js';

const TENANT = 'demo';
const PROJECT = 'north-plant';
const USER = 'harper.dennis';

function platformHeaders() {
  return {
    'x-odf-tenant-id': TENANT,
    'x-odf-project-id': PROJECT,
  };
}

describe('Events API', () => {
  let tempDirectory: string;
  let database: FusionDatabase;
  let app: Express;

  beforeEach(() => {
    _resetEventStore();
    tempDirectory = mkdtempSync(join(tmpdir(), 'odf-events-'));
    database = new FusionDatabase({ path: join(tempDirectory, 'test.db') });
    app = createApp(database, undefined, {
      identityProvider: new DevelopmentIdentityProvider(USER),
      defaultPlatformContext: { tenantId: TENANT, projectId: PROJECT },
      industrialPersistence: new SqliteIndustrialPersistence(database.database),
    });
  });

  afterEach(() => {
    database.close();
    rmSync(tempDirectory, { recursive: true, force: true });
  });

  it('creates an event and lists it', async () => {
    const createResponse = await request(app)
      .post('/api/v1/platform/events')
      .set(platformHeaders())
      .send({
        externalId: 'maint-001',
        type: 'maintenance',
        description: 'Pump replacement',
        startTime: '2026-01-15T08:00:00Z',
        assetExternalIds: ['P-101'],
        source: 'cmms',
      });

    expect(createResponse.status).toBe(201);
    expect(createResponse.body).toMatchObject({
      externalId: 'maint-001',
      type: 'maintenance',
      description: 'Pump replacement',
      assetExternalIds: ['P-101'],
      source: 'cmms',
    });

    const listResponse = await request(app)
      .get('/api/v1/platform/events')
      .set(platformHeaders());

    expect(listResponse.status).toBe(200);
    expect(listResponse.body.items).toHaveLength(1);
    expect(listResponse.body.items[0].externalId).toBe('maint-001');
  });

  it('rejects duplicate event externalId', async () => {
    await request(app)
      .post('/api/v1/platform/events')
      .set(platformHeaders())
      .send({ externalId: 'dup', type: 'alarm' });

    const second = await request(app)
      .post('/api/v1/platform/events')
      .set(platformHeaders())
      .send({ externalId: 'dup', type: 'alarm' });

    expect(second.status).toBe(409);
  });

  it('gets a single event by externalId', async () => {
    await request(app)
      .post('/api/v1/platform/events')
      .set(platformHeaders())
      .send({ externalId: 'evt-get', type: 'failure', description: 'Motor overheated' });

    const getResponse = await request(app)
      .get('/api/v1/platform/events/evt-get')
      .set(platformHeaders());

    expect(getResponse.status).toBe(200);
    expect(getResponse.body.description).toBe('Motor overheated');
  });

  it('returns 404 for non-existent event', async () => {
    const getResponse = await request(app)
      .get('/api/v1/platform/events/ghost')
      .set(platformHeaders());

    expect(getResponse.status).toBe(404);
  });

  it('updates event fields', async () => {
    await request(app)
      .post('/api/v1/platform/events')
      .set(platformHeaders())
      .send({
        externalId: 'evt-update',
        type: 'inspection',
        description: 'Quarterly check',
      });

    const patch = await request(app)
      .patch('/api/v1/platform/events/evt-update')
      .set(platformHeaders())
      .send({
        description: 'Annual inspection',
        endTime: '2026-03-15T16:00:00Z',
        assetExternalIds: ['P-101', 'P-102'],
      });

    expect(patch.status).toBe(200);
    expect(patch.body.description).toBe('Annual inspection');
    expect(patch.body.endTime).toBe('2026-03-15T16:00:00Z');
    expect(patch.body.assetExternalIds).toEqual(['P-101', 'P-102']);
  });

  it('deletes an event', async () => {
    await request(app)
      .post('/api/v1/platform/events')
      .set(platformHeaders())
      .send({ externalId: 'evt-del', type: 'alarm' });

    const del = await request(app)
      .delete('/api/v1/platform/events/evt-del')
      .set(platformHeaders());

    expect(del.status).toBe(204);

    const list = await request(app)
      .get('/api/v1/platform/events')
      .set(platformHeaders());

    expect(list.body.items).toHaveLength(0);
  });

  it('filters events by type', async () => {
    await request(app)
      .post('/api/v1/platform/events')
      .set(platformHeaders())
      .send({ externalId: 'e1', type: 'alarm' });

    await request(app)
      .post('/api/v1/platform/events')
      .set(platformHeaders())
      .send({ externalId: 'e2', type: 'maintenance' });

    const filtered = await request(app)
      .get('/api/v1/platform/events')
      .set(platformHeaders())
      .query({ type: 'alarm' });

    expect(filtered.body.items).toHaveLength(1);
    expect(filtered.body.items[0].externalId).toBe('e1');
  });

  it('filters events by assetExternalId', async () => {
    await request(app)
      .post('/api/v1/platform/events')
      .set(platformHeaders())
      .send({ externalId: 'e-pump', type: 'alarm', assetExternalIds: ['P-101'] });

    await request(app)
      .post('/api/v1/platform/events')
      .set(platformHeaders())
      .send({ externalId: 'e-motor', type: 'alarm', assetExternalIds: ['M-201'] });

    const filtered = await request(app)
      .get('/api/v1/platform/events')
      .set(platformHeaders())
      .query({ assetExternalId: 'P-101' });

    expect(filtered.body.items).toHaveLength(1);
    expect(filtered.body.items[0].externalId).toBe('e-pump');
  });

  it('filters events by time range', async () => {
    await request(app)
      .post('/api/v1/platform/events')
      .set(platformHeaders())
      .send({ externalId: 'e-jan', type: 'maintenance', startTime: '2026-01-15T00:00:00Z' });

    await request(app)
      .post('/api/v1/platform/events')
      .set(platformHeaders())
      .send({ externalId: 'e-mar', type: 'maintenance', startTime: '2026-03-15T00:00:00Z' });

    const filtered = await request(app)
      .get('/api/v1/platform/events')
      .set(platformHeaders())
      .query({ startTimeMin: '2026-02-01T00:00:00Z' });

    expect(filtered.body.items).toHaveLength(1);
    expect(filtered.body.items[0].externalId).toBe('e-mar');
  });

  it('stores metadata on events', async () => {
    const createResponse = await request(app)
      .post('/api/v1/platform/events')
      .set(platformHeaders())
      .send({
        externalId: 'e-meta',
        type: 'alarm',
        metadata: { severity: 'high', zone: 'area-A' },
      });

    expect(createResponse.status).toBe(201);
    expect(createResponse.body.metadata).toEqual({ severity: 'high', zone: 'area-A' });
  });
});
