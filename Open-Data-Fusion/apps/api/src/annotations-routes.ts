/**
 * Annotations API routes — link resources to specific regions in files/diagrams.
 *
 * Endpoints:
 *   GET    /api/v1/platform/annotations             — list annotations
 *   POST   /api/v1/platform/annotations             — create an annotation
 *   GET    /api/v1/platform/annotations/:id         — get a single annotation
 *   PATCH  /api/v1/platform/annotations/:id         — update annotation status/data
 *   DELETE /api/v1/platform/annotations/:id         — delete an annotation
 *   POST   /api/v1/platform/annotations/suggest     — bulk suggest annotations
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
  createAnnotationSchema,
  updateAnnotationSchema,
  annotationListQuerySchema,
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

/* ── In-memory annotation store (production: replace with Postgres repository) ── */

interface AnnotationRecord {
  id: string;
  tenantId: string;
  projectId: string;
  annotationType: string;
  status: string;
  annotatedResourceType: string;
  annotatedResourceExternalId: string;
  data: {
    label: string;
    confidence?: number;
    boundingBox?: { xMin: number; yMin: number; xMax: number; yMax: number; page?: number };
    linkedResourceType?: string;
    linkedResourceExternalId?: string;
  };
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

const annotations = new Map<string, AnnotationRecord>();
let annotationIdCounter = 0;

function annotationKey(tenantId: string, projectId: string, id: string) {
  return `${tenantId}:${projectId}:${id}`;
}

/** @internal Test-only: reset in-memory annotation store between test runs. */
export function _resetAnnotationStore(): void {
  annotations.clear();
  annotationIdCounter = 0;
}

export function registerAnnotationRoutes(
  app: Express,
  catalog: PlatformCatalog,
  identityProvider: IdentityProvider,
): void {
  // List annotations
  app.get('/api/v1/platform/annotations', async (request, response) => {
    const { context } = await requireProjectAccess(catalog, identityProvider, request, 'data:read');
    const query = parse(annotationListQuerySchema, request.query);

    let items = [...annotations.values()].filter(
      (a) => a.tenantId === context.tenantId && a.projectId === context.projectId,
    );
    if (query.annotatedResourceType) items = items.filter((a) => a.annotatedResourceType === query.annotatedResourceType);
    if (query.annotatedResourceExternalId) items = items.filter((a) => a.annotatedResourceExternalId === query.annotatedResourceExternalId);
    if (query.annotationType) items = items.filter((a) => a.annotationType === query.annotationType);
    if (query.status) items = items.filter((a) => a.status === query.status);
    items = items.slice(0, query.limit);

    response.json({ items, nextCursor: null });
  });

  // Create single annotation
  app.post('/api/v1/platform/annotations', async (request, response) => {
    const { identity, context } = await requireProjectAccess(catalog, identityProvider, request, 'data:ingest', writeRoles);
    const input = parse(createAnnotationSchema, request.body);

    const now = new Date().toISOString();
    const id = String(++annotationIdCounter);
    const key = annotationKey(context.tenantId, context.projectId, id);

    const record: AnnotationRecord = {
      id,
      tenantId: context.tenantId,
      projectId: context.projectId,
      annotationType: input.annotationType,
      status: input.status,
      annotatedResourceType: input.annotatedResourceType,
      annotatedResourceExternalId: input.annotatedResourceExternalId,
      data: input.data,
      createdBy: identity.userId,
      createdAt: now,
      updatedAt: now,
    };
    annotations.set(key, record);

    response.status(201).json(record);
  });

  // Bulk suggest annotations
  app.post('/api/v1/platform/annotations/suggest', async (request, response) => {
    const { identity, context } = await requireProjectAccess(catalog, identityProvider, request, 'data:ingest', writeRoles);
    const itemsInput = parse(z.array(createAnnotationSchema).min(1).max(500), request.body);

    const now = new Date().toISOString();
    const createdItems: AnnotationRecord[] = [];

    for (const input of itemsInput) {
      const id = String(++annotationIdCounter);
      const key = annotationKey(context.tenantId, context.projectId, id);

      const record: AnnotationRecord = {
        id,
        tenantId: context.tenantId,
        projectId: context.projectId,
        annotationType: input.annotationType,
        status: 'suggested',
        annotatedResourceType: input.annotatedResourceType,
        annotatedResourceExternalId: input.annotatedResourceExternalId,
        data: input.data,
        createdBy: identity.userId,
        createdAt: now,
        updatedAt: now,
      };
      annotations.set(key, record);
      createdItems.push(record);
    }

    response.status(201).json({ items: createdItems });
  });

  // Get single annotation by id
  app.get('/api/v1/platform/annotations/:id', async (request, response) => {
    const { context } = await requireProjectAccess(catalog, identityProvider, request, 'data:read');
    const id = parse(platformIdSchema, request.params.id);

    const key = annotationKey(context.tenantId, context.projectId, id);
    const record = annotations.get(key);
    if (!record) {
      response.status(404).json({ error: `Annotation '${id}' not found` });
      return;
    }

    response.json(record);
  });

  // Update annotation status or data
  app.patch('/api/v1/platform/annotations/:id', async (request, response) => {
    const { context } = await requireProjectAccess(catalog, identityProvider, request, 'data:ingest', writeRoles);
    const id = parse(platformIdSchema, request.params.id);
    const input = parse(updateAnnotationSchema, request.body);

    const key = annotationKey(context.tenantId, context.projectId, id);
    const existing = annotations.get(key);
    if (!existing) {
      response.status(404).json({ error: `Annotation '${id}' not found` });
      return;
    }

    if (input.status !== undefined) existing.status = input.status;
    if (input.data !== undefined) {
      existing.data = { ...existing.data, ...input.data };
    }
    existing.updatedAt = new Date().toISOString();

    response.json(existing);
  });

  // Delete annotation
  app.delete('/api/v1/platform/annotations/:id', async (request, response) => {
    const { context } = await requireProjectAccess(catalog, identityProvider, request, 'data:ingest', writeRoles);
    const id = parse(platformIdSchema, request.params.id);

    const key = annotationKey(context.tenantId, context.projectId, id);
    if (!annotations.delete(key)) {
      response.status(404).json({ error: `Annotation '${id}' not found` });
      return;
    }

    response.status(204).end();
  });
}
