/**
 * Relationships — typed, optionally time-bounded connections between resources.
 *
 * Relationships define directed connections between any two CDF-style resources,
 * with optional time constraints, confidence scores, and data set scoping.
 * Inspired by Cognite CDF Relationships resource type.
 */

import type { EntityId, IsoTimestamp } from './platform.js';
import type { LabelableResourceType } from './labels.js';

/* ── Core types ─────────────────────────────────────────────────────── */

export type RelationshipResourceType = LabelableResourceType | 'sequence' | 'relationship';

export interface Relationship {
  id: EntityId;
  tenantId: EntityId;
  projectId: EntityId;
  externalId: string;
  /** Source resource type */
  sourceType: RelationshipResourceType;
  /** Source resource external ID */
  sourceExternalId: string;
  /** Target resource type */
  targetType: RelationshipResourceType;
  /** Target resource external ID */
  targetExternalId: string;
  /** Relationship type label (e.g. "flowsTo", "isPartOf", "controls") */
  relationshipType: string;
  /** Optional data set scoping */
  dataSetExternalId: string | null;
  /** Confidence score 0-1 (for auto-generated relationships) */
  confidence: number;
  /** Optional start time for time-bounded relationships */
  startTime: IsoTimestamp | null;
  /** Optional end time for time-bounded relationships */
  endTime: IsoTimestamp | null;
  /** Optional labels attached to this relationship */
  labels: string[];
  createdBy: string;
  createdAt: IsoTimestamp;
  updatedAt: IsoTimestamp;
}

/* ── Request / response types ───────────────────────────────────────── */

export interface CreateRelationshipRequest {
  externalId: string;
  sourceType: RelationshipResourceType;
  sourceExternalId: string;
  targetType: RelationshipResourceType;
  targetExternalId: string;
  relationshipType: string;
  dataSetExternalId?: string | null;
  confidence?: number;
  startTime?: string | null;
  endTime?: string | null;
  labels?: string[];
}

export interface UpdateRelationshipRequest {
  confidence?: number;
  startTime?: string | null;
  endTime?: string | null;
  labels?: string[];
  dataSetExternalId?: string | null;
}

export interface RelationshipFilter {
  sourceType?: RelationshipResourceType;
  sourceExternalId?: string;
  targetType?: RelationshipResourceType;
  targetExternalId?: string;
  relationshipType?: string;
  dataSetExternalId?: string;
  /** Only return relationships active at this time */
  activeAtTime?: string;
  /** Minimum confidence threshold */
  minConfidence?: number;
  labels?: string[];
}
