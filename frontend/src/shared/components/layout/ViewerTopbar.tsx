import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Eye, ShieldAlert, Tv } from 'lucide-react';
import { Link } from 'react-router-dom';
import { LanguageSelector } from '../i18n/LanguageSelector';
import logoUrl from '../../../assets/Foxconn_Industrial_Internet.png';

export function ViewerTopbar() {
  const { t, i18n } = useTranslation();
  const [time, setTime] = useState(new Date());

  useEffect(() => {
    const timer = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const currentLang = i18n.language || 'vi';

  const getLocalizedDayAndDate = (date: Date, lang: string) => {
    let locale = 'vi-VN';
    if (lang === 'en') locale = 'en-US';
    else if (lang === 'zh-CN' || lang === 'zh') locale = 'zh-CN';

    const weekday = new Intl.DateTimeFormat(locale, { weekday: 'long' }).format(date);
    const dateStr = new Intl.DateTimeFormat(locale, { day: '2-digit', month: '2-digit', year: 'numeric' }).format(date);

    const capitalizedWeekday = weekday.charAt(0).toUpperCase() + weekday.slice(1);
    return `${capitalizedWeekday}, ${dateStr}`;
  };

  const formattedDayAndDate = getLocalizedDayAndDate(time, currentLang);
  const formattedTime = time.toTimeString().split(' ')[0];

  const getShiftBadge = () => {
    const totalMinutes = time.getHours() * 60 + time.getMinutes();

    if (totalMinutes >= 450 && totalMinutes <= 1110) {
      return {
        label: t('common.time.shiftMorning', 'CA SÁNG'),
        className: 'bg-running-container text-running border border-running/25',
      };
    }
    if (totalMinutes >= 1170 || totalMinutes <= 390) {
      return {
        label: t('common.time.shiftNight', 'CA ĐÊM'),
        className: 'bg-idle-container text-idle border border-idle/25',
      };
    }
    return {
      label: t('common.time.shiftHandover', 'BÀN GIAO'),
      className: 'bg-warn-container text-warn border border-warn/25',
    };
  };

  const shiftInfo = getShiftBadge();

  return (
    <header className="flex h-14 shrink-0 items-center justify-between gap-4 border-b border-[#20DFF3]/10 bg-[#07142C]/90 backdrop-blur-md pr-4 lg:pr-6 shadow-sm sticky top-0 z-40">
      <div className="flex min-w-0 items-center gap-0 h-full">
        {/* Logo FII */}
        <div 
          className="flex h-full items-center justify-center bg-white w-[280px] pr-6 shrink-0" 
          style={{ clipPath: 'polygon(0 0, 100% 0, 88% 100%, 0 100%)' }}
        >
          <img
            src={logoUrl}
            alt="Foxconn Industrial Internet"
            className="h-[30px] w-auto object-contain"
          />
        </div>
      </div>

      <div className="flex items-center gap-3">
        {/* Clock & Shift block */}
        <div className="hidden items-center gap-3.5 px-3 py-1 bg-surface-2 border border-border/10 rounded-lg md:flex">
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-text-secondary">
            <span>{formattedDayAndDate}</span>
            <span className="text-[#20DFF3]/30 font-normal">|</span>
            <span className="font-mono text-[#20DFF3]">{formattedTime}</span>
          </div>
          <div className="h-4 w-px bg-border/20" />
          <span className={`rounded px-1.5 py-0.5 text-[11px] font-semibold uppercase tracking-wider ${shiftInfo.className}`}>
            {shiftInfo.label}
          </span>
        </div>

        <div className="h-5 w-px bg-border/20 hidden md:block" />

        {/* Slideshow Presentation Mode Button */}
        <Link 
          to="/slideshow" 
          className="flex items-center gap-1.5 px-2.5 py-1 rounded bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/30 text-amber-400 text-xs font-bold uppercase tracking-wider transition-all duration-300 shadow-[0_0_8px_rgba(245,158,11,0.1)]"
        >
          <Tv size={14} />
          <span>{t('common.mode.slideshow', 'Trình chiếu')}</span>
        </Link>

        <div className="h-5 w-px bg-border/20" />

        {/* Read-only Mode Indicator */}
        <div className="flex items-center gap-1.5 px-2.5 py-1 rounded bg-[#20DFF3]/5 border border-[#20DFF3]/20 text-[#20DFF3] text-xs font-bold uppercase tracking-wider">
          <Eye size={14} />
          <span>{t('common.mode.readOnly', 'Chế độ xem')}</span>
        </div>

        <div className="h-5 w-px bg-border/20" />

        {/* Language selector */}
        <LanguageSelector />
      </div>
    </header>
  );
}
