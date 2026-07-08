import { getCurrentLanguage, languageOptions, type SupportedLanguage } from '../../app/i18n';

const localeByLanguage: Record<SupportedLanguage, string> = Object.fromEntries(
  languageOptions.map((option) => [option.code, option.intlLocale]),
) as Record<SupportedLanguage, string>;

export function getIntlLocale(language: SupportedLanguage = getCurrentLanguage()) {
  return localeByLanguage[language] ?? 'vi-VN';
}

export function formatNumber(value?: number | null, options?: Intl.NumberFormatOptions) {
  return new Intl.NumberFormat(getIntlLocale(), options).format(Number(value ?? 0));
}

export const fmt = formatNumber;

/** Format seconds to h m s */
export const fmtRuntime = (s?: number | null): string => {
  const sec = Number(s) || 0;
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const ss = sec % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${ss}s`;
  return `${ss}s`;
};

export function formatDuration(seconds?: number | null): string {
  return fmtRuntime(seconds);
}

export const fmtDate = (d?: string | null): string => {
  if (!d) return '-';
  return formatDateTime(d);
};

export function formatDateTime(value?: string | number | Date | null): string {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return new Intl.DateTimeFormat(getIntlLocale(), {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

export function formatDate(value?: string | number | Date | null): string {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return new Intl.DateTimeFormat(getIntlLocale(), {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

export function formatTime(value?: string | number | Date | null): string {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return new Intl.DateTimeFormat(getIntlLocale(), {
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

export function formatRelativeTime(value?: string | number | Date | null): string {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  const deltaSeconds = Math.round((date.getTime() - Date.now()) / 1000);
  const absolute = Math.abs(deltaSeconds);
  const unit: Intl.RelativeTimeFormatUnit =
    absolute < 60 ? 'second' : absolute < 3600 ? 'minute' : absolute < 86400 ? 'hour' : 'day';
  const divisor = unit === 'second' ? 1 : unit === 'minute' ? 60 : unit === 'hour' ? 3600 : 86400;
  return new Intl.RelativeTimeFormat(getIntlLocale(), { numeric: 'auto' }).format(
    Math.round(deltaSeconds / divisor),
    unit,
  );
}

export const normalizeMachineStatus = (
  status?: string | null
): 'running' | 'error' | 'idle' | 'stopped' | 'maintenance' | 'offline' | 'disconnected' => {
  const s = (status || '').toLowerCase().trim();

  if (
    s === 'running' ||
    s === 'run' ||
    s === 'online' ||
    s === 'dang chay' ||
    s === 'hoat dong' ||
    s === 'đang chạy' ||
    s === 'hoạt động'
  ) {
    return 'running';
  }

  if (
    s === 'error' ||
    s === 'fault' ||
    s === 'alarm' ||
    s === 'loi' ||
    s === 'lỗi'
  ) {
    return 'error';
  }

  if (
    s === 'idle' ||
    s === 'waiting' ||
    s === 'nhan roi' ||
    s === 'ranh' ||
    s === 'cho' ||
    s === 'nhàn rỗi' ||
    s === 'rảnh' ||
    s === 'chờ'
  ) {
    return 'idle';
  }

  if (
    s === 'stopped' ||
    s === 'stop' ||
    s === 'paused' ||
    s === 'da dung' ||
    s === 'dung' ||
    s === 'Ä‘Ã£ dá»«ng' ||
    s === 'dá»«ng'
  ) {
    return 'stopped';
  }

  if (
    s === 'maintenance' ||
    s === 'maintain' ||
    s === 'bao tri' ||
    s === 'báº£o trÃ¬'
  ) {
    return 'maintenance';
  }

  if (
    s === 'disconnected' ||
    s === 'disconnect' ||
    s === 'lost' ||
    s === 'mat ket noi' ||
    s === 'máº¥t káº¿t ná»‘i'
  ) {
    return 'disconnected';
  }

  return 'offline';
};

export const normalizeApprovalStatus = (
  status?: string | null,
  fallback: 'PENDING' | 'APPROVED' | 'REJECTED' | 'REVOKED' = 'PENDING'
): 'PENDING' | 'APPROVED' | 'REJECTED' | 'REVOKED' => {
  const s = (status || '').toUpperCase().trim();
  if (s === 'PENDING' || s === 'APPROVED' || s === 'REJECTED' || s === 'REVOKED') {
    return s;
  }
  return fallback;
};

export const normalizeAlarmSeverity = (
  severity?: string | null
): 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' => {
  const s = (severity || '').toUpperCase().trim();
  if (s === 'CRITICAL' || s === 'HIGH' || s === 'MEDIUM' || s === 'LOW') {
    return s;
  }
  return 'LOW';
};

export const normalizeAlarmStatus = (
  status?: string | null
): 'ACTIVE' | 'ACKNOWLEDGED' | 'RESOLVED' => {
  const s = (status || '').toUpperCase().trim();
  if (s === 'ACTIVE' || s === 'ACKNOWLEDGED' || s === 'RESOLVED') {
    return s;
  }
  return 'ACTIVE';
};

export const normalizeRole = (role?: string | null): 'ADMIN' | 'ENGINEER' | 'GUEST' => {
  const s = (role || '').toUpperCase().trim();
  if (s === 'ADMIN' || s === 'ENGINEER' || s === 'GUEST') {
    return s;
  }
  return 'GUEST';
};

/** Map status string to canonical key */
export const getStatusKey = (status?: string | null): 'running' | 'error' | 'idle' | 'stopped' | 'maintenance' | 'offline' | 'disconnected' =>
  normalizeMachineStatus(status);

export const STATUS_LABELS: Record<string, string> = {
  running: 'Đang chạy',
  idle: 'Đang chờ',
  stopped: 'Đã dừng',
  error: 'Đang lỗi',
  maintenance: 'Bảo trì',
  offline: 'Offline',
  disconnected: 'Mất kết nối',
};

export const SEVERITY_ORDER: Record<string, number> = {
  CRITICAL: 0,
  HIGH: 1,
  MEDIUM: 2,
  LOW: 3,
};
