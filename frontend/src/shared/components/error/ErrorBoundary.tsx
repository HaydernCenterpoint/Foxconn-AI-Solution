import { Component, type ErrorInfo, type ReactNode } from 'react';
import { MaterialSymbol } from '../ui/MaterialSymbol';

import i18n from '../../../app/i18n';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Unhandled UI error', error, info);
  }

  render() {
    if (!this.state.hasError) return this.props.children;

    return (
      <div className="app-backdrop flex min-h-[100dvh] items-center justify-center bg-bg p-6 text-center">
        <div className="max-w-md rounded-[var(--radius-large)] border border-border bg-panel p-8 shadow-panel">
          <MaterialSymbol name="warning" size={40} className="mx-auto mb-4 text-error" />
          <h1 className="mb-2 text-xl font-semibold">{i18n.t('errors.uiCrashTitle')}</h1>
          <p className="text-sm text-muted">
            {i18n.t('errors.uiCrashDescription')}
          </p>
          <div className="mt-5 flex items-center justify-center gap-3">
            <button
              onClick={() => window.location.reload()}
              className="btn btn-secondary"
            >
              {i18n.t('common.actions.refresh')}
            </button>
            <a
              href="/"
              className="btn btn-primary"
            >
              {i18n.t('pages.notFound.backToOverview')}
            </a>
          </div>
        </div>
      </div>
    );
  }
}
