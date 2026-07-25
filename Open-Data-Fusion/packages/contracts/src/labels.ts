/**
 * Labels — managed vocabulary for tagging and classifying resources.
 *
 * Labels provide a predefined set of managed terms that you can use to annotate
 * and group assets, time series, files, events, and other resources.
 * Inspired by Cognite CDF Labels resource type.
 */

import type { EntityId, IsoTimestamp } from './platform.js';

/* ── Core types ─────────────────────────────────────────────────────── */

export interface LabelDefinition {
  id: EntityId;
  tenantId: EntityId;
  projectId: EntityId;
  externalId: string;
  name: string;
  description: string | null;
  /** Optional color for UI display (hex, e.g. "#22c55e") */
  color: string | null;
  /** Optional grouping category */
  category: string | null;
  createdBy: string;
  createdAt: IsoTimestamp;
  updatedAt: IsoTimestamp;
}

export interface LabelAttachment {
  id: EntityId;
  tenantId: EntityId;
  projectId: EntityId;
  labelExternalId: string;
  /** Type of the resource being labeled */
  resourceType: LabelableResourceType;
  /** External ID of the resource being labeled */
  resourceExternalId: string;
  attachedBy: string;
  attachedAt: IsoTimestamp;
}

export type LabelableResourceType =
  | 'asset'
  | 'time_series'
  | 'file'
  | 'event'
  | 'model'
  | 'pipeline'
  | 'data_set';

/* ── Request / response types ───────────────────────────────────────── */

export interface CreateLabelRequest {
  externalId: string;
  name: string;
  description?: string | null;
  color?: string | null;
  category?: string | null;
}

export interface UpdateLabelRequest {
  name?: string;
  description?: string | null;
  color?: string | null;
  category?: string | null;
}

export interface AttachLabelRequest {
  labelExternalId: string;
  resourceType: LabelableResourceType;
  resourceExternalId: string;
}

export interface DetachLabelRequest {
  labelExternalId: string;
  resourceType: LabelableResourceType;
  resourceExternalId: string;
}

export interface LabelFilter {
  category?: string;
  resourceType?: LabelableResourceType;
  resourceExternalId?: string;
}
