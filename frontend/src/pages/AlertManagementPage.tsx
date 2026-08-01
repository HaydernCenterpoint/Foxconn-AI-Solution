import { useTranslation } from 'react-i18next';
import { PageHeader } from '../shared/components/ui/PageHeader';
import { AlertCenter } from '../features/alerts/components/AlertCenter';

export default function AlertManagementPage() {
  const { t } = useTranslation();
  return (
    <div className="space-y-6">
      <PageHeader eyebrow={t('alerts.eyebrow')} title={t('alerts.title')} description={t('alerts.description')} />
      <AlertCenter />
    </div>
  );
}
