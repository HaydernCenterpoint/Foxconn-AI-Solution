/**
 * Relationships API routes — typed edges between resources (CDF parity).
 *
 * Endpoints:
 *   GET    /api/v1/platform/relationships             — list relationships
 *   POST   /api/v1/platform/relationships             — create a relationship
 *   PATCH  /api/v1/platform/relationships/:externalId — update a relationship
 *   DELETE /api/v1/platform/relationships/:externalId — delete a relationship
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
  createRelationshipSchema,
  updateRelationshipSchema,
  relationshipListQuerySchema,
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

/* ── In-memory relationship store (production: replace with Postgres repository) ── */

interface RelationshipRecord {
  id: string;
  tenantId: string;
  projectId: string;
  externalId: string;
  sourceType: string;
  sourceExternalId: string;
  targetType: string;
  targetExternalId: string;
  relationshipType: string;
  dataSetExternalId: string | null;
  confidence: number | null;
  startTime: string | null;
  endTime: string | null;
  labels: string[];
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

const relationships = new Map<string, RelationshipRecord>();
let relIdCounter = 0;

/** @internal Test-only: reset in-memory relationship store between test runs. */
export function _resetRelationshipStore(): void {
  relationships.clear();
  relIdCounter = 0;
}

function relKey(tenantId: string, projectId: string, externalId: string) {
  return `${tenantId}:${projectId}:${externalId}`;
}

export function registerRelationshipRoutes(
  app: Express,
  catalog: PlatformCatalog,
  identityProvider: IdentityProvider,
): void {
  // List relationships
  app.get('/api/v1/platform/relationships', async (request, response) => {
    const { context } = await requireProjectAccess(catalog, identityProvider, request, 'data:read');
    const query = parse(relationshipListQuerySchema, request.query);

    let items = [...relationships.values()].filter(
      (r) => r.tenantId === context.tenantId && r.projectId === context.projectId,
    );
    if (query.sourceType) items = items.filter((r) => r.sourceType === query.sourceType);
    if (query.targetType) items = items.filter((r) => r.targetType === query.targetType);
    if (query.relationshipType) items = items.filter((r) => r.relationshipType === query.relationshipType);
    if (query.dataSetExternalId) items = items.filter((r) => r.dataSetExternalId === query.dataSetExternalId);
    items = items.slice(0, query.limit);

    response.json({ items, nextCursor: null });
  });

  // Create relationship
  app.post('/api/v1/platform/relationships', async (request, response) => {
    const { identity, context } = await requireProjectAccess(catalog, identityProvider, request, 'data:ingest', writeRoles);
    const input = parse(createRelationshipSchema, request.body);

    const key = relKey(context.tenantId, context.projectId, input.externalId);
    if (relationships.has(key)) {
      response.status(409).json({ error: `Relationship '${input.externalId}' already exists` });
      return;
    }

    const now = new Date().toISOString();
    const record: RelationshipRecord = {
      id: String(++relIdCounter),
      tenantId: context.tenantId,
      projectId: context.projectId,
      externalId: input.externalId,
      sourceType: input.sourceType,
      sourceExternalId: input.sourceExternalId,
      targetType: input.targetType,
      targetExternalId: input.targetExternalId,
      relationshipType: input.relationshipType,
      dataSetExternalId: input.dataSetExternalId ?? null,
      confidence: input.confidence ?? null,
      startTime: input.startTime ?? null,
      endTime: input.endTime ?? null,
      labels: input.labels ?? [],
      createdBy: identity.userId,
      createdAt: now,
      updatedAt: now,
    };
    relationships.set(key, record);

    response.status(201).json(record);
  });

  // Update relationship
  app.patch('/api/v1/platform/relationships/:externalId', async (request, response) => {
    const { context } = await requireProjectAccess(catalog, identityProvider, request, 'data:ingest', writeRoles);
    const extId = parse(platformIdSchema, request.params.externalId);
    const input = parse(updateRelationshipSchema, request.body);

    const key = relKey(context.tenantId, context.projectId, extId);
    const existing = relationships.get(key);
    if (!existing) {
      response.status(404).json({ error: `Relationship '${extId}' not found` });
      return;
    }

    if (input.confidence !== undefined) existing.confidence = input.confidence;
    if (input.dataSetExternalId !== undefined) existing.dataSetExternalId = input.dataSetExternalId;
    if (input.startTime !== undefined) existing.startTime = input.startTime;
    if (input.endTime !== undefined) existing.endTime = input.endTime;
    if (input.labels !== undefined) existing.labels = input.labels;
    existing.updatedAt = new Date().toISOString();

    response.json(existing);
  });

  // Delete relationship
  app.delete('/api/v1/platform/relationships/:externalId', async (request, response) => {
    const { context } = await requireProjectAccess(catalog, identityProvider, request, 'data:ingest', writeRoles);
    const extId = parse(platformIdSchema, request.params.externalId);

    const key = relKey(context.tenantId, context.projectId, extId);
    if (!relationships.delete(key)) {
      response.status(404).json({ error: `Relationship '${extId}' not found` });
      return;
    }

    response.status(204).end();
  });
}
