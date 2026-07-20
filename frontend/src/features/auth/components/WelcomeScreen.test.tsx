const testStorage = vi.hoisted(() => {
  const values = new Map<string, string>();
  const storage = {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
    removeItem: (key: string) => values.delete(key),
    clear: () => values.clear(),
  };

  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: storage });
  if (typeof window !== 'undefined') {
    Object.defineProperty(window, 'localStorage', { configurable: true, value: storage });
  }

  return storage;
});

import { act, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import i18n from '../../../app/i18n';
import { WelcomeScreen } from './WelcomeScreen';

vi.mock('@gsap/react', () => ({ useGSAP: vi.fn() }));
vi.mock('gsap', () => ({ default: { registerPlugin: vi.fn() } }));

describe('WelcomeScreen', () => {
  beforeEach(async () => {
    testStorage.clear();
    vi.useFakeTimers();
    await i18n.changeLanguage('en');
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('presents the loading transition and completes automatically', () => {
    const onComplete = vi.fn();
    render(<WelcomeScreen username="admin" onComplete={onComplete} />);

    expect(screen.getByRole('heading', { name: 'Welcome, admin' })).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('Loading');

    act(() => vi.advanceTimersByTime(1450));
    expect(onComplete).toHaveBeenCalledOnce();
  });
});
