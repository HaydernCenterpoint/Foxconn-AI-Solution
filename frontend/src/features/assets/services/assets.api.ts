import { api } from '../../../shared/services/apiClient';
import { normalizeActionResult } from '../../../shared/services/normalize';

export interface AssetDocument {
  documentId: string;
  relationship: string;
  createdAt: string;
}

export interface AssetTreeNode {
  id: string;
  type: string;
  name: string;
  code: string;
  externalId: string;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
  children: AssetTreeNode[];
}

export interface AssetCreateRequest {
  type: 'PLANT' | 'AREA' | 'SENSOR';
  name: string;
  code: string;
  parentId?: string | null;
  metadata?: Record<string, unknown>;
}

export interface AssetUpdateRequest {
  name: string;
  code: string;
  metadata?: Record<string, unknown>;
}

export const assetsApi = {
  getTree: () => api.get<AssetTreeNode[]>('/assets/tree').then((response) => response.data),
  getDocuments: (assetId: string) =>
    api.get<AssetDocument[]>(`/assets/${assetId}/documents`).then((response) => response.data),
  create: (data: AssetCreateRequest) =>
    api.post('/assets', data).then((response) => response.data as AssetTreeNode),
  update: (assetId: string, data: AssetUpdateRequest) =>
    api.put(`/assets/${assetId}`, data).then((response) => normalizeActionResult(response.data)),
  remove: (assetId: string) =>
    api.delete(`/assets/${assetId}`).then((response) => normalizeActionResult(response.data)),
};
