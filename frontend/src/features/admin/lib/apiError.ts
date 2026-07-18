import axios from 'axios';

export function getApiErrorMessage(error: unknown, fallback: string) {
  if (!axios.isAxiosError(error)) return fallback;

  const responseData = error.response?.data;
  if (typeof responseData === 'string' && responseData.trim()) return responseData;

  if (responseData && typeof responseData === 'object') {
    const { error: message, message: detail } = responseData as { error?: unknown; message?: unknown };
    if (typeof message === 'string' && message.trim()) return message;
    if (typeof detail === 'string' && detail.trim()) return detail;
  }

  return fallback;
}
