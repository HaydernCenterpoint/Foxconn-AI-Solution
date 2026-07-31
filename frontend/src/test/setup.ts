import '@testing-library/jest-dom/vitest';

const values = new Map<string, string>();
const testLocalStorage = {
  getItem: (key: string) => values.get(key) ?? null,
  setItem: (key: string, value: string) => values.set(key, value),
  removeItem: (key: string) => values.delete(key),
  clear: () => values.clear(),
};

Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: testLocalStorage });
if (typeof window !== 'undefined') {
  Object.defineProperty(window, 'localStorage', { configurable: true, value: testLocalStorage });
}
