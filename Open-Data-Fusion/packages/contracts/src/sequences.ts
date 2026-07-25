/**
 * Sequences — row-indexed tabular data storage (CDF parity).
 */

export interface SequenceColumn {
  externalId: string;
  name: string;
  description?: string;
  valueType: 'STRING' | 'DOUBLE' | 'LONG';
}

export interface SequenceDefinition {
  id: string;
  tenantId: string;
  projectId: string;
  externalId: string;
  name: string;
  description: string | null;
  assetExternalId: string | null;
  dataSetExternalId: string | null;
  columns: SequenceColumn[];
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface SequenceRow {
  rowNumber: number;
  values: (string | number | null)[];
}

export interface SequenceRowsInsert {
  columns: string[];
  rows: SequenceRow[];
}

export interface SequenceRowsQuery {
  start?: number;
  end?: number;
  columns?: string[];
  limit?: number;
}

export interface CreateSequenceRequest {
  externalId: string;
  name: string;
  description?: string;
  assetExternalId?: string;
  dataSetExternalId?: string;
  columns: SequenceColumn[];
}

export interface UpdateSequenceRequest {
  name?: string;
  description?: string | null;
  assetExternalId?: string | null;
  dataSetExternalId?: string | null;
}

export interface SequenceFilter {
  assetExternalId?: string;
  dataSetExternalId?: string;
  limit?: number;
  cursor?: string;
}
