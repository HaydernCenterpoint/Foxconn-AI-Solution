import { AxiosError } from 'axios';
import type { ApiError } from '../types/domain';

interface ApiErrorPayload {
  error?: string;
  message?: string;
  code?: string;
  correlationId?: string;
  details?: unknown;
}

export function normalizeApiError(error: unknown): ApiError {
  if (error instanceof AxiosError) {
    const payload = error.response?.data as ApiErrorPayload | undefined;
    return {
      status: error.response?.status,
      code: payload?.code ?? `HTTP_${error.response?.status ?? 'NETWORK'}`,
      message: payload?.message ?? payload?.error ?? error.message ?? 'Không thể kết nối đến máy chủ.',
      correlationId: payload?.correlationId ?? error.response?.headers?.['x-correlation-id'],
      details: payload?.details,
    };
  }

  if (error instanceof Error) {
    return { code: 'CLIENT_ERROR', message: error.message };
  }

  return { code: 'UNKNOWN_ERROR', message: 'Đã xảy ra lỗi không xác định.' };
}

export function getApiErrorMessage(error: unknown) {
  return normalizeApiError(error).message;
}
