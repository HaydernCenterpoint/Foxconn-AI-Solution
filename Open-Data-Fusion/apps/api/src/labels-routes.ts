/**
 * Labels API routes — managed vocabulary for tagging and classifying resources.
 *
 * Endpoints:
 *   GET    /api/v1/platform/labels             — list label definitions
 *   POST   /api/v1/platform/labels             — create a label
 *   PATCH  /api/v1/platform/labels/:externalId — update a label
 *   DELETE /api/v1/platform/labels/:externalId — delete a label
 *   POST   /api/v1/platform/labels/attach      — attach a label to a resource
 *   POST   /api/v1/platform/labels/detach      — detach a label from a resource
 *   GET    /api/v1/platform/labels/attachments  — list label attachments
 */

import type { Express, Request } from 'express';
import { z } from 'zod';

import type { DataPlanePermission, IdentityProvider } from './auth.js';
import { ForbiddenError } from './database.js';
import type { PlatformContext } from './platform-schemas.js';
import { platformContextSchema, platformIdSchema } from './platform-schemas.js';
import type { PlatformProjectRole } from './platform.js';
import { PlatformCatalog } from './platform.js';
import { workspaceUserIdSchema } from './schemas.js';
import {
  attachLabelSchema,
  createLabelSchema,
  detachLabelSchema,
  labelAttachmentQuerySchema,
  labelListQuerySchema,
  updateLabelSchema,
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

/* ── In-memory label store (production: replace with Postgres repository) ── */

interface LabelRecord {
  id: string;
  tenantId: string;
  projectId: string;
  externalId: string;
  name: string;
  description: string | null;
  color: string | null;
  category: string | null;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

interface AttachmentRecord {
  id: string;
  tenantId: string;
  projectId: string;
  labelExternalId: string;
  resourceType: string;
  resourceExternalId: string;
  attachedBy: string;
  attachedAt: string;
}

const labels = new Map<string, LabelRecord>();
const attachments = new Map<string, AttachmentRecord>();

/** @internal Test-only: reset in-memory label stores between test runs. */
export function _resetLabelStores(): void {
  labels.clear();
  attachments.clear();
  labelIdCounter = 0;
  attachmentIdCounter = 0;
}

function labelKey(tenantId: string, projectId: string, externalId: string) {
  return `${tenantId}:${projectId}:${externalId}`;
}

function attachmentKey(tenantId: string, projectId: string, labelExt: string, resType: string, resExt: string) {
  return `${tenantId}:${projectId}:${labelExt}:${resType}:${resExt}`;
}

let labelIdCounter = 0;
let attachmentIdCounter = 0;

export function registerLabelRoutes(
  app: Express,
  catalog: PlatformCatalog,
  identityProvider: IdentityProvider,
): void {
  // List labels
  app.get('/api/v1/platform/labels', async (request, response) => {
    const { identity, context } = await requireProjectAccess(catalog, identityProvider, request, 'data:read');
    const query = parse(labelListQuerySchema, request.query);

    let items = [...labels.values()].filter(
      (l) => l.tenantId === context.tenantId && l.projectId === context.projectId,
    );
    if (query.category) items = items.filter((l) => l.category === query.category);
    items = items.slice(0, query.limit);

    response.json({ items, nextCursor: null });
  });

  // Create label
  app.post('/api/v1/platform/labels', async (request, response) => {
    const { identity, context } = await requireProjectAccess(catalog, identityProvider, request, 'data:ingest', writeRoles);
    const input = parse(createLabelSchema, request.body);

    const key = labelKey(context.tenantId, context.projectId, input.externalId);
    if (labels.has(key)) {
      response.status(409).json({ error: `Label '${input.externalId}' already exists` });
      return;
    }

    const now = new Date().toISOString();
    const record: LabelRecord = {
      id: String(++labelIdCounter),
      tenantId: context.tenantId,
      projectId: context.projectId,
      externalId: input.externalId,
      name: input.name,
      description: input.description ?? null,
      color: input.color ?? null,
      category: input.category ?? null,
      createdBy: identity.userId,
      createdAt: now,
      updatedAt: now,
    };
    labels.set(key, record);

    response.status(201).json(record);
  });

  // Update label
  app.patch('/api/v1/platform/labels/:externalId', async (request, response) => {
    const { identity, context } = await requireProjectAccess(catalog, identityProvider, request, 'data:ingest', writeRoles);
    const extId = parse(platformIdSchema, request.params.externalId);
    const input = parse(updateLabelSchema, request.body);

    const key = labelKey(context.tenantId, context.projectId, extId);
    const existing = labels.get(key);
    if (!existing) {
      response.status(404).json({ error: `Label '${extId}' not found` });
      return;
    }

    if (input.name !== undefined) existing.name = input.name;
    if (input.description !== undefined) existing.description = input.description;
    if (input.color !== undefined) existing.color = input.color;
    if (input.category !== undefined) existing.category = input.category;
    existing.updatedAt = new Date().toISOString();

    response.json(existing);
  });

  // Delete label
  app.delete('/api/v1/platform/labels/:externalId', async (request, response) => {
    const { context } = await requireProjectAccess(catalog, identityProvider, request, 'data:ingest', writeRoles);
    const extId = parse(platformIdSchema, request.params.externalId);

    const key = labelKey(context.tenantId, context.projectId, extId);
    if (!labels.delete(key)) {
      response.status(404).json({ error: `Label '${extId}' not found` });
      return;
    }

    // Remove all attachments for this label
    for (const [aKey, att] of attachments) {
      if (att.tenantId === context.tenantId && att.projectId === context.projectId && att.labelExternalId === extId) {
        attachments.delete(aKey);
      }
    }

    response.status(204).end();
  });

  // Attach label to resource
  app.post('/api/v1/platform/labels/attach', async (request, response) => {
    const { identity, context } = await requireProjectAccess(catalog, identityProvider, request, 'data:ingest', writeRoles);
    const input = parse(attachLabelSchema, request.body);

    // Verify label exists
    const lKey = labelKey(context.tenantId, context.projectId, input.labelExternalId);
    if (!labels.has(lKey)) {
      response.status(404).json({ error: `Label '${input.labelExternalId}' not found` });
      return;
    }

    const aKey = attachmentKey(context.tenantId, context.projectId, input.labelExternalId, input.resourceType, input.resourceExternalId);
    if (attachments.has(aKey)) {
      response.status(200).json(attachments.get(aKey)); // Idempotent
      return;
    }

    const now = new Date().toISOString();
    const record: AttachmentRecord = {
      id: String(++attachmentIdCounter),
      tenantId: context.tenantId,
      projectId: context.projectId,
      labelExternalId: input.labelExternalId,
      resourceType: input.resourceType,
      resourceExternalId: input.resourceExternalId,
      attachedBy: identity.userId,
      attachedAt: now,
    };
    attachments.set(aKey, record);

    response.status(201).json(record);
  });

  // Detach label from resource
  app.post('/api/v1/platform/labels/detach', async (request, response) => {
    const { context } = await requireProjectAccess(catalog, identityProvider, request, 'data:ingest', writeRoles);
    const input = parse(detachLabelSchema, request.body);

    const aKey = attachmentKey(context.tenantId, context.projectId, input.labelExternalId, input.resourceType, input.resourceExternalId);
    if (!attachments.delete(aKey)) {
      response.status(404).json({ error: 'Label attachment not found' });
      return;
    }

    response.status(204).end();
  });

  // List label attachments
  app.get('/api/v1/platform/labels/attachments', async (request, response) => {
    const { context } = await requireProjectAccess(catalog, identityProvider, request, 'data:read');
    const query = parse(labelAttachmentQuerySchema, request.query);

    let items = [...attachments.values()].filter(
      (a) => a.tenantId === context.tenantId && a.projectId === context.projectId,
    );
    if (query.labelExternalId) items = items.filter((a) => a.labelExternalId === query.labelExternalId);
    if (query.resourceType) items = items.filter((a) => a.resourceType === query.resourceType);
    if (query.resourceExternalId) items = items.filter((a) => a.resourceExternalId === query.resourceExternalId);
    items = items.slice(0, query.limit);

    response.json({ items, nextCursor: null });
  });
}
