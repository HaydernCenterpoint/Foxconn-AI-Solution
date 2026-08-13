import { useEffect, useRef } from 'react';
import { MaterialSymbol } from '../../../shared/components/ui/MaterialSymbol';
import { useGSAP } from '@gsap/react';
import gsap from 'gsap';

import { useTranslation } from 'react-i18next';
import logoUrl from '../../../assets/Foxconn_Industrial_Internet.png';
import { Button } from '../../../shared/components/ui/Button';
import { AuthScreen } from './AuthScreen';
import './welcome-screen.css';

gsap.registerPlugin(useGSAP);

interface Props {
  username: string;
  onComplete: () => void;
}

export function WelcomeScreen({ username, onComplete }: Props) {
  const { t } = useTranslation();
  const pageRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const timer = window.setTimeout(onComplete, 1450);
    return () => window.clearTimeout(timer);
  }, [onComplete]);

  useGSAP(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    gsap.timeline({ defaults: { ease: 'power3.out' } })
      .from('.welcome-visual-card__image', { duration: 1.1, opacity: 0.25, scale: 0.82 })
      .from('.welcome-copy > *', { duration: 0.72, opacity: 0, stagger: 0.06, y: 30 }, '-=0.82')
      .from('.welcome-stack-card', { duration: 0.78, opacity: 0, rotate: 3, stagger: 0.08, y: 70 }, '-=0.68')
      .fromTo(
        '.welcome-progress__fill',
        { scaleX: 0 },
        { duration: 1.2, ease: 'power2.inOut', scaleX: 1 },
        '-=0.88',
      );
  }, { scope: pageRef });

  const modules = [t('navigation.overview'), t('navigation.fiiAssistant'), t('navigation.fiiDataFusion')];
  const feedback = [t('common.systemDescription'), t('common.systemName'), t('common.appName')];

  return (
    <AuthScreen fullBleed>
      <main
        ref={pageRef}
        className="welcome-experience w-full max-w-full overflow-x-hidden"
        aria-labelledby="welcome-heading"
        aria-busy="true"
      >
        <div className="welcome-experience__image" aria-hidden="true" />
        <div className="welcome-experience__wash" aria-hidden="true" />

        <header className="welcome-nav">
          <div className="welcome-nav__brand">
            <span className="welcome-nav__logo-frame">
              <img src={logoUrl} alt={t('common.logoAlt')} />
            </span>
            <span>{t('common.appName')}</span>
          </div>
          <div className="welcome-nav__status" aria-live="polite">
            <span aria-hidden="true" />
            {t('common.loading')}
          </div>
        </header>

        <section className="welcome-layout">
          <div className="welcome-copy">
            <p className="welcome-copy__eyebrow">{t('common.systemName')}</p>
            <h1 id="welcome-heading">{t('auth.welcome', { name: username })}</h1>
            <p className="welcome-copy__lede">{t('common.systemDescription')}</p>

            <div className="welcome-copy__actions">
              <Button
                size="lg"
                className="welcome-copy__next"
                endIcon={<MaterialSymbol name="arrow_forward" size={18} />}
                onClick={onComplete}
              >
                {t('common.actions.next')}
              </Button>

              <div className="welcome-feedback" aria-hidden="true">
                <div className="welcome-feedback__track">
                  {feedback.map((line) => <p key={line}>{line}</p>)}
                </div>
              </div>
            </div>

            <div className="welcome-accordion" aria-hidden="true">
              {modules.map((module) => (
                <div className="welcome-accordion__item" key={module}>
                  <span />
                  <strong>{module}</strong>
                </div>
              ))}
            </div>
          </div>

          <div className="welcome-status-stack">
            <div className="welcome-stack-card welcome-visual-card" aria-hidden="true">
              <div className="welcome-visual-card__image" />
              <div className="welcome-visual-card__caption">
                <span className="welcome-visual-card__logo">
                  <img src={logoUrl} alt="" />
                </span>
                <span>{t('common.appName')}</span>
              </div>
            </div>

            <div className="welcome-stack-card welcome-progress-card" role="status" aria-live="polite">
              <div className="welcome-progress-card__status">
                <span aria-hidden="true"><MaterialSymbol name="check_circle" size={20} /></span>
                <p>{t('common.loading')}</p>
              </div>
              <strong>{t('common.systemName')}</strong>
              <div className="welcome-progress" aria-hidden="true">
                <span className="welcome-progress__fill" />
              </div>
              <p>{t('common.systemDescription')}</p>
            </div>
          </div>
        </section>

        <footer className="welcome-marquee" aria-hidden="true">
          <div className="welcome-marquee__track">
            {[...modules, ...modules].map((module, index) => (
              <span key={`${module}-${index}`}>{module}</span>
            ))}
          </div>
        </footer>
      </main>
    </AuthScreen>
  );
}
