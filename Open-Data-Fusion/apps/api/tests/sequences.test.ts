import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { Express } from 'express';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createApp } from '../src/app.js';
import { DevelopmentIdentityProvider } from '../src/auth.js';
import { FusionDatabase } from '../src/database.js';
import { _resetSequenceStore } from '../src/sequences-routes.js';
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

describe('Sequences API', () => {
  let tempDirectory: string;
  let database: FusionDatabase;
  let app: Express;

  beforeEach(() => {
    _resetSequenceStore();
    tempDirectory = mkdtempSync(join(tmpdir(), 'odf-sequences-'));
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

  it('creates a sequence and lists it', async () => {
    const createResponse = await request(app)
      .post('/api/v1/platform/sequences')
      .set(platformHeaders())
      .send({
        externalId: 'seq-temp',
        name: 'Temperature Log',
        columns: [
          { externalId: 'time', name: 'Timestamp', valueType: 'LONG' },
          { externalId: 'temp', name: 'Temperature', valueType: 'DOUBLE' },
        ],
      });

    expect(createResponse.status).toBe(201);
    expect(createResponse.body).toMatchObject({
      externalId: 'seq-temp',
      name: 'Temperature Log',
      columns: [
        { externalId: 'time', name: 'Timestamp', valueType: 'LONG' },
        { externalId: 'temp', name: 'Temperature', valueType: 'DOUBLE' },
      ],
    });

    const listResponse = await request(app)
      .get('/api/v1/platform/sequences')
      .set(platformHeaders());

    expect(listResponse.status).toBe(200);
    expect(listResponse.body.items).toHaveLength(1);
    expect(listResponse.body.items[0].externalId).toBe('seq-temp');
  });

  it('rejects duplicate sequence externalId', async () => {
    const payload = {
      externalId: 'dup-seq',
      name: 'First',
      columns: [{ externalId: 'c1', name: 'Col 1', valueType: 'STRING' }],
    };

    await request(app).post('/api/v1/platform/sequences').set(platformHeaders()).send(payload);
    const second = await request(app).post('/api/v1/platform/sequences').set(platformHeaders()).send(payload);

    expect(second.status).toBe(409);
  });

  it('gets a single sequence by externalId', async () => {
    await request(app)
      .post('/api/v1/platform/sequences')
      .set(platformHeaders())
      .send({
        externalId: 'seq-get',
        name: 'Get Me',
        columns: [{ externalId: 'val', name: 'Value', valueType: 'DOUBLE' }],
      });

    const getResponse = await request(app)
      .get('/api/v1/platform/sequences/seq-get')
      .set(platformHeaders());

    expect(getResponse.status).toBe(200);
    expect(getResponse.body.name).toBe('Get Me');
  });

  it('updates sequence metadata', async () => {
    await request(app)
      .post('/api/v1/platform/sequences')
      .set(platformHeaders())
      .send({
        externalId: 'seq-update',
        name: 'Old Name',
        columns: [{ externalId: 'c1', name: 'Col', valueType: 'STRING' }],
      });

    const patch = await request(app)
      .patch('/api/v1/platform/sequences/seq-update')
      .set(platformHeaders())
      .send({ name: 'New Name', description: 'Updated' });

    expect(patch.status).toBe(200);
    expect(patch.body.name).toBe('New Name');
    expect(patch.body.description).toBe('Updated');
  });

  it('deletes a sequence and its rows', async () => {
    await request(app)
      .post('/api/v1/platform/sequences')
      .set(platformHeaders())
      .send({
        externalId: 'seq-del',
        name: 'Delete Me',
        columns: [{ externalId: 'c1', name: 'Col', valueType: 'LONG' }],
      });

    await request(app)
      .post('/api/v1/platform/sequences/seq-del/rows')
      .set(platformHeaders())
      .send({ columns: ['c1'], rows: [{ rowNumber: 0, values: [100] }] });

    const del = await request(app)
      .delete('/api/v1/platform/sequences/seq-del')
      .set(platformHeaders());

    expect(del.status).toBe(204);

    const list = await request(app)
      .get('/api/v1/platform/sequences')
      .set(platformHeaders());

    expect(list.body.items).toHaveLength(0);
  });

  it('inserts and queries sequence rows', async () => {
    await request(app)
      .post('/api/v1/platform/sequences')
      .set(platformHeaders())
      .send({
        externalId: 'seq-rows',
        name: 'Tabular Log',
        columns: [
          { externalId: 'time', name: 'Time', valueType: 'LONG' },
          { externalId: 'status', name: 'Status', valueType: 'STRING' },
        ],
      });

    const insertResponse = await request(app)
      .post('/api/v1/platform/sequences/seq-rows/rows')
      .set(platformHeaders())
      .send({
        columns: ['time', 'status'],
        rows: [
          { rowNumber: 0, values: [1700000000, 'OK'] },
          { rowNumber: 1, values: [1700000060, 'WARN'] },
        ],
      });

    expect(insertResponse.status).toBe(200);
    expect(insertResponse.body.insertedRows).toBe(2);

    const queryResponse = await request(app)
      .get('/api/v1/platform/sequences/seq-rows/rows')
      .set(platformHeaders());

    expect(queryResponse.status).toBe(200);
    expect(queryResponse.body.columns).toEqual(['time', 'status']);
    expect(queryResponse.body.rows).toEqual([
      { rowNumber: 0, values: [1700000000, 'OK'] },
      { rowNumber: 1, values: [1700000060, 'WARN'] },
    ]);
  });

  it('filters rows by range and limits result', async () => {
    await request(app)
      .post('/api/v1/platform/sequences')
      .set(platformHeaders())
      .send({
        externalId: 'seq-range',
        name: 'Range Test',
        columns: [{ externalId: 'v', name: 'Val', valueType: 'DOUBLE' }],
      });

    await request(app)
      .post('/api/v1/platform/sequences/seq-range/rows')
      .set(platformHeaders())
      .send({
        columns: ['v'],
        rows: [
          { rowNumber: 0, values: [0.1] },
          { rowNumber: 10, values: [1.0] },
          { rowNumber: 20, values: [2.0] },
          { rowNumber: 30, values: [3.0] },
        ],
      });

    const rangeResponse = await request(app)
      .get('/api/v1/platform/sequences/seq-range/rows')
      .set(platformHeaders())
      .query({ start: 10, end: 25 });

    expect(rangeResponse.status).toBe(200);
    expect(rangeResponse.body.rows).toHaveLength(2);
    expect(rangeResponse.body.rows[0].rowNumber).toBe(10);
    expect(rangeResponse.body.rows[1].rowNumber).toBe(20);
  });
});
