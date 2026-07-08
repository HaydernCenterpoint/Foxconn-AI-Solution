import { ShieldAlert } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';

export function PermissionDeniedState() {
  const { t } = useTranslation();

  return (
    <div className="flex h-full min-h-[360px] flex-col items-center justify-center p-10 text-center">
      <div className="mb-4 rounded-full bg-error/10 p-4 text-error">
        <ShieldAlert size={40} aria-hidden="true" />
      </div>
      <h2 className="mb-2 text-xl font-semibold text-error">{t('auth.permissionDeniedTitle')}</h2>
      <p className="max-w-md text-sm text-muted">{t('auth.permissionDeniedDescription')}</p>
      <Link
        to="/"
        className="btn btn-primary mt-5"
      >
        {t('pages.notFound.backToOverview')}
      </Link>
    </div>
  );
}
