import axios, { type AxiosError, type InternalAxiosRequestConfig } from 'axios';
import { useAuthStore } from '../store/auth.store';
import { useUiStore } from '../store/ui.store';
import i18n from '../../app/i18n';

const BASE_URL = import.meta.env.VITE_API_URL || '/api';

const MAX_RETRIES = 2;
const RETRY_DELAY_MS = 1000;
const RETRYABLE_STATUSES = new Set([502, 503, 504]);
const SILENT_URL_PREFIXES = ['/dashboard/summary', '/alarms', '/simulation'];

interface RetryableConfig extends InternalAxiosRequestConfig {
  _retryCount?: number;
}

export const api = axios.create({
  baseURL: BASE_URL,
  timeout: 10_000,
  headers: { 'Content-Type': 'application/json' },
});

api.interceptors.request.use((config) => {
  const token = useAuthStore.getState().token;
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

function isSilentUrl(url: string): boolean {
  return SILENT_URL_PREFIXES.some((prefix) => url.includes(prefix));
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

api.interceptors.response.use(
  (res) => res,
  async (err: AxiosError) => {
    const config = err.config as RetryableConfig | undefined;

    if (err.response?.status === 401) {
      useAuthStore.getState().logout('auth.errors.sessionExpired');
      if (window.location.pathname.startsWith('/admin')) {
        window.location.href = '/login';
      }
      return Promise.reject(err);
    }

    const isNetworkError = !err.response || err.code === 'ERR_NETWORK' || err.message === 'Network Error';
    const isTimeout = err.code === 'ECONNABORTED';
    const isRetryableStatus = err.response?.status != null && RETRYABLE_STATUSES.has(err.response.status);
    const currentRetry = config?._retryCount ?? 0;

    if (config && (isNetworkError || isTimeout || isRetryableStatus) && currentRetry < MAX_RETRIES) {
      config._retryCount = currentRetry + 1;
      await delay(RETRY_DELAY_MS * config._retryCount);
      return api(config);
    }

    if (import.meta.env.DEV && config && (isNetworkError || isTimeout || isRetryableStatus)) {
      const url = config.url || '';
      const method = config.method?.toLowerCase() || 'get';
      const { getMockDataForUrl } = await import('./apiClient.mock');
      const mockData = getMockDataForUrl(url, method);

      if (mockData !== undefined) {
        console.warn(`[Axios Simulator Mode] Request to ${url} failed. Returning simulated data...`);
        return Promise.resolve({
          data: mockData,
          status: 200,
          statusText: 'OK',
          headers: {},
          config,
        });
      }
    }

    if (config && !isSilentUrl(config.url || '')) {
      const status = err.response?.status;
      const message =
        status && status >= 500
          ? i18n.t('errors.serverError')
          : isNetworkError || isTimeout
            ? i18n.t('errors.network')
            : i18n.t('errors.unknown');
      useUiStore.getState().addToast('error', message);
    }

    return Promise.reject(err);
  }
);
