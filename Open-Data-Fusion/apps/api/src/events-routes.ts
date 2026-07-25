/**
 * Events API routes — discrete occurrences tied to assets and time ranges.
 *
 * Endpoints:
 *   GET    /api/v1/platform/events             — list events
 *   POST   /api/v1/platform/events             — create an event
 *   GET    /api/v1/platform/events/:externalId  — get a single event
 *   PATCH  /api/v1/platform/events/:externalId  — update an event
 *   DELETE /api/v1/platform/events/:externalId  — delete an event
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
  createEventSchema,
  updateEventSchema,
  eventListQuerySchema,
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

/* ── In-memory event store (production: replace with Postgres repository) ── */

interface EventRecord {
  id: string;
  tenantId: string;
  projectId: string;
  externalId: string;
  type: string;
  subtype: string | null;
  description: string | null;
  startTime: string | null;
  endTime: string | null;
  assetExternalIds: string[];
  dataSetExternalId: string | null;
  source: string | null;
  metadata: Record<string, unknown>;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

const events = new Map<string, EventRecord>();
let eventIdCounter = 0;

function eventKey(tenantId: string, projectId: string, externalId: string) {
  return `${tenantId}:${projectId}:${externalId}`;
}

/** @internal Test-only: reset in-memory event store between test runs. */
export function _resetEventStore(): void {
  events.clear();
  eventIdCounter = 0;
}

export function registerEventRoutes(
  app: Express,
  catalog: PlatformCatalog,
  identityProvider: IdentityProvider,
): void {
  // List events
  app.get('/api/v1/platform/events', async (request, response) => {
    const { context } = await requireProjectAccess(catalog, identityProvider, request, 'data:read');
    const query = parse(eventListQuerySchema, request.query);

    let items = [...events.values()].filter(
      (e) => e.tenantId === context.tenantId && e.projectId === context.projectId,
    );
    if (query.type) items = items.filter((e) => e.type === query.type);
    if (query.subtype) items = items.filter((e) => e.subtype === query.subtype);
    if (query.assetExternalId) items = items.filter((e) => e.assetExternalIds.includes(query.assetExternalId!));
    if (query.dataSetExternalId) items = items.filter((e) => e.dataSetExternalId === query.dataSetExternalId);
    if (query.source) items = items.filter((e) => e.source === query.source);
    if (query.startTimeMin) items = items.filter((e) => e.startTime !== null && e.startTime >= query.startTimeMin!);
    if (query.startTimeMax) items = items.filter((e) => e.startTime !== null && e.startTime <= query.startTimeMax!);
    items = items.slice(0, query.limit);

    response.json({ items, nextCursor: null });
  });

  // Create event
  app.post('/api/v1/platform/events', async (request, response) => {
    const { identity, context } = await requireProjectAccess(catalog, identityProvider, request, 'data:ingest', writeRoles);
    const input = parse(createEventSchema, request.body);

    const key = eventKey(context.tenantId, context.projectId, input.externalId);
    if (events.has(key)) {
      response.status(409).json({ error: `Event '${input.externalId}' already exists` });
      return;
    }

    const now = new Date().toISOString();
    const record: EventRecord = {
      id: String(++eventIdCounter),
      tenantId: context.tenantId,
      projectId: context.projectId,
      externalId: input.externalId,
      type: input.type,
      subtype: input.subtype ?? null,
      description: input.description ?? null,
      startTime: input.startTime ?? null,
      endTime: input.endTime ?? null,
      assetExternalIds: input.assetExternalIds,
      dataSetExternalId: input.dataSetExternalId ?? null,
      source: input.source ?? null,
      metadata: input.metadata,
      createdBy: identity.userId,
      createdAt: now,
      updatedAt: now,
    };
    events.set(key, record);

    response.status(201).json(record);
  });

  // Get single event
  app.get('/api/v1/platform/events/:externalId', async (request, response) => {
    const { context } = await requireProjectAccess(catalog, identityProvider, request, 'data:read');
    const extId = parse(platformIdSchema, request.params.externalId);

    const key = eventKey(context.tenantId, context.projectId, extId);
    const record = events.get(key);
    if (!record) {
      response.status(404).json({ error: `Event '${extId}' not found` });
      return;
    }

    response.json(record);
  });

  // Update event
  app.patch('/api/v1/platform/events/:externalId', async (request, response) => {
    const { context } = await requireProjectAccess(catalog, identityProvider, request, 'data:ingest', writeRoles);
    const extId = parse(platformIdSchema, request.params.externalId);
    const input = parse(updateEventSchema, request.body);

    const key = eventKey(context.tenantId, context.projectId, extId);
    const existing = events.get(key);
    if (!existing) {
      response.status(404).json({ error: `Event '${extId}' not found` });
      return;
    }

    if (input.description !== undefined) existing.description = input.description;
    if (input.startTime !== undefined) existing.startTime = input.startTime;
    if (input.endTime !== undefined) existing.endTime = input.endTime;
    if (input.assetExternalIds !== undefined) existing.assetExternalIds = input.assetExternalIds;
    if (input.subtype !== undefined) existing.subtype = input.subtype;
    if (input.source !== undefined) existing.source = input.source;
    if (input.metadata !== undefined) existing.metadata = input.metadata;
    existing.updatedAt = new Date().toISOString();

    response.json(existing);
  });

  // Delete event
  app.delete('/api/v1/platform/events/:externalId', async (request, response) => {
    const { context } = await requireProjectAccess(catalog, identityProvider, request, 'data:ingest', writeRoles);
    const extId = parse(platformIdSchema, request.params.externalId);

    const key = eventKey(context.tenantId, context.projectId, extId);
    if (!events.delete(key)) {
      response.status(404).json({ error: `Event '${extId}' not found` });
      return;
    }

    response.status(204).end();
  });
}
