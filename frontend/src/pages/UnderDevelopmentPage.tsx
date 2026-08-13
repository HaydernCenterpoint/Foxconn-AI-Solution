
import { useTranslation } from 'react-i18next';
import { MaterialSymbol } from '../shared/components/ui/MaterialSymbol';

export default function UnderDevelopmentPage({ title }: { title: string }) {
  const { t } = useTranslation();

  return (
    <div className="flex min-h-[70dvh] w-full items-center justify-center p-6">
      <section className="w-full max-w-lg rounded-xl border border-outline bg-surface-container p-8 text-center shadow-2 sm:p-10">
        <div className="mb-6 flex justify-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-xl border border-primary/45 bg-primary-light text-primary">
            <MaterialSymbol name="build" size={32} />
          </div>
        </div>

        <h2 className="mb-3 text-xl font-bold tracking-[0.04em] text-on-surface uppercase">
          {title.toUpperCase()}
        </h2>
        <div className="mx-auto mb-5 h-px w-full max-w-xs bg-outline" />

        <p className="text-sm font-semibold uppercase leading-relaxed tracking-[0.03em] text-on-surface-variant">
          {t('underDevelopment.description')}
        </p>
        <p className="mt-3 text-xs font-medium text-text-muted">
          {t('underDevelopment.systemName')}
        </p>
      </section>
    </div>
  );
}
