import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { languageOptions } from '../../../app/i18n';

interface LocalizedDateTimeProps {
  className?: string;
  showSeconds?: boolean;
  showDate?: boolean;
}

function resolveLocale(language: string | undefined) {
  const option = languageOptions.find((item) => item.code === language)
    ?? languageOptions.find((item) => item.code === 'zh-CN' && language?.startsWith('zh'))
    ?? languageOptions[0];

  return option.intlLocale;
}

export function LocalizedDateTime({
  className = '',
  showSeconds = true,
  showDate = true,
}: LocalizedDateTimeProps) {
  const { i18n } = useTranslation();
  const [now, setNow] = useState(() => new Date());
  const locale = resolveLocale(i18n.resolvedLanguage ?? i18n.language);

  useEffect(() => {
    const interval = window.setInterval(() => setNow(new Date()), showSeconds ? 1000 : 30000);
    return () => window.clearInterval(interval);
  }, [showSeconds]);

  const { formattedDate, formattedTime } = useMemo(() => {
    const dateFormatter = new Intl.DateTimeFormat(locale, {
      weekday: 'long',
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });
    const timeFormatter = new Intl.DateTimeFormat(locale, {
      hour: '2-digit',
      minute: '2-digit',
      ...(showSeconds ? { second: '2-digit' } : {}),
    });

    return {
      formattedDate: dateFormatter.format(now),
      formattedTime: timeFormatter.format(now),
    };
  }, [locale, now, showSeconds]);

  return (
    <div className={`localized-date-time ${className}`.trim()}>
      <time className="localized-date-time__time" dateTime={now.toISOString()}>{formattedTime}</time>
      {showDate && <time className="localized-date-time__date" dateTime={now.toISOString()}>{formattedDate}</time>}
    </div>
  );
}
