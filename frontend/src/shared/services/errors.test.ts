import { describe, it, expect } from 'vitest';
import { AxiosError } from 'axios';
import { normalizeApiError, getApiErrorMessage } from './errors';

describe('normalizeApiError', () => {
  it('extracts message from AxiosError response payload', () => {
    const err = new AxiosError('Request failed', 'ERR_BAD_REQUEST', undefined, undefined, {
      status: 400,
      data: { message: 'Invalid input' },
      statusText: 'Bad Request',
      headers: {},
      config: {} as never,
    });

    const result = normalizeApiError(err);
    expect(result.status).toBe(400);
    expect(result.message).toBe('Invalid input');
    expect(result.code).toBe('HTTP_400');
  });

  it('falls back to error.message when no payload', () => {
    const err = new AxiosError('Network timeout');
    const result = normalizeApiError(err);
    expect(result.message).toBe('Network timeout');
  });

  it('handles plain Error instances', () => {
    const err = new Error('Something broke');
    const result = normalizeApiError(err);
    expect(result.code).toBe('CLIENT_ERROR');
    expect(result.message).toBe('Something broke');
  });

  it('handles unknown values', () => {
    const result = normalizeApiError(null);
    expect(result.code).toBe('UNKNOWN_ERROR');
  });
});

describe('getApiErrorMessage', () => {
  it('returns message string directly', () => {
    expect(getApiErrorMessage(new Error('fail'))).toBe('fail');
  });
});
