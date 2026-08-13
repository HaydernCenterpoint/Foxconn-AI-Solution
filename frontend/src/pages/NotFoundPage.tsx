
import { useTranslation } from 'react-i18next';
import { MaterialSymbol } from '../shared/components/ui/MaterialSymbol';
import { useNavigate } from 'react-router-dom';
import { Button } from '../shared/components/ui/Button';
import { Surface } from '../shared/components/ui/Surface';

export default function NotFoundPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();

  return (
    <main className="flex min-h-[420px] items-center justify-center py-8" aria-labelledby="not-found-heading">
      <Surface variant="raised" padding="lg" className="w-full max-w-lg text-center sm:p-8">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-primary-light text-primary" aria-hidden="true">
          <MaterialSymbol name="search_off" size={30} />
        </div>
        <h1 id="not-found-heading" className="mt-5 text-2xl font-semibold text-text-primary">
          {t('pages.notFound.title')}
        </h1>
        <p className="mx-auto mt-3 max-w-md text-sm text-text-secondary">{t('pages.notFound.description')}</p>
        <Button className="mt-6" startIcon={<MaterialSymbol name="arrow_back" size={16} />} onClick={() => navigate('/')}>
          {t('pages.notFound.backToOverview')}
        </Button>
      </Surface>
    </main>
  );
}
