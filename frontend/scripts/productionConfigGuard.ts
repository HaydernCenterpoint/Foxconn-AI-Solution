export interface BuildEnvironment {
  MODE?: string;
  VITE_ENABLE_API_MOCKS?: string;
}

interface BuildContext {
  command: string;
  mode: string;
  env: BuildEnvironment;
}

function isEnabled(value: string | undefined): boolean {
  return value?.trim().toLowerCase() === 'true';
}

export function assertProductionConfig({ command, mode, env }: BuildContext): void {
  if (command !== 'build' || mode !== 'production') return;

  const unsafeSettings: string[] = [];

  if (env.MODE?.trim().toLowerCase() === 'demo') {
    unsafeSettings.push('MODE=demo');
  }

  if (isEnabled(env.VITE_ENABLE_API_MOCKS)) {
    unsafeSettings.push('VITE_ENABLE_API_MOCKS=true');
  }

  if (unsafeSettings.length > 0) {
    throw new Error(
      `[production-config-guard] Production build blocked: synthetic data is enabled by ${unsafeSettings.join(', ')}.`,
    );
  }
}
