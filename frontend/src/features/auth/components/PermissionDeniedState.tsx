import { ArrowLeft, ShieldAlert } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { Button } from '../../../shared/components/ui/Button';
import { Surface } from '../../../shared/components/ui/Surface';

export function PermissionDeniedState() {
  const { t } = useTranslation();
  const navigate = useNavigate();

  return (
    <section className="flex min-h-[420px] items-center justify-center py-8" aria-labelledby="permission-denied-heading">
      <Surface variant="raised" padding="lg" className="w-full max-w-lg text-center sm:p-8">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-error-container text-error" aria-hidden="true">
          <ShieldAlert size={30} />
        </div>
        <h1 id="permission-denied-heading" className="mt-5 text-2xl font-semibold text-text-primary">
          {t('auth.permissionDeniedTitle')}
        </h1>
        <p className="mx-auto mt-3 max-w-md text-sm text-text-secondary">
          {t('auth.permissionDeniedDescription')}
        </p>
        <Button className="mt-6" startIcon={<ArrowLeft size={16} aria-hidden="true" />} onClick={() => navigate('/')}>
          {t('pages.notFound.backToOverview')}
        </Button>
      </Surface>
    </section>
  );
}
