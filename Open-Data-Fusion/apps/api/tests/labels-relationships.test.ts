import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { Express } from 'express';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createApp } from '../src/app.js';
import { DevelopmentIdentityProvider } from '../src/auth.js';
import { FusionDatabase } from '../src/database.js';
import { _resetLabelStores } from '../src/labels-routes.js';
import { _resetRelationshipStore } from '../src/relationships-routes.js';
import { SqliteIndustrialPersistence } from '../src/sqlite-industrial-persistence.js';

const TENANT = 'demo';
const PROJECT = 'north-plant';
const USER = 'harper.dennis';

function platformHeaders(extra: Record<string, string> = {}) {
  return {
    'x-odf-tenant-id': TENANT,
    'x-odf-project-id': PROJECT,
    ...extra,
  };
}

describe('Labels API', () => {
  let tempDirectory: string;
  let database: FusionDatabase;
  let app: Express;

  beforeEach(() => {
    _resetLabelStores();
    tempDirectory = mkdtempSync(join(tmpdir(), 'odf-labels-'));
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

  it('creates a label and lists it', async () => {
    const createResponse = await request(app)
      .post('/api/v1/platform/labels')
      .set(platformHeaders())
      .send({ externalId: 'pump', name: 'Pump', color: '#ff0000', category: 'equipment' });

    expect(createResponse.status).toBe(201);
    expect(createResponse.body).toMatchObject({
      externalId: 'pump',
      name: 'Pump',
      color: '#ff0000',
      category: 'equipment',
    });

    const listResponse = await request(app)
      .get('/api/v1/platform/labels')
      .set(platformHeaders());

    expect(listResponse.status).toBe(200);
    expect(listResponse.body.items).toHaveLength(1);
    expect(listResponse.body.items[0].externalId).toBe('pump');
  });

  it('rejects duplicate label externalId', async () => {
    await request(app)
      .post('/api/v1/platform/labels')
      .set(platformHeaders())
      .send({ externalId: 'dup', name: 'First' });

    const second = await request(app)
      .post('/api/v1/platform/labels')
      .set(platformHeaders())
      .send({ externalId: 'dup', name: 'Second' });

    expect(second.status).toBe(409);
  });

  it('updates a label', async () => {
    await request(app)
      .post('/api/v1/platform/labels')
      .set(platformHeaders())
      .send({ externalId: 'motor', name: 'Motor' });

    const patch = await request(app)
      .patch('/api/v1/platform/labels/motor')
      .set(platformHeaders())
      .send({ name: 'AC Motor', color: '#00ff00' });

    expect(patch.status).toBe(200);
    expect(patch.body.name).toBe('AC Motor');
    expect(patch.body.color).toBe('#00ff00');
  });

  it('deletes a label and its attachments', async () => {
    await request(app)
      .post('/api/v1/platform/labels')
      .set(platformHeaders())
      .send({ externalId: 'temp', name: 'Temporary' });

    await request(app)
      .post('/api/v1/platform/labels/attach')
      .set(platformHeaders())
      .send({ labelExternalId: 'temp', resourceType: 'asset', resourceExternalId: 'pump-101' });

    const del = await request(app)
      .delete('/api/v1/platform/labels/temp')
      .set(platformHeaders());

    expect(del.status).toBe(204);

    const list = await request(app)
      .get('/api/v1/platform/labels')
      .set(platformHeaders());

    expect(list.body.items).toHaveLength(0);
  });

  it('attaches and detaches a label', async () => {
    await request(app)
      .post('/api/v1/platform/labels')
      .set(platformHeaders())
      .send({ externalId: 'critical', name: 'Critical' });

    const attach = await request(app)
      .post('/api/v1/platform/labels/attach')
      .set(platformHeaders())
      .send({ labelExternalId: 'critical', resourceType: 'asset', resourceExternalId: 'pump-101' });

    expect(attach.status).toBe(201);

    // Idempotent re-attach
    const reattach = await request(app)
      .post('/api/v1/platform/labels/attach')
      .set(platformHeaders())
      .send({ labelExternalId: 'critical', resourceType: 'asset', resourceExternalId: 'pump-101' });

    expect(reattach.status).toBe(200);

    // List attachments
    const attachments = await request(app)
      .get('/api/v1/platform/labels/attachments')
      .set(platformHeaders())
      .query({ labelExternalId: 'critical' });

    expect(attachments.status).toBe(200);
    expect(attachments.body.items).toHaveLength(1);

    // Detach
    const detach = await request(app)
      .post('/api/v1/platform/labels/detach')
      .set(platformHeaders())
      .send({ labelExternalId: 'critical', resourceType: 'asset', resourceExternalId: 'pump-101' });

    expect(detach.status).toBe(204);
  });

  it('returns 404 when attaching to non-existent label', async () => {
    const attach = await request(app)
      .post('/api/v1/platform/labels/attach')
      .set(platformHeaders())
      .send({ labelExternalId: 'ghost', resourceType: 'asset', resourceExternalId: 'pump-101' });

    expect(attach.status).toBe(404);
  });

  it('filters labels by category', async () => {
    await request(app)
      .post('/api/v1/platform/labels')
      .set(platformHeaders())
      .send({ externalId: 'a', name: 'A', category: 'type-a' });

    await request(app)
      .post('/api/v1/platform/labels')
      .set(platformHeaders())
      .send({ externalId: 'b', name: 'B', category: 'type-b' });

    const filtered = await request(app)
      .get('/api/v1/platform/labels')
      .set(platformHeaders())
      .query({ category: 'type-a' });

    expect(filtered.body.items).toHaveLength(1);
    expect(filtered.body.items[0].externalId).toBe('a');
  });
});

describe('Relationships API', () => {
  let tempDirectory: string;
  let database: FusionDatabase;
  let app: Express;

  beforeEach(() => {
    _resetRelationshipStore();
    tempDirectory = mkdtempSync(join(tmpdir(), 'odf-relationships-'));
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

  it('creates a relationship and lists it', async () => {
    const createResponse = await request(app)
      .post('/api/v1/platform/relationships')
      .set(platformHeaders())
      .send({
        externalId: 'pump-to-motor',
        sourceType: 'asset',
        sourceExternalId: 'pump-101',
        targetType: 'asset',
        targetExternalId: 'motor-201',
        relationshipType: 'drives',
      });

    expect(createResponse.status).toBe(201);
    expect(createResponse.body).toMatchObject({
      externalId: 'pump-to-motor',
      sourceType: 'asset',
      targetType: 'asset',
      relationshipType: 'drives',
      confidence: 1,
    });

    const listResponse = await request(app)
      .get('/api/v1/platform/relationships')
      .set(platformHeaders());

    expect(listResponse.status).toBe(200);
    expect(listResponse.body.items).toHaveLength(1);
  });

  it('rejects duplicate relationship externalId', async () => {
    const body = {
      externalId: 'dup-rel',
      sourceType: 'asset',
      sourceExternalId: 'a',
      targetType: 'asset',
      targetExternalId: 'b',
      relationshipType: 'connectedTo',
    };

    await request(app).post('/api/v1/platform/relationships').set(platformHeaders()).send(body);
    const second = await request(app).post('/api/v1/platform/relationships').set(platformHeaders()).send(body);

    expect(second.status).toBe(409);
  });

  it('updates relationship confidence and labels', async () => {
    await request(app)
      .post('/api/v1/platform/relationships')
      .set(platformHeaders())
      .send({
        externalId: 'update-me',
        sourceType: 'asset',
        sourceExternalId: 'a',
        targetType: 'time_series',
        targetExternalId: 'ts-1',
        relationshipType: 'monitors',
      });

    const patch = await request(app)
      .patch('/api/v1/platform/relationships/update-me')
      .set(platformHeaders())
      .send({ confidence: 0.85, labels: ['verified', 'production'] });

    expect(patch.status).toBe(200);
    expect(patch.body.confidence).toBe(0.85);
    expect(patch.body.labels).toEqual(['verified', 'production']);
  });

  it('deletes a relationship', async () => {
    await request(app)
      .post('/api/v1/platform/relationships')
      .set(platformHeaders())
      .send({
        externalId: 'delete-me',
        sourceType: 'asset',
        sourceExternalId: 'a',
        targetType: 'asset',
        targetExternalId: 'b',
        relationshipType: 'flows_to',
      });

    const del = await request(app)
      .delete('/api/v1/platform/relationships/delete-me')
      .set(platformHeaders());

    expect(del.status).toBe(204);

    const list = await request(app)
      .get('/api/v1/platform/relationships')
      .set(platformHeaders());

    expect(list.body.items).toHaveLength(0);
  });

  it('filters relationships by type', async () => {
    await request(app)
      .post('/api/v1/platform/relationships')
      .set(platformHeaders())
      .send({
        externalId: 'r1',
        sourceType: 'asset',
        sourceExternalId: 'a',
        targetType: 'asset',
        targetExternalId: 'b',
        relationshipType: 'drives',
      });

    await request(app)
      .post('/api/v1/platform/relationships')
      .set(platformHeaders())
      .send({
        externalId: 'r2',
        sourceType: 'asset',
        sourceExternalId: 'c',
        targetType: 'time_series',
        targetExternalId: 'ts-1',
        relationshipType: 'monitors',
      });

    const filtered = await request(app)
      .get('/api/v1/platform/relationships')
      .set(platformHeaders())
      .query({ relationshipType: 'drives' });

    expect(filtered.body.items).toHaveLength(1);
    expect(filtered.body.items[0].externalId).toBe('r1');
  });
});
