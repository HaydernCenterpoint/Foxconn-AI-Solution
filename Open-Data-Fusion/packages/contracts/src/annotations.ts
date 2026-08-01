/**
 * Annotations — link resources to regions within files/diagrams (CDF parity).
 */

export type AnnotationType = 'text' | 'diagram_tag' | 'region' | 'entity_link';
export type AnnotationStatus = 'suggested' | 'approved' | 'rejected';

export interface BoundingBox {
  xMin: number;
  yMin: number;
  xMax: number;
  yMax: number;
  page?: number;
}

export interface AnnotationData {
  label: string;
  confidence?: number;
  boundingBox?: BoundingBox;
  linkedResourceType?: string;
  linkedResourceExternalId?: string;
}

export interface Annotation {
  id: string;
  tenantId: string;
  projectId: string;
  annotationType: AnnotationType;
  status: AnnotationStatus;
  annotatedResourceType: string;
  annotatedResourceExternalId: string;
  data: AnnotationData;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateAnnotationRequest {
  annotationType: AnnotationType;
  annotatedResourceType: string;
  annotatedResourceExternalId: string;
  data: AnnotationData;
  status?: AnnotationStatus;
}

export interface UpdateAnnotationRequest {
  status?: AnnotationStatus;
  data?: Partial<AnnotationData>;
}

export interface AnnotationFilter {
  annotatedResourceType?: string;
  annotatedResourceExternalId?: string;
  annotationType?: AnnotationType;
  status?: AnnotationStatus;
  limit?: number;
  cursor?: string;
}
