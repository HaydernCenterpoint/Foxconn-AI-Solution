/**
 * Sequences API routes — row-indexed tabular data storage (CDF parity).
 *
 * Endpoints:
 *   GET    /api/v1/platform/sequences                      — list sequences
 *   POST   /api/v1/platform/sequences                      — create a sequence
 *   GET    /api/v1/platform/sequences/:externalId           — get a single sequence
 *   PATCH  /api/v1/platform/sequences/:externalId           — update sequence metadata
 *   DELETE /api/v1/platform/sequences/:externalId           — delete sequence and its rows
 *   POST   /api/v1/platform/sequences/:externalId/rows      — insert rows
 *   GET    /api/v1/platform/sequences/:externalId/rows      — query rows
 */

import type { Express, Request } from 'express';
import { z } from 'zod';

import type { DataPlanePermission, IdentityProvider } from './auth.js';
import { ForbiddenError } from './database.js';
import type { PlatformContext } from './platform-schemas.js';
import { platformContextSchema, platformIdSchema } from './platform-schemas.js';
import { PlatformCatalog, type PlatformProjectRole } from './platform.js';
import { workspaceUserIdSchema } from './schemas.js';
import {
  createSequenceSchema,
  updateSequenceSchema,
  sequenceListQuerySchema,
  sequenceRowsInsertSchema,
  sequenceRowsQuerySchema,
} from './schemas.js';

function parse<TSchema extends z.ZodTypeAny>(schema: TSchema, value: unknown): z.output<TSchema> {
  return schema.parse(value) as z.output<TSchema>;
}

async function requirePermission(identityProvider: IdentityProvider, request: Request, permission: DataPlanePermission) {
  const identity = await identityProvider.authenticate(request);
  const userId = parse(workspaceUserIdSchema, identity.userId);
  if (!identity.permissions.has(permission)) throw new ForbiddenError(`Permission '${permission}' is required`);
  return { ...identity, userId };
}

function requestContext(request: Request): PlatformContext {
  return parse(platformContextSchema, {
    tenantId: request.header('x-odf-tenant-id'),
    projectId: request.header('x-odf-project-id'),
  });
}

async function requireProjectAccess(
  catalog: PlatformCatalog,
  identityProvider: IdentityProvider,
  request: Request,
  permission: DataPlanePermission,
  roles?: readonly PlatformProjectRole[],
) {
  const identity = await requirePermission(identityProvider, request, permission);
  const context = requestContext(request);
  const role = catalog.assertProjectAccess(context, identity.userId, roles);
  return { identity, context, role };
}

const writeRoles: readonly PlatformProjectRole[] = ['owner', 'editor'];

/* ── In-memory sequence store (production: replace with Postgres repository) ── */

interface SequenceColumnRecord {
  externalId: string;
  name: string;
  description?: string;
  valueType: 'STRING' | 'DOUBLE' | 'LONG';
}

interface SequenceRecord {
  id: string;
  tenantId: string;
  projectId: string;
  externalId: string;
  name: string;
  description: string | null;
  assetExternalId: string | null;
  dataSetExternalId: string | null;
  columns: SequenceColumnRecord[];
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

interface SequenceRowRecord {
  rowNumber: number;
  values: Record<string, string | number | null>; // columnExternalId -> value
}

const sequences = new Map<string, SequenceRecord>();
const sequenceRows = new Map<string, Map<number, SequenceRowRecord>>(); // seqKey -> (rowNumber -> row)
let sequenceIdCounter = 0;

function seqKey(tenantId: string, projectId: string, externalId: string) {
  return `${tenantId}:${projectId}:${externalId}`;
}

/** @internal Test-only: reset in-memory sequence store between test runs. */
export function _resetSequenceStore(): void {
  sequences.clear();
  sequenceRows.clear();
  sequenceIdCounter = 0;
}

export function registerSequenceRoutes(
  app: Express,
  catalog: PlatformCatalog,
  identityProvider: IdentityProvider,
): void {
  // List sequences
  app.get('/api/v1/platform/sequences', async (request, response) => {
    const { context } = await requireProjectAccess(catalog, identityProvider, request, 'data:read');
    const query = parse(sequenceListQuerySchema, request.query);

    let items = [...sequences.values()].filter(
      (s) => s.tenantId === context.tenantId && s.projectId === context.projectId,
    );
    if (query.assetExternalId) items = items.filter((s) => s.assetExternalId === query.assetExternalId);
    if (query.dataSetExternalId) items = items.filter((s) => s.dataSetExternalId === query.dataSetExternalId);
    items = items.slice(0, query.limit);

    response.json({ items, nextCursor: null });
  });

  // Create sequence
  app.post('/api/v1/platform/sequences', async (request, response) => {
    const { identity, context } = await requireProjectAccess(catalog, identityProvider, request, 'data:ingest', writeRoles);
    const input = parse(createSequenceSchema, request.body);

    const key = seqKey(context.tenantId, context.projectId, input.externalId);
    if (sequences.has(key)) {
      response.status(409).json({ error: `Sequence '${input.externalId}' already exists` });
      return;
    }

    const now = new Date().toISOString();
    const record: SequenceRecord = {
      id: String(++sequenceIdCounter),
      tenantId: context.tenantId,
      projectId: context.projectId,
      externalId: input.externalId,
      name: input.name,
      description: input.description ?? null,
      assetExternalId: input.assetExternalId ?? null,
      dataSetExternalId: input.dataSetExternalId ?? null,
      columns: input.columns,
      createdBy: identity.userId,
      createdAt: now,
      updatedAt: now,
    };
    sequences.set(key, record);
    sequenceRows.set(key, new Map());

    response.status(201).json(record);
  });

  // Get single sequence
  app.get('/api/v1/platform/sequences/:externalId', async (request, response) => {
    const { context } = await requireProjectAccess(catalog, identityProvider, request, 'data:read');
    const extId = parse(platformIdSchema, request.params.externalId);

    const key = seqKey(context.tenantId, context.projectId, extId);
    const record = sequences.get(key);
    if (!record) {
      response.status(404).json({ error: `Sequence '${extId}' not found` });
      return;
    }

    response.json(record);
  });

  // Update sequence metadata
  app.patch('/api/v1/platform/sequences/:externalId', async (request, response) => {
    const { context } = await requireProjectAccess(catalog, identityProvider, request, 'data:ingest', writeRoles);
    const extId = parse(platformIdSchema, request.params.externalId);
    const input = parse(updateSequenceSchema, request.body);

    const key = seqKey(context.tenantId, context.projectId, extId);
    const existing = sequences.get(key);
    if (!existing) {
      response.status(404).json({ error: `Sequence '${extId}' not found` });
      return;
    }

    if (input.name !== undefined) existing.name = input.name;
    if (input.description !== undefined) existing.description = input.description;
    if (input.assetExternalId !== undefined) existing.assetExternalId = input.assetExternalId;
    if (input.dataSetExternalId !== undefined) existing.dataSetExternalId = input.dataSetExternalId;
    existing.updatedAt = new Date().toISOString();

    response.json(existing);
  });

  // Delete sequence and rows
  app.delete('/api/v1/platform/sequences/:externalId', async (request, response) => {
    const { context } = await requireProjectAccess(catalog, identityProvider, request, 'data:ingest', writeRoles);
    const extId = parse(platformIdSchema, request.params.externalId);

    const key = seqKey(context.tenantId, context.projectId, extId);
    if (!sequences.delete(key)) {
      response.status(404).json({ error: `Sequence '${extId}' not found` });
      return;
    }
    sequenceRows.delete(key);

    response.status(204).end();
  });

  // Insert rows
  app.post('/api/v1/platform/sequences/:externalId/rows', async (request, response) => {
    const { context } = await requireProjectAccess(catalog, identityProvider, request, 'data:ingest', writeRoles);
    const extId = parse(platformIdSchema, request.params.externalId);
    const input = parse(sequenceRowsInsertSchema, request.body);

    const key = seqKey(context.tenantId, context.projectId, extId);
    const seq = sequences.get(key);
    if (!seq) {
      response.status(404).json({ error: `Sequence '${extId}' not found` });
      return;
    }

    // Validate that all specified columns exist in sequence definition
    const validColExtIds = new Set(seq.columns.map((c) => c.externalId));
    for (const colExtId of input.columns) {
      if (!validColExtIds.has(colExtId)) {
        response.status(400).json({ error: `Column '${colExtId}' does not exist in sequence '${extId}'` });
        return;
      }
    }

    let rowsMap = sequenceRows.get(key);
    if (!rowsMap) {
      rowsMap = new Map();
      sequenceRows.set(key, rowsMap);
    }

    for (const row of input.rows) {
      const existingRow = rowsMap.get(row.rowNumber) ?? { rowNumber: row.rowNumber, values: {} };
      input.columns.forEach((colExtId, idx) => {
        existingRow.values[colExtId] = row.values[idx] ?? null;
      });
      rowsMap.set(row.rowNumber, existingRow);
    }

    response.status(200).json({ insertedRows: input.rows.length });
  });

  // Query rows
  app.get('/api/v1/platform/sequences/:externalId/rows', async (request, response) => {
    const { context } = await requireProjectAccess(catalog, identityProvider, request, 'data:read');
    const extId = parse(platformIdSchema, request.params.externalId);
    const query = parse(sequenceRowsQuerySchema, request.query);

    const key = seqKey(context.tenantId, context.projectId, extId);
    const seq = sequences.get(key);
    if (!seq) {
      response.status(404).json({ error: `Sequence '${extId}' not found` });
      return;
    }

    const rowsMap = sequenceRows.get(key) ?? new Map<number, SequenceRowRecord>();
    const colFilter = query.columns ? new Set(query.columns) : null;
    const targetCols = seq.columns.filter((c) => !colFilter || colFilter.has(c.externalId));

    let sortedRowNumbers = [...rowsMap.keys()].sort((a, b) => a - b);
    if (query.start !== undefined) sortedRowNumbers = sortedRowNumbers.filter((n) => n >= query.start!);
    if (query.end !== undefined) sortedRowNumbers = sortedRowNumbers.filter((n) => n <= query.end!);
    sortedRowNumbers = sortedRowNumbers.slice(0, query.limit);

    const rows = sortedRowNumbers.map((rowNum) => {
      const rowRec = rowsMap.get(rowNum)!;
      return {
        rowNumber: rowNum,
        values: targetCols.map((c) => rowRec.values[c.externalId] ?? null),
      };
    });

    response.json({
      columns: targetCols.map((c) => c.externalId),
      rows,
      nextCursor: null,
    });
  });
}
