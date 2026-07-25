import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { Express } from 'express';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { _resetAnnotationStore } from '../src/annotations-routes.js';
import { createApp } from '../src/app.js';
import { DevelopmentIdentityProvider } from '../src/auth.js';
import { FusionDatabase } from '../src/database.js';
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

describe('Annotations API', () => {
  let tempDirectory: string;
  let database: FusionDatabase;
  let app: Express;

  beforeEach(() => {
    _resetAnnotationStore();
    tempDirectory = mkdtempSync(join(tmpdir(), 'odf-annotations-'));
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

  it('creates an annotation and lists it', async () => {
    const createResponse = await request(app)
      .post('/api/v1/platform/annotations')
      .set(platformHeaders())
      .send({
        annotationType: 'diagram_tag',
        annotatedResourceType: 'file',
        annotatedResourceExternalId: 'pid-drawing-001',
        data: {
          label: 'P-101',
          confidence: 0.95,
          boundingBox: { xMin: 10, yMin: 20, xMax: 100, yMax: 50, page: 1 },
          linkedResourceType: 'asset',
          linkedResourceExternalId: 'P-101',
        },
      });

    expect(createResponse.status).toBe(201);
    expect(createResponse.body).toMatchObject({
      id: '1',
      annotationType: 'diagram_tag',
      status: 'suggested',
      annotatedResourceType: 'file',
      annotatedResourceExternalId: 'pid-drawing-001',
      data: {
        label: 'P-101',
        confidence: 0.95,
      },
    });

    const listResponse = await request(app)
      .get('/api/v1/platform/annotations')
      .set(platformHeaders());

    expect(listResponse.status).toBe(200);
    expect(listResponse.body.items).toHaveLength(1);
    expect(listResponse.body.items[0].id).toBe('1');
  });

  it('gets a single annotation by id', async () => {
    const createResponse = await request(app)
      .post('/api/v1/platform/annotations')
      .set(platformHeaders())
      .send({
        annotationType: 'text',
        annotatedResourceType: 'file',
        annotatedResourceExternalId: 'doc-001',
        data: { label: 'High pressure warning note' },
      });

    const id = createResponse.body.id;

    const getResponse = await request(app)
      .get(`/api/v1/platform/annotations/${id}`)
      .set(platformHeaders());

    expect(getResponse.status).toBe(200);
    expect(getResponse.body.data.label).toBe('High pressure warning note');
  });

  it('returns 404 for non-existent annotation', async () => {
    const getResponse = await request(app)
      .get('/api/v1/platform/annotations/999')
      .set(platformHeaders());

    expect(getResponse.status).toBe(404);
  });

  it('updates annotation status from suggested to approved', async () => {
    const createResponse = await request(app)
      .post('/api/v1/platform/annotations')
      .set(platformHeaders())
      .send({
        annotationType: 'region',
        annotatedResourceType: 'file',
        annotatedResourceExternalId: 'image-001',
        data: { label: 'Corrosion zone' },
      });

    const id = createResponse.body.id;

    const patchResponse = await request(app)
      .patch(`/api/v1/platform/annotations/${id}`)
      .set(platformHeaders())
      .send({
        status: 'approved',
        data: { label: 'Severe corrosion zone', confidence: 0.99 },
      });

    expect(patchResponse.status).toBe(200);
    expect(patchResponse.body.status).toBe('approved');
    expect(patchResponse.body.data.label).toBe('Severe corrosion zone');
    expect(patchResponse.body.data.confidence).toBe(0.99);
  });

  it('deletes an annotation', async () => {
    const createResponse = await request(app)
      .post('/api/v1/platform/annotations')
      .set(platformHeaders())
      .send({
        annotationType: 'text',
        annotatedResourceType: 'file',
        annotatedResourceExternalId: 'doc-del',
        data: { label: 'Delete me' },
      });

    const id = createResponse.body.id;

    const delResponse = await request(app)
      .delete(`/api/v1/platform/annotations/${id}`)
      .set(platformHeaders());

    expect(delResponse.status).toBe(204);

    const listResponse = await request(app)
      .get('/api/v1/platform/annotations')
      .set(platformHeaders());

    expect(listResponse.body.items).toHaveLength(0);
  });

  it('filters annotations by resource externalId, type, and status', async () => {
    await request(app)
      .post('/api/v1/platform/annotations')
      .set(platformHeaders())
      .send({
        annotationType: 'diagram_tag',
        annotatedResourceType: 'file',
        annotatedResourceExternalId: 'file-A',
        data: { label: 'Tag A' },
        status: 'approved',
      });

    await request(app)
      .post('/api/v1/platform/annotations')
      .set(platformHeaders())
      .send({
        annotationType: 'text',
        annotatedResourceType: 'file',
        annotatedResourceExternalId: 'file-B',
        data: { label: 'Tag B' },
        status: 'suggested',
      });

    const filterRes = await request(app)
      .get('/api/v1/platform/annotations')
      .set(platformHeaders())
      .query({ annotatedResourceExternalId: 'file-A', status: 'approved' });

    expect(filterRes.status).toBe(200);
    expect(filterRes.body.items).toHaveLength(1);
    expect(filterRes.body.items[0].data.label).toBe('Tag A');
  });

  it('bulk-suggests annotations via /suggest endpoint', async () => {
    const bulkResponse = await request(app)
      .post('/api/v1/platform/annotations/suggest')
      .set(platformHeaders())
      .send([
        {
          annotationType: 'diagram_tag',
          annotatedResourceType: 'file',
          annotatedResourceExternalId: 'pid-001',
          data: { label: 'VALVE-01' },
        },
        {
          annotationType: 'diagram_tag',
          annotatedResourceType: 'file',
          annotatedResourceExternalId: 'pid-001',
          data: { label: 'PUMP-02' },
        },
      ]);

    expect(bulkResponse.status).toBe(201);
    expect(bulkResponse.body.items).toHaveLength(2);
    expect(bulkResponse.body.items[0].status).toBe('suggested');
    expect(bulkResponse.body.items[1].status).toBe('suggested');

    const list = await request(app)
      .get('/api/v1/platform/annotations')
      .set(platformHeaders());

    expect(list.body.items).toHaveLength(2);
  });
});
