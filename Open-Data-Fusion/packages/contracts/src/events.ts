/**
 * Events — discrete occurrences tied to assets or time ranges.
 *
 * Cognite Data Fusion equivalent: Events API.
 */

export type EventType = 'maintenance' | 'alarm' | 'failure' | 'inspection' | 'operational' | 'custom';

export interface EventDefinition {
  id: string;
  tenantId: string;
  projectId: string;
  externalId: string;
  type: EventType;
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

export interface CreateEventRequest {
  externalId: string;
  type: EventType;
  subtype?: string;
  description?: string;
  startTime?: string;
  endTime?: string;
  assetExternalIds?: string[];
  dataSetExternalId?: string;
  source?: string;
  metadata?: Record<string, unknown>;
}

export interface UpdateEventRequest {
  description?: string;
  startTime?: string | null;
  endTime?: string | null;
  assetExternalIds?: string[];
  subtype?: string | null;
  source?: string | null;
  metadata?: Record<string, unknown>;
}

export interface EventFilter {
  type?: EventType;
  subtype?: string;
  assetExternalId?: string;
  dataSetExternalId?: string;
  source?: string;
  startTimeMin?: string;
  startTimeMax?: string;
  limit?: number;
  cursor?: string;
}
