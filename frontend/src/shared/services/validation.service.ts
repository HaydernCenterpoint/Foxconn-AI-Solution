import type { Machine } from '../../features/machines/services/machines.api';

export interface ValidationResult {
  valid: boolean;
  message?: string;
}

export function validateIPv4(value: string, required = false): ValidationResult {
  const ip = value.trim();
  if (!ip) {
    return required
      ? { valid: false, message: 'validation.ipRequired' }
      : { valid: true };
  }

  if (ip.includes(':')) {
    return { valid: false, message: 'validation.ipAndPortSeparate' };
  }

  const parts = ip.split('.');
  if (parts.length !== 4) {
    return { valid: false, message: 'validation.ipFourOctets' };
  }

  for (const part of parts) {
    if (!/^\d+$/.test(part)) {
      return { valid: false, message: 'validation.ipDigitsOnly' };
    }

    const number = Number(part);
    if (number < 0 || number > 255) {
      return { valid: false, message: 'validation.ipOctetRange' };
    }
  }

  return { valid: true };
}

export function validatePort(value: string, required = false): ValidationResult {
  const port = value.trim();
  if (!port) {
    return required
      ? { valid: false, message: 'validation.portRequired' }
      : { valid: true };
  }

  if (!/^\d+$/.test(port)) {
    return { valid: false, message: 'validation.portInteger' };
  }

  const number = Number(port);
  if (number < 1 || number > 65535) {
    return { valid: false, message: 'validation.portRange' };
  }

  return { valid: true };
}

export function findDuplicateIp(
  machines: Machine[],
  ip: string,
  currentMachineId?: string,
) {
  const normalized = ip.trim();
  if (!normalized) return undefined;

  return machines.find((machine) => {
    if (machine.id === currentMachineId) return false;
    return (machine.ip ?? '').trim() === normalized;
  });
}
