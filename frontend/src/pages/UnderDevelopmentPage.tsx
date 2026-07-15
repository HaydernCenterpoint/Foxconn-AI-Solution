import { Wrench } from 'lucide-react';
import { useTranslation } from 'react-i18next';

export default function UnderDevelopmentPage({ title }: { title: string }) {
  const { t } = useTranslation();

  return (
    <div className="flex min-h-[70dvh] w-full items-center justify-center p-6">
      <section className="w-full max-w-lg rounded-3xl border border-[#3b3b3b] bg-[#1e1e1e] p-8 text-center shadow-[0_20px_44px_rgba(0,0,0,0.24)] sm:p-10">
        <div className="mb-6 flex justify-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl border border-[#ef4444]/45 bg-[#ef4444]/10 text-[#ff8a8c]">
            <Wrench className="h-8 w-8 stroke-[1.5]" />
          </div>
        </div>

        <h2 className="mb-3 text-xl font-bold tracking-[0.04em] text-[#f5f5f5] uppercase">
          {title.toUpperCase()}
        </h2>
        <div className="mx-auto mb-5 h-px w-full max-w-xs bg-[#3b3b3b]" />
        
        <p className="text-sm font-semibold uppercase leading-relaxed tracking-[0.03em] text-[#d4d4d4]">
          {t('underDevelopment.description')}
        </p>
        <p className="mt-3 text-xs font-medium text-[#9b9b9b]">
          {t('underDevelopment.systemName')}
        </p>
      </section>
    </div>
  );
}
