import { Link } from 'react-router-dom';
import { SearchX } from 'lucide-react';
import { useTranslation } from 'react-i18next';

export default function NotFoundPage() {
  const { t } = useTranslation();

  return (
    <div className="flex min-h-[420px] flex-col items-center justify-center text-center">
      <div className="mb-4 rounded-full bg-accent/10 p-4 text-accent">
        <SearchX size={40} aria-hidden="true" />
      </div>
      <h1 className="mb-2 text-2xl font-semibold">{t('pages.notFound.title')}</h1>
      <p className="mb-5 text-sm text-muted">{t('pages.notFound.description')}</p>
      <Link to="/" className="btn btn-primary">
        {t('pages.notFound.backToOverview')}
      </Link>
    </div>
  );
}
