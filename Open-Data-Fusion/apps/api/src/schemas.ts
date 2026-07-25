import { z } from 'zod';

const externalId = z
  .string()
  .trim()
  .min(1)
  .max(255)
  .regex(/^[A-Za-z0-9][A-Za-z0-9._:/-]*$/, 'Use letters, numbers, dots, colons, slashes, underscores, or dashes');

const metadata = z.record(z.unknown()).default({});

const timestamp = z.union([z.number().finite(), z.string().trim().min(1)]).transform((value, context) => {
  const parsed = typeof value === 'number' ? value : Date.parse(value);
  if (!Number.isSafeInteger(parsed) || Math.abs(parsed) > 8_640_000_000_000_000) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: 'Expected an ISO-8601 date or integer epoch milliseconds in the JavaScript Date range' });
    return z.NEVER;
  }
  return parsed;
});

export const assetListQuerySchema = z.object({
  q: z.string().trim().max(200).optional(),
  type: z.string().trim().min(1).max(100).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

export const telemetryQuerySchema = z
  .object({
    from: timestamp.optional(),
    to: timestamp.optional(),
    timeSeriesExternalId: externalId.optional(),
    limit: z.coerce.number().int().min(1).max(5_000).default(1_000),
  })
  .refine(({ from, to }) => from === undefined || to === undefined || from <= to, {
    message: '`from` must be before or equal to `to`',
  });

export const telemetryLatestQuerySchema = z.object({
  timeSeriesExternalId: externalId.optional(),
  at: timestamp.optional(),
});

export const telemetryAggregateQuerySchema = z
  .object({
    from: timestamp.optional(),
    to: timestamp.optional(),
    timeSeriesExternalId: externalId.optional(),
    bucketMs: z.coerce.number().int().min(1_000).max(30 * 24 * 60 * 60 * 1_000),
    aggregation: z.enum(['avg', 'min', 'max', 'sum', 'count']).default('avg'),
    limit: z.coerce.number().int().min(1).max(5_000).default(1_000),
  })
  .refine(({ from, to }) => from === undefined || to === undefined || from <= to, {
    message: '`from` must be before or equal to `to`',
  });

export const auditListQuerySchema = z.object({
  action: z.string().trim().min(1).max(100).optional(),
  entityType: z.string().trim().min(1).max(100).optional(),
  entityId: z.string().trim().min(1).max(255).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

export const workspaceIdSchema = externalId;

export const canvasPositionSchema = z.object({
  x: z.number().finite(),
  y: z.number().finite(),
});

export const canvasNodeSchema = z.object({
  id: externalId,
  type: z.string().trim().min(1).max(100),
  position: canvasPositionSchema,
  data: z.record(z.unknown()).default({}),
});

export const canvasEdgeSchema = z.object({
  id: externalId,
  source: externalId,
  target: externalId,
  type: z.string().trim().min(1).max(100).default('relation'),
  data: z.record(z.unknown()).default({}),
});

export const workspaceSnapshotSchema = z.object({
  viewport: z.object({
    x: z.number().finite().default(0),
    y: z.number().finite().default(0),
    zoom: z.number().finite().min(0.1).max(4).default(1),
  }).default({ x: 0, y: 0, zoom: 1 }),
  nodes: z.array(canvasNodeSchema).max(10_000),
  edges: z.array(canvasEdgeSchema).max(20_000),
});

const workspaceActorSchema = z.string().trim().min(1).max(255);

export const workspaceUpdateSchema = z.object({
  expectedVersion: z.number().int().min(1),
  actor: workspaceActorSchema,
  changeSummary: z.string().trim().min(1).max(1_000),
  snapshot: workspaceSnapshotSchema,
});

export const workspaceRollbackSchema = z.object({
  expectedVersion: z.number().int().min(1),
  targetVersion: z.number().int().min(1),
  actor: workspaceActorSchema,
  changeSummary: z.string().trim().max(1_000).optional(),
});

export const workspaceRevisionQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

export const workspaceUserIdSchema = z
  .string()
  .trim()
  .min(1)
  .max(255)
  .regex(/^[^\s\u0000-\u001F\u007F]+$/, 'User ID must not contain whitespace or control characters');

export const workspaceRoleSchema = z.enum(['owner', 'editor', 'reviewer', 'viewer']);

export const workspaceMemberUpsertSchema = z
  .object({
    displayName: z
      .string()
      .trim()
      .min(1)
      .max(255)
      .refine((value) => !/[\u0000-\u001F\u007F]/u.test(value), {
        message: 'Display name must not contain control characters',
      }),
    role: workspaceRoleSchema,
  })
  .strict();

const workspaceNodePatchSchema = z
  .object({
    type: z.string().trim().min(1).max(100).optional(),
    position: canvasPositionSchema.optional(),
    data: z.record(z.unknown()).optional(),
  })
  .strict()
  .refine((patch) => Object.values(patch).some((value) => value !== undefined), {
    message: 'Node patch must contain at least one field',
  });

const workspaceEdgePatchSchema = z
  .object({
    type: z.string().trim().min(1).max(100).optional(),
    data: z.record(z.unknown()).optional(),
  })
  .strict()
  .refine((patch) => Object.values(patch).some((value) => value !== undefined), {
    message: 'Edge patch must contain at least one field',
  });

export const workspaceOperationSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('moveNode'),
    nodeId: externalId,
    position: canvasPositionSchema,
  }),
  z.object({
    type: z.literal('addNode'),
    node: canvasNodeSchema,
  }),
  z.object({
    type: z.literal('removeNode'),
    nodeId: externalId,
  }),
  z.object({
    type: z.literal('updateNode'),
    nodeId: externalId,
    patch: workspaceNodePatchSchema,
  }),
  z.object({
    type: z.literal('addEdge'),
    edge: canvasEdgeSchema,
  }),
  z.object({
    type: z.literal('removeEdge'),
    edgeId: externalId,
  }),
  z.object({
    type: z.literal('updateEdge'),
    edgeId: externalId,
    patch: workspaceEdgePatchSchema,
  }),
]);

export const workspaceOperationsSchema = z.object({
  baseVersion: z.number().int().min(1),
  changeSummary: z.string().trim().min(1).max(1_000),
  operations: z.array(workspaceOperationSchema).min(1).max(1_000),
});

const assetSchema = z.object({
  externalId,
  name: z.string().trim().min(1).max(255),
  type: z.string().trim().min(1).max(100),
  parentExternalId: externalId.nullable().optional(),
  description: z.string().trim().max(4_000).nullable().optional(),
  metadata: metadata.optional(),
});

const timeSeriesSchema = z.object({
  externalId,
  assetExternalId: externalId,
  name: z.string().trim().min(1).max(255),
  unit: z.string().trim().max(50).nullable().optional(),
  description: z.string().trim().max(4_000).nullable().optional(),
  metadata: metadata.optional(),
});

const dataPointSchema = z.object({
  timeSeriesExternalId: externalId,
  timestamp,
  value: z.number().finite(),
  quality: z.enum(['good', 'uncertain', 'bad']).default('good'),
});

const documentSchema = z.object({
  externalId,
  assetExternalId: externalId.nullable().optional(),
  title: z.string().trim().min(1).max(500),
  mimeType: z.string().trim().min(1).max(100).nullable().optional(),
  uri: z.string().trim().max(2_000).nullable().optional(),
  metadata: metadata.optional(),
});

export const entityTypeSchema = z.enum(['asset', 'timeSeries', 'document']);

const relationSchema = z.object({
  id: externalId.optional(),
  sourceType: entityTypeSchema,
  sourceExternalId: externalId,
  targetType: entityTypeSchema,
  targetExternalId: externalId,
  relationType: z.string().trim().min(1).max(100),
  status: z.enum(['proposed', 'accepted']).default('proposed'),
  // Null/omitted input means "no score supplied" and is persisted as the
  // cross-backend default 0; relation responses therefore always expose 0..1.
  confidence: z.number().min(0).max(1).nullable().optional(),
  evidence: z.record(z.unknown()).default({}),
  ruleVersion: z.string().trim().max(100).nullable().optional(),
});

export const ingestBundleSchema = z
  .object({
    source: z.object({
      system: z.string().trim().min(1).max(100),
      runId: externalId.optional(),
      actor: z.string().trim().min(1).max(255).default('connector'),
    }),
    assets: z.array(assetSchema).max(10_000).default([]),
    timeSeries: z.array(timeSeriesSchema).max(10_000).default([]),
    dataPoints: z.array(dataPointSchema).max(100_000).default([]),
    documents: z.array(documentSchema).max(10_000).default([]),
    relations: z.array(relationSchema).max(20_000).default([]),
  })
  .superRefine((bundle, context) => {
    const recordCount =
      bundle.assets.length +
      bundle.timeSeries.length +
      bundle.dataPoints.length +
      bundle.documents.length +
      bundle.relations.length;
    if (recordCount === 0) {
      context.addIssue({ code: z.ZodIssueCode.custom, message: 'The bundle must contain at least one record' });
    }

    const entityTypes = new Map<string, { type: z.infer<typeof entityTypeSchema>; path: Array<string | number> }>();
    const definitions = new Set<string>();
    const register = (
      type: z.infer<typeof entityTypeSchema>,
      id: string | null | undefined,
      path: Array<string | number>,
      definition = false,
    ): void => {
      if (!id) return;
      const prior = entityTypes.get(id);
      if (prior && prior.type !== type) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path,
          message: `External ID '${id}' is already used as ${prior.type}; one model space uses a shared entity namespace`,
        });
      } else if (!prior) {
        entityTypes.set(id, { type, path });
      }
      if (definition) {
        const key = `${type}\u0000${id}`;
        if (definitions.has(key)) {
          context.addIssue({ code: z.ZodIssueCode.custom, path, message: `Duplicate ${type} definition '${id}'` });
        }
        definitions.add(key);
      }
    };

    bundle.assets.forEach((asset, index) => {
      register('asset', asset.externalId, ['assets', index, 'externalId'], true);
      register('asset', asset.parentExternalId, ['assets', index, 'parentExternalId']);
    });
    bundle.timeSeries.forEach((series, index) => {
      register('timeSeries', series.externalId, ['timeSeries', index, 'externalId'], true);
      register('asset', series.assetExternalId, ['timeSeries', index, 'assetExternalId']);
    });
    const pointKeys = new Set<string>();
    bundle.dataPoints.forEach((point, index) => {
      register('timeSeries', point.timeSeriesExternalId, ['dataPoints', index, 'timeSeriesExternalId']);
      const key = `${point.timeSeriesExternalId}\u0000${String(point.timestamp)}`;
      if (pointKeys.has(key)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['dataPoints', index, 'timestamp'],
          message: `Duplicate observation for '${point.timeSeriesExternalId}' at the same timestamp`,
        });
      }
      pointKeys.add(key);
    });
    bundle.documents.forEach((document, index) => {
      register('document', document.externalId, ['documents', index, 'externalId'], true);
      register('asset', document.assetExternalId, ['documents', index, 'assetExternalId']);
    });
    const relationKeys = new Set<string>();
    bundle.relations.forEach((relation, index) => {
      register(relation.sourceType, relation.sourceExternalId, ['relations', index, 'sourceExternalId']);
      register(relation.targetType, relation.targetExternalId, ['relations', index, 'targetExternalId']);
      if (relation.sourceType === relation.targetType && relation.sourceExternalId === relation.targetExternalId) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['relations', index],
          message: 'Relation source and target must be different entities',
        });
      }
      const key = JSON.stringify([
        relation.sourceType,
        relation.sourceExternalId,
        relation.targetType,
        relation.targetExternalId,
        relation.relationType,
      ]);
      if (relationKeys.has(key)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['relations', index],
          message: 'Duplicate semantic relation in one bundle',
        });
      }
      relationKeys.add(key);
    });
  });

export const relationReviewSchema = z.object({
  decision: z.enum(['accepted', 'rejected']),
  reviewer: z.string().trim().min(1).max(255).optional().default('authenticated-user'),
  comment: z.string().trim().max(2_000).nullable().optional(),
});

export const workspaceCreateSchema = z.object({
  id: workspaceIdSchema,
  name: z.string().trim().min(1).max(256)
    .refine((value) => !/\p{Cc}/u.test(value), 'Workspace name must not contain control characters'),
});

export type AssetListQuery = z.infer<typeof assetListQuerySchema>;
export type TelemetryQuery = z.infer<typeof telemetryQuerySchema>;
export type TelemetryLatestQuery = z.infer<typeof telemetryLatestQuerySchema>;
export type TelemetryAggregateQuery = z.infer<typeof telemetryAggregateQuerySchema>;
export type AuditListQuery = z.infer<typeof auditListQuerySchema>;
export type IngestBundle = z.infer<typeof ingestBundleSchema>;
export type RelationReview = z.infer<typeof relationReviewSchema>;
export type WorkspaceSnapshot = z.infer<typeof workspaceSnapshotSchema>;
export type WorkspaceCreate = z.infer<typeof workspaceCreateSchema>;
export type WorkspaceUpdate = z.infer<typeof workspaceUpdateSchema>;
export type WorkspaceRollback = z.infer<typeof workspaceRollbackSchema>;
export type WorkspaceRevisionQuery = z.infer<typeof workspaceRevisionQuerySchema>;
export type WorkspaceOperation = z.infer<typeof workspaceOperationSchema>;
export type WorkspaceOperations = z.infer<typeof workspaceOperationsSchema>;
export type WorkspaceMemberUpsert = z.infer<typeof workspaceMemberUpsertSchema>;

/* ── Labels ─────────────────────────────────────────────────────────── */

const labelableResourceType = z.enum([
  'asset', 'time_series', 'file', 'event', 'model', 'pipeline', 'data_set',
]);

export const createLabelSchema = z.object({
  externalId: externalId,
  name: z.string().trim().min(1).max(255),
  description: z.string().trim().max(1000).nullable().optional(),
  color: z.string().trim().regex(/^#[0-9a-fA-F]{6}$/, 'Hex color like #22c55e').nullable().optional(),
  category: z.string().trim().min(1).max(100).nullable().optional(),
});

export const updateLabelSchema = z.object({
  name: z.string().trim().min(1).max(255).optional(),
  description: z.string().trim().max(1000).nullable().optional(),
  color: z.string().trim().regex(/^#[0-9a-fA-F]{6}$/).nullable().optional(),
  category: z.string().trim().min(1).max(100).nullable().optional(),
});

export const attachLabelSchema = z.object({
  labelExternalId: externalId,
  resourceType: labelableResourceType,
  resourceExternalId: externalId,
});

export const detachLabelSchema = attachLabelSchema;

export const labelListQuerySchema = z.object({
  category: z.string().trim().min(1).max(100).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  cursor: z.string().trim().max(255).optional(),
});

export const labelAttachmentQuerySchema = z.object({
  labelExternalId: externalId.optional(),
  resourceType: labelableResourceType.optional(),
  resourceExternalId: externalId.optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  cursor: z.string().trim().max(255).optional(),
});

export type CreateLabel = z.infer<typeof createLabelSchema>;
export type UpdateLabel = z.infer<typeof updateLabelSchema>;
export type AttachLabel = z.infer<typeof attachLabelSchema>;
export type DetachLabel = z.infer<typeof detachLabelSchema>;
export type LabelListQuery = z.infer<typeof labelListQuerySchema>;
export type LabelAttachmentQuery = z.infer<typeof labelAttachmentQuerySchema>;

/* ── Relationships ──────────────────────────────────────────────────── */

const relationshipResourceType = z.enum([
  'asset', 'time_series', 'file', 'event', 'model', 'pipeline', 'data_set', 'sequence', 'relationship',
]);

export const createRelationshipSchema = z.object({
  externalId: externalId,
  sourceType: relationshipResourceType,
  sourceExternalId: externalId,
  targetType: relationshipResourceType,
  targetExternalId: externalId,
  relationshipType: z.string().trim().min(1).max(100),
  dataSetExternalId: externalId.nullable().optional(),
  confidence: z.number().min(0).max(1).default(1),
  startTime: z.string().trim().min(1).nullable().optional(),
  endTime: z.string().trim().min(1).nullable().optional(),
  labels: z.array(externalId).max(20).default([]),
});

export const updateRelationshipSchema = z.object({
  confidence: z.number().min(0).max(1).optional(),
  startTime: z.string().trim().min(1).nullable().optional(),
  endTime: z.string().trim().min(1).nullable().optional(),
  labels: z.array(externalId).max(20).optional(),
  dataSetExternalId: externalId.nullable().optional(),
});

export const relationshipListQuerySchema = z.object({
  sourceType: relationshipResourceType.optional(),
  sourceExternalId: externalId.optional(),
  targetType: relationshipResourceType.optional(),
  targetExternalId: externalId.optional(),
  relationshipType: z.string().trim().min(1).max(100).optional(),
  dataSetExternalId: externalId.optional(),
  activeAtTime: z.string().trim().min(1).optional(),
  minConfidence: z.coerce.number().min(0).max(1).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  cursor: z.string().trim().max(255).optional(),
});

export type CreateRelationship = z.infer<typeof createRelationshipSchema>;
export type UpdateRelationship = z.infer<typeof updateRelationshipSchema>;
export type RelationshipListQuery = z.infer<typeof relationshipListQuerySchema>;

// ── Events ──

const eventType = z.enum(['maintenance', 'alarm', 'failure', 'inspection', 'operational', 'custom']);

export const createEventSchema = z.object({
  externalId: externalId,
  type: eventType,
  subtype: z.string().trim().min(1).max(100).optional(),
  description: z.string().trim().max(2000).optional(),
  startTime: z.string().trim().min(1).nullable().optional(),
  endTime: z.string().trim().min(1).nullable().optional(),
  assetExternalIds: z.array(externalId).max(100).default([]),
  dataSetExternalId: externalId.nullable().optional(),
  source: z.string().trim().min(1).max(255).optional(),
  metadata: metadata,
});

export const updateEventSchema = z.object({
  description: z.string().trim().max(2000).optional(),
  startTime: z.string().trim().min(1).nullable().optional(),
  endTime: z.string().trim().min(1).nullable().optional(),
  assetExternalIds: z.array(externalId).max(100).optional(),
  subtype: z.string().trim().min(1).max(100).nullable().optional(),
  source: z.string().trim().min(1).max(255).nullable().optional(),
  metadata: metadata.optional(),
});

export const eventListQuerySchema = z.object({
  type: eventType.optional(),
  subtype: z.string().trim().min(1).max(100).optional(),
  assetExternalId: externalId.optional(),
  dataSetExternalId: externalId.optional(),
  source: z.string().trim().min(1).max(255).optional(),
  startTimeMin: z.string().trim().min(1).optional(),
  startTimeMax: z.string().trim().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  cursor: z.string().trim().max(255).optional(),
});

export type CreateEvent = z.infer<typeof createEventSchema>;
export type UpdateEvent = z.infer<typeof updateEventSchema>;
export type EventListQuery = z.infer<typeof eventListQuerySchema>;

// ── Sequences ──

export const sequenceColumnSchema = z.object({
  externalId: externalId,
  name: z.string().trim().min(1).max(255),
  description: z.string().trim().max(1000).optional(),
  valueType: z.enum(['STRING', 'DOUBLE', 'LONG']),
});

export const createSequenceSchema = z.object({
  externalId: externalId,
  name: z.string().trim().min(1).max(255),
  description: z.string().trim().max(2000).optional(),
  assetExternalId: externalId.nullable().optional(),
  dataSetExternalId: externalId.nullable().optional(),
  columns: z.array(sequenceColumnSchema).min(1).max(200),
});

export const updateSequenceSchema = z.object({
  name: z.string().trim().min(1).max(255).optional(),
  description: z.string().trim().max(2000).nullable().optional(),
  assetExternalId: externalId.nullable().optional(),
  dataSetExternalId: externalId.nullable().optional(),
});

export const sequenceRowSchema = z.object({
  rowNumber: z.number().int().min(0),
  values: z.array(z.union([z.string(), z.number(), z.null()])),
});

export const sequenceRowsInsertSchema = z.object({
  columns: z.array(externalId).min(1),
  rows: z.array(sequenceRowSchema).min(1).max(10000),
});

export const sequenceRowsQuerySchema = z.object({
  start: z.coerce.number().int().min(0).optional(),
  end: z.coerce.number().int().min(0).optional(),
  columns: z.array(externalId).optional(),
  limit: z.coerce.number().int().min(1).max(1000).default(100),
});

export const sequenceListQuerySchema = z.object({
  assetExternalId: externalId.optional(),
  dataSetExternalId: externalId.optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  cursor: z.string().trim().max(255).optional(),
});

export type CreateSequence = z.infer<typeof createSequenceSchema>;
export type UpdateSequence = z.infer<typeof updateSequenceSchema>;
export type SequenceRowsInsert = z.infer<typeof sequenceRowsInsertSchema>;
export type SequenceRowsQuery = z.infer<typeof sequenceRowsQuerySchema>;
export type SequenceListQuery = z.infer<typeof sequenceListQuerySchema>;

// ── Annotations ──

const annotationType = z.enum(['text', 'diagram_tag', 'region', 'entity_link']);
const annotationStatus = z.enum(['suggested', 'approved', 'rejected']);

export const boundingBoxSchema = z.object({
  xMin: z.number(),
  yMin: z.number(),
  xMax: z.number(),
  yMax: z.number(),
  page: z.number().int().min(1).optional(),
});

export const annotationDataSchema = z.object({
  label: z.string().trim().min(1).max(500),
  confidence: z.number().min(0).max(1).optional(),
  boundingBox: boundingBoxSchema.optional(),
  linkedResourceType: z.string().trim().min(1).max(100).optional(),
  linkedResourceExternalId: externalId.optional(),
});

export const createAnnotationSchema = z.object({
  annotationType: annotationType,
  annotatedResourceType: z.string().trim().min(1).max(100),
  annotatedResourceExternalId: externalId,
  data: annotationDataSchema,
  status: annotationStatus.default('suggested'),
});

export const updateAnnotationSchema = z.object({
  status: annotationStatus.optional(),
  data: annotationDataSchema.partial().optional(),
});

export const annotationListQuerySchema = z.object({
  annotatedResourceType: z.string().trim().min(1).max(100).optional(),
  annotatedResourceExternalId: externalId.optional(),
  annotationType: annotationType.optional(),
  status: annotationStatus.optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  cursor: z.string().trim().max(255).optional(),
});

export type CreateAnnotation = z.infer<typeof createAnnotationSchema>;
export type UpdateAnnotation = z.infer<typeof updateAnnotationSchema>;
export type AnnotationListQuery = z.infer<typeof annotationListQuerySchema>;
