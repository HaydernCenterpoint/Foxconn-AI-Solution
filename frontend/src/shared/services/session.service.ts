import type { UserRole } from '../types/domain';
import { normalizeRole } from '../lib/utils';

interface JwtPayload {
  exp?: number;
  'http://schemas.microsoft.com/ws/2008/06/identity/claims/role'?: string;
  'http://schemas.xmlsoap.org/ws/2005/05/identity/claims/name'?: string;
  role?: string;
  unique_name?: string;
  name?: string;
  sub?: string;
}

function decodeBase64Url(value: string) {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized.padEnd(normalized.length + ((4 - (normalized.length % 4)) % 4), '=');
  return atob(padded);
}

export function decodeJwtPayload(token: string): JwtPayload | null {
  const parts = token.split('.');
  if (parts.length < 2) return null;

  try {
    return JSON.parse(decodeBase64Url(parts[1])) as JwtPayload;
  } catch {
    return null;
  }
}

export function isJwtExpired(token: string, clockSkewSeconds = 30) {
  const payload = decodeJwtPayload(token);
  if (!payload?.exp) return false;
  return payload.exp <= Math.floor(Date.now() / 1000) + clockSkewSeconds;
}

export function getJwtUser(token: string): { username?: string; role?: UserRole } {
  const payload = decodeJwtPayload(token);
  if (!payload) return {};

  const username =
    payload['http://schemas.xmlsoap.org/ws/2005/05/identity/claims/name'] ??
    payload.unique_name ??
    payload.name ??
    payload.sub;

  const rawRole =
    payload['http://schemas.microsoft.com/ws/2008/06/identity/claims/role'] ??
    payload.role;

  return {
    username,
    role: rawRole ? normalizeRole(rawRole) : undefined,
  };
}

