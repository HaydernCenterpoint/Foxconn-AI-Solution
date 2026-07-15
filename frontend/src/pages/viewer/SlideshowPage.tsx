import {
  useState,
  useEffect,
  useMemo,
  useRef,
  useId,
  type Dispatch,
  type ReactNode,
  type SetStateAction,
} from 'react';
import { useQuery, useQueries } from '@tanstack/react-query';
import { useNavigate, type NavigateFunction } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import './modern-slideshow.css';
import { RefreshCw } from 'lucide-react';
import {
  ComposedChart,
  Bar,
  Line,
  Radar,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  XAxis,
  YAxis,
  CartesianGrid,
  ResponsiveContainer,
} from 'recharts';

import { dashboardApi } from '../../features/dashboard/services/dashboard.api';
import { linesApi, type ProductionLine } from '../../features/production-lines/services/lines.api';
import type { Machine } from '../../features/machines/services/machines.api';
import { queryKeys } from '../../app/queryKeys';
import { queryTimings } from '../../app/queryOptions';
import { useDynamicTranslation } from '../../shared/lib/translator';
import { getSimulationAll, type SimulationData } from '../../features/simulation/services/simulation.api';
import { api } from '../../shared/services/apiClient';

type SlideshowMachine = Machine & {
  productionCount?: number;
};

interface SlideshowReportChartPoint {
  date?: string;
  output?: number;
  target?: number;
}

interface SlideshowReportData {
  chartData?: SlideshowReportChartPoint[];
}

interface SlideshowFuturisticCardProps {
  themeColor?: string;
  accentColor?: string;
  glowGradId?: string;
  className?: string;
  variant?: 'normal' | 'gauges';
  children?: ReactNode;
}

interface SlideshowHeaderProps {
  selectedLineId: string;
  setSelectedLineId: Dispatch<SetStateAction<string>>;
  lines?: ProductionLine[];
  tDynamic: (text: string) => string;
  selectedLine?: ProductionLine;
  formattedDateTime: string;
  toggleFullscreen: () => void;
  isFullscreen: boolean;
  navigate: NavigateFunction;
  t: TFunction;
}

const HoneycombPattern = () => (
  <svg
    className="modern-slideshow__decoration absolute right-2 bottom-2 w-32 h-32 opacity-[0.16] pointer-events-none select-none"
    style={{ filter: 'drop-shadow(0 0 5px rgba(0, 229, 255, 0.35))' }}
    viewBox="0 0 100 100"
    fill="none"
    stroke="#00f0ff"
    strokeWidth="1.2"
  >
    <path d="M 30 20 L 50 8.5 L 70 20 L 70 43 L 50 54.5 L 30 43 Z" />
    <path d="M 50 54.5 L 70 43 L 90 54.5 L 90 77.5 L 70 89 L 50 77.5 Z" />
    <path d="M 10 54.5 L 30 43 L 50 54.5 L 50 77.5 L 30 89 L 10 77.5 Z" />
    <path d="M 30 89 L 50 77.5 L 70 89 L 70 112 L 50 123.5 L 30 112 Z" />
    <path d="M 70 20 L 90 8.5 L 110 20 L 110 43 L 90 54.5 L 70 43 Z" />
    <path d="M -10 20 L 10 8.5 L 30 20 L 30 43 L 10 54.5 L -10 43 Z" />
  </svg>
);

const CyberDivider = () => (
  <div className="modern-slideshow__decoration w-full h-[12px] flex items-center justify-center select-none relative my-[-8px]">
    <svg className="w-full h-full max-w-[800px]" viewBox="0 0 800 12" fill="none">
      <style>{`
        .chevron-l-0 { animation: pulseChevronLeft 2s infinite 0s; }
        .chevron-l-1 { animation: pulseChevronLeft 2s infinite 0.15s; }
        .chevron-l-2 { animation: pulseChevronLeft 2s infinite 0.3s; }
        .chevron-l-3 { animation: pulseChevronLeft 2s infinite 0.45s; }
        .chevron-l-4 { animation: pulseChevronLeft 2s infinite 0.6s; }
        .chevron-l-5 { animation: pulseChevronLeft 2s infinite 0.75s; }

        .chevron-r-0 { animation: pulseChevronRight 2s infinite 0s; }
        .chevron-r-1 { animation: pulseChevronRight 2s infinite 0.15s; }
        .chevron-r-2 { animation: pulseChevronRight 2s infinite 0.3s; }
        .chevron-r-3 { animation: pulseChevronRight 2s infinite 0.45s; }
        .chevron-r-4 { animation: pulseChevronRight 2s infinite 0.6s; }
        .chevron-r-5 { animation: pulseChevronRight 2s infinite 0.75s; }

        @keyframes pulseChevronLeft {
          0%, 100% { opacity: 0.3; stroke: #14356a; }
          50% { opacity: 1; stroke: #00f0ff; filter: drop-shadow(0 0 2px #00f0ff); }
        }
        @keyframes pulseChevronRight {
          0%, 100% { opacity: 0.3; stroke: #14356a; }
          50% { opacity: 1; stroke: #00f0ff; filter: drop-shadow(0 0 2px #00f0ff); }
        }
      `}</style>

      {/* Left Chevrons */}
      <polyline points="215,1 205,6 215,11" stroke="#14356a" strokeWidth="1.8" strokeLinecap="round" className="chevron-l-0" />
      <polyline points="205,1 195,6 205,11" stroke="#14356a" strokeWidth="1.8" strokeLinecap="round" className="chevron-l-1" />
      <polyline points="195,1 185,6 195,11" stroke="#14356a" strokeWidth="1.8" strokeLinecap="round" className="chevron-l-2" />
      <polyline points="185,1 175,6 185,11" stroke="#14356a" strokeWidth="1.8" strokeLinecap="round" className="chevron-l-3" />
      <polyline points="175,1 165,6 175,11" stroke="#14356a" strokeWidth="1.8" strokeLinecap="round" className="chevron-l-4" />
      <polyline points="165,1 155,6 165,11" stroke="#14356a" strokeWidth="1.8" strokeLinecap="round" className="chevron-l-5" />

      {/* Central Bracket / Capsule */}
      <path
        d="M 220 6 L 226 2 L 574 2 L 580 6 L 574 10 L 226 10 Z"
        fill="rgba(7, 20, 48, 0.4)"
        stroke="#1d3e7a"
        strokeWidth="1.2"
      />

      {/* Central horizontal accent line */}
      <line x1="236" y1="6" x2="564" y2="6" stroke="#00f0ff" strokeWidth="1.5" opacity="0.8" style={{ filter: 'drop-shadow(0 0 3px #00f0ff)' }} />

      {/* Mini center dot */}
      <circle cx="400" cy="6" r="2.5" fill="#ffffff" style={{ filter: 'drop-shadow(0 0 2px #00f0ff)' }} />

      {/* Right Chevrons */}
      <polyline points="585,1 595,6 585,11" stroke="#14356a" strokeWidth="1.8" strokeLinecap="round" className="chevron-r-0" />
      <polyline points="595,1 605,6 595,11" stroke="#14356a" strokeWidth="1.8" strokeLinecap="round" className="chevron-r-1" />
      <polyline points="605,1 615,6 605,11" stroke="#14356a" strokeWidth="1.8" strokeLinecap="round" className="chevron-r-2" />
      <polyline points="615,1 625,6 615,11" stroke="#14356a" strokeWidth="1.8" strokeLinecap="round" className="chevron-r-3" />
      <polyline points="625,1 635,6 625,11" stroke="#14356a" strokeWidth="1.8" strokeLinecap="round" className="chevron-r-4" />
      <polyline points="635,1 645,6 635,11" stroke="#14356a" strokeWidth="1.8" strokeLinecap="round" className="chevron-r-5" />
    </svg>
  </div>
);

const FactorySkyline = () => (
  <svg
    className="modern-slideshow__decoration absolute left-0 bottom-0 w-full h-18 opacity-[0.16] pointer-events-none select-none"
    style={{ filter: 'drop-shadow(0 0 5px rgba(0, 229, 255, 0.35))' }}
    viewBox="0 0 300 80"
    preserveAspectRatio="none"
    fill="none"
    stroke="#00f0ff"
    strokeWidth="1"
  >
    <path d="M 0 80 L 10 80 L 10 55 L 20 55 L 20 80 L 35 80 L 35 40 L 42 32 L 58 32 L 65 40 L 65 80 L 80 80 L 80 62 L 105 62 L 105 80 L 120 80 L 120 48 L 128 48 L 128 40 L 135 40 L 135 48 L 143 48 L 143 80 L 160 80 L 168 60 L 182 60 L 190 80 L 220 80 L 220 45 L 228 35 L 242 35 L 250 45 L 250 80 L 300 80" />
    <line x1="15" y1="55" x2="15" y2="25" />
    <line x1="17" y1="55" x2="17" y2="28" />
    <line x1="90" y1="62" x2="90" y2="35" />
    <line x1="93" y1="62" x2="93" y2="38" />
    <line x1="0" y1="75" x2="300" y2="75" strokeDasharray="2 3" />
  </svg>
);

const SlideshowFuturisticCard = ({
  themeColor = '#14356a',
  accentColor = '#00f0ff',
  glowGradId = 'slideshow-glow-grad',
  className = '',
  variant = 'normal',
  children
}: SlideshowFuturisticCardProps) => {
  const ref = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 300, height: 200 });
  const uniqueId = useId();
  const dynamicGlowGradId = `${glowGradId}-${uniqueId.replace(/:/g, '_')}`;

  useEffect(() => {
    if (!ref.current) return;
    const observer = new ResizeObserver(() => {
      if (ref.current) {
        setSize({
          width: ref.current.offsetWidth,
          height: ref.current.offsetHeight
        });
      }
    });
    observer.observe(ref.current);
    return () => observer.disconnect();
  }, []);

  const W = size.width;
  const H = size.height;

  let borderPath: string;
  let innerPath: string;
  let innerPathInset: string;
  let clipPathStyle: string;
  let glowingTL: string;
  let glowingTR: string;
  let dBL: string;
  let dBR: string;

  if (variant === 'gauges') {
    const NH = 6; // Notch depth (shallower, matching screenshot)
    const L1 = Math.min(110, W * 0.22); // Width of top raised edge
    const NS = 6; // Notch slant width

    const getGaugesPath = (o: number) => {
      return [
        `M ${20 + o} ${o}`,
        `L ${L1 - o} ${o}`,
        `L ${L1 + NS - o} ${NH + o}`,
        `L ${W - L1 - NS + o} ${NH + o}`,
        `L ${W - L1 + o} ${o}`,
        `L ${W - 20 - o} ${o}`,
        `L ${W - 14 - o} ${4.5 + o}`,
        `L ${W - 8 - o} ${4.5 + o}`,
        `L ${W - o} ${12.5 + o}`,
        `L ${W - o} ${H - 12.5 - o}`,
        `L ${W - 8 - o} ${H - 4.5 - o}`,
        `L ${W - 14 - o} ${H - 4.5 - o}`,
        `L ${W - 20 - o} ${H - o}`,
        `L ${W - L1 + o} ${H - o}`,
        `L ${W - L1 - NS + o} ${H - NH - o}`,
        `L ${L1 + NS - o} ${H - NH - o}`,
        `L ${L1 - o} ${H - o}`,
        `L ${20 + o} ${H - o}`,
        `L ${14 + o} ${H - 4.5 - o}`,
        `L ${8 + o} ${H - 4.5 - o}`,
        `L ${o} ${H - 12.5 - o}`,
        `L ${o} ${12.5 + o}`,
        `L ${8 + o} ${4.5 + o}`,
        `L ${14 + o} ${4.5 + o}`,
        `Z`
      ].join(' ');
    };

    borderPath = getGaugesPath(1.5);
    innerPath = getGaugesPath(3.5);
    innerPathInset = getGaugesPath(5.0);

    glowingTL = [
      `M ${W / 2} ${NH + 1.5}`,
      `L ${L1 + NS - 1.5} ${NH + 1.5}`,
      `L ${L1 - 1.5} 1.5`,
      `L 21.5 1.5`,
      `L 15.5 6`,
      `L 9.5 6`,
      `L 1.5 14`,
      `L 1.5 35`
    ].join(' ');

    glowingTR = [
      `M ${W / 2} ${NH + 1.5}`,
      `L ${W - L1 - NS + 1.5} ${NH + 1.5}`,
      `L ${W - L1 + 1.5} 1.5`,
      `L ${W - 21.5} 1.5`,
      `L ${W - 15.5} 6`,
      `L ${W - 9.5} 6`,
      `L ${W - 1.5} 14`,
      `L ${W - 1.5} 35`
    ].join(' ');

    dBL = [
      `M 1.5 ${H - 35}`,
      `L 1.5 ${H - 14}`,
      `L 9.5 ${H - 6}`,
      `L 15.5 ${H - 6}`,
      `L 21.5 ${H - 1.5}`,
      `L ${L1 - 1.5} ${H - 1.5}`,
      `L ${L1 + NS - 1.5} ${H - NH - 1.5}`
    ].join(' ');

    dBR = [
      `M ${W - 1.5} ${H - 35}`,
      `L ${W - 1.5} ${H - 14}`,
      `L ${W - 9.5} ${H - 6}`,
      `L ${W - 15.5} ${H - 6}`,
      `L ${W - 21.5} ${H - 1.5}`,
      `L ${W - L1 + 1.5} ${H - 1.5}`,
      `L ${W - L1 - NS + 1.5} ${H - NH - 1.5}`
    ].join(' ');

    clipPathStyle = `polygon(
      20px 0px,
      ${L1}px 0px,
      ${L1 + NS}px ${NH}px,
      calc(100% - ${L1 + NS}px) ${NH}px,
      calc(100% - ${L1}px) 0px,
      calc(100% - 20px) 0px,
      calc(100% - 14px) 4.5px,
      calc(100% - 8px) 4.5px,
      100% 12.5px,
      100% calc(100% - 12.5px),
      calc(100% - 8px) calc(100% - 4.5px),
      calc(100% - 14px) calc(100% - 4.5px),
      calc(100% - 20px) 100%,
      calc(100% - ${L1}px) 100%,
      calc(100% - ${L1 + NS}px) calc(100% - ${NH}px),
      ${L1 + NS}px calc(100% - ${NH}px),
      ${L1}px 100%,
      20px 100%,
      14px calc(100% - 4.5px),
      8px calc(100% - 4.5px),
      0px calc(100% - 12.5px),
      0px 12.5px,
      8px 4.5px,
      14px 4.5px
    )`;
  } else {
    // Normal variant with simple single-slant chamfer corners and triple nested parallel lines
    const C = 12; // Corner chamfer size

    const getNormalPath = (o: number) => {
      return [
        `M ${C + o} ${o}`,
        `L ${W - C - o} ${o}`,
        `L ${W - o} ${C + o}`,
        `L ${W - o} ${H - C - o}`,
        `L ${W - C - o} ${H - o}`,
        `L ${C + o} ${H - o}`,
        `L ${o} ${H - C - o}`,
        `L ${o} ${C + o}`,
        `Z`
      ].join(' ');
    };

    borderPath = getNormalPath(1.5);
    innerPath = getNormalPath(3.5);
    innerPathInset = getNormalPath(5.0);

    const topHighlightEnd = Math.min(150, W * 0.4);
    glowingTL = `M ${topHighlightEnd} 1.5 L ${C + 1.5} 1.5 L 1.5 ${C + 1.5} L 1.5 35`;
    glowingTR = `M ${W - topHighlightEnd} 1.5 L ${W - C - 1.5} 1.5 L ${W - 1.5} ${C + 1.5} L ${W - 1.5} 35`;

    dBL = `M 1.5 ${H - 25} L 1.5 ${H - C - 1.5} L ${C + 1.5} ${H - 1.5} L 30 ${H - 1.5}`;
    dBR = `M ${W - 30} ${H - 1.5} L ${W - C - 1.5} ${H - 1.5} L ${W - 1.5} ${H - C - 1.5} L ${W - 1.5} ${H - 25}`;

    clipPathStyle = `polygon(
      ${C}px 0px,
      calc(100% - ${C}px) 0px,
      100% ${C}px,
      100% calc(100% - ${C}px),
      calc(100% - ${C}px) 100%,
      ${C}px 100%,
      0px calc(100% - ${C}px),
      0px ${C}px
    )`;
  }

  return (
    <div
      ref={ref}
      className={"modern-slideshow__card relative overflow-hidden bg-[#030a18]/94 min-h-0 " + className}
      style={{
        clipPath: clipPathStyle,
        boxShadow: 'inset 0 0 18px rgba(0, 145, 255, 0.07), 0 0 8px rgba(0, 220, 255, 0.2)'
      }}
    >
      <svg className="absolute inset-0 w-full h-full pointer-events-none" style={{ color: themeColor }}>
        <defs>
          <linearGradient id={dynamicGlowGradId} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor={themeColor} stopOpacity="0.8" />
            <stop offset="100%" stopColor={themeColor} stopOpacity="0.15" />
          </linearGradient>
        </defs>

        {/* Main Chamfered Outer Border */}
        <path d={borderPath} fill="none" stroke={'url(#' + dynamicGlowGradId + ')'} strokeWidth="1.2" vectorEffect="non-scaling-stroke" />

        {/* Inner Subtle Accent */}
        <path d={innerPath} fill="none" stroke={accentColor} strokeWidth="1" opacity="0.12" vectorEffect="non-scaling-stroke" />

        {/* Inset outline border path */}
        <path d={innerPathInset} fill="none" stroke={accentColor} strokeWidth="0.8" opacity="0.22" vectorEffect="non-scaling-stroke" />

        {/* Glowing Top cyan line decorations (Continuous through double-step corners) */}
        <path d={glowingTL} fill="none" stroke={accentColor} strokeWidth="1.8" style={{ filter: `drop-shadow(0 0 4px ${accentColor})` }} vectorEffect="non-scaling-stroke" />
        <path d={glowingTR} fill="none" stroke={accentColor} strokeWidth="1.8" style={{ filter: `drop-shadow(0 0 4px ${accentColor})` }} vectorEffect="non-scaling-stroke" />

        {/* Bottom Accent Corner Ticks */}
        <path d={dBL} fill="none" stroke={accentColor} strokeWidth="2.5" vectorEffect="non-scaling-stroke" />
        <path d={dBR} fill="none" stroke={accentColor} strokeWidth="2.5" vectorEffect="non-scaling-stroke" />
      </svg>
      {children}
    </div>
  );
};


const SlideshowHeader = ({
  selectedLineId,
  setSelectedLineId,
  lines,
  tDynamic,
  selectedLine,
  formattedDateTime,
  toggleFullscreen,
  isFullscreen,
  navigate,
  t
}: SlideshowHeaderProps) => {
  return (
    <header className="modern-slideshow__header cyber-header relative w-full h-[96px] md:h-[110px] bg-[#020b20] shrink-0 z-50 overflow-hidden select-none" style={{ boxShadow: '0 0 18px rgba(0, 183, 255, .45), inset 0 0 32px rgba(0, 94, 255, .22)' }}>
      {/* Background radial/linear glow */}
      <div
        className="absolute inset-[10px_0] pointer-events-none z-0"
        style={{
          background: 'radial-gradient(circle at 50% 50%, rgba(0, 217, 255, .08), transparent 31%), linear-gradient(90deg, rgba(7, 75, 173, .12), transparent 18%, transparent 82%, rgba(7, 75, 173, .12))'
        }}
      />

      {/* Cyber SVG Graphics */}
      <svg className="absolute inset-0 w-full h-full pointer-events-none z-0" viewBox="0 0 2048 116" preserveAspectRatio="none" aria-hidden="true">
        <defs>
          <linearGradient id="bg" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0" stopColor="#04122d" />
            <stop offset="0.5" stopColor="#020b20" />
            <stop offset="1" stopColor="#04122d" />
          </linearGradient>
          <linearGradient id="cyan-grad" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0" stopColor="#0385ff" />
            <stop offset="0.5" stopColor="#00f3ff" />
            <stop offset="1" stopColor="#0385ff" />
          </linearGradient>
          <filter id="glow" x="-30%" y="-30%" width="160%" height="160%">
            <feGaussianBlur stdDeviation="3.4" result="b" />
            <feMerge>
              <feMergeNode in="b" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
          <filter id="softGlow" x="-30%" y="-30%" width="160%" height="160%">
            <feGaussianBlur stdDeviation="8" result="b" />
            <feMerge>
              <feMergeNode in="b" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        <path d="M0 0H760L824 94H1222L1286 0H2048V116H0Z" fill="url(#bg)" />
        <path d="M0 16H365L373 22H774L824 96H1221L1273 22H1656L1664 14H2048" fill="none" stroke="#0ca9ff" strokeWidth="2" opacity=".75" />
        <path d="M0 102L12 114H972M1090 114H2035L2048 102" fill="none" stroke="#00f4ff" strokeWidth="3" filter="url(#glow)" />
        <path d="M0 0H760L824 94H1222L1286 0H2048" fill="none" stroke="#00efff" strokeWidth="2.5" filter="url(#glow)" />
        <path d="M674 0H760L824 94H1222L1286 0H1369" fill="none" stroke="#00efff" strokeWidth="3" filter="url(#softGlow)" />

        {/* left decorative block */}
        <g opacity=".95" fill="none" stroke="url(#cyan-grad)">
          {/* 9 chevrons with fading opacity and stroke width closer to the box */}
          {Array.from({ length: 9 }).map((_, j) => {
            const xTop = 620 - j * 10;
            const xBot = xTop + 30;
            const opacity = 0.95 - j * 0.1;
            const strokeWidth = 2.4 - j * 0.15;
            return (
              <line
                key={`chevron-l-${j}`}
                x1={xTop}
                y1={28}
                x2={xBot}
                y2={72}
                strokeWidth={strokeWidth}
                opacity={opacity}
              />
            );
          })}
          {/* Filled box */}
          <path
            d="M630 28h116l30 44H660z"
            fill="url(#cyan-grad)"
            fillOpacity="0.12"
            strokeWidth={2}
            opacity=".65"
          />
          <path d="M679 17h72" strokeWidth={2} />
        </g>

        {/* right decorative block */}
        <g opacity=".95" fill="none" stroke="url(#cyan-grad)">
          {/* 9 chevrons with fading opacity and stroke width closer to the box */}
          {Array.from({ length: 9 }).map((_, j) => {
            const xTop = 1427 + j * 10;
            const xBot = xTop - 30;
            const opacity = 0.95 - j * 0.1;
            const strokeWidth = 2.4 - j * 0.15;
            return (
              <line
                key={`chevron-r-${j}`}
                x1={xTop}
                y1={28}
                x2={xBot}
                y2={72}
                strokeWidth={strokeWidth}
                opacity={opacity}
              />
            );
          })}
          {/* Filled box */}
          <path
            d="M1417 28h-116l-30 44h116z"
            fill="url(#cyan-grad)"
            fillOpacity="0.12"
            strokeWidth={2}
            opacity=".65"
          />
          <path d="M1368 17h-72" strokeWidth={2} />
        </g>
      </svg>

      {/* Interactive Controls & Content Layout */}
      <div
        className="modern-slideshow__header-content relative w-full h-full z-10 px-10"
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr minmax(360px, 650px) 1fr',
          alignItems: 'center',
          gap: '24px'
        }}
      >
        {/* Left Controls: Custom select dropdown */}
        <div className="flex items-center gap-[18px]">
          <span
            className="text-[#fff] font-black tracking-[0.08em] uppercase"
            style={{
              fontSize: 'clamp(15px, 1.05vw, 20px)',
              textShadow: '0 0 9px rgba(255,255,255,0.55)'
            }}
          >
            {t('slideshow.lineLabel')}
          </span>
          <div
            className="relative flex items-center bg-gradient-to-b from-[#063558]/65 to-[#03132b]/76 min-w-[208px] h-[50px] rounded border-[1.5px] border-[#00c9f8] px-3.5 shadow-[0_0_10px_rgba(0,221,255,0.45),_inset_0_0_15px_rgba(0,130,255,0.13)] cursor-pointer"
          >
            <select
              value={selectedLineId}
              onChange={(e) => setSelectedLineId(e.target.value)}
              className="appearance-none bg-transparent text-[#00eaff] text-[20px] font-bold uppercase pl-1 pr-8 py-1 w-full focus:outline-none cursor-pointer select-none"
            >
              <option value="all" className="bg-[#020b20] text-[#00eaff] uppercase">{t('slideshow.all', 'TẤT CẢ')}</option>
              {lines?.map((line) => (
                <option key={line.id} value={line.id} className="bg-[#020b20] text-[#00eaff] uppercase">
                  {tDynamic(line.name)}
                </option>
              ))}
            </select>
            <div className="absolute right-3.5 top-1/2 -translate-y-1/2 pointer-events-none text-[#00eaff]">
              <svg className="w-[22px] fill-current" viewBox="0 0 24 24" aria-hidden="true">
                <path d="M6 9l6 7 6-7z" />
              </svg>
            </div>
          </div>
        </div>

        {/* Center Title */}
        <div className="pointer-events-none">
          <h1
            className="text-center font-black tracking-[0.25em] text-white uppercase whitespace-nowrap"
            style={{
              fontSize: 'clamp(25px, 2vw, 34px)',
              lineHeight: '1',
              textShadow: '0 0 4px #fff, 0 0 14px rgba(0, 238, 255, 0.95), 0 0 28px rgba(0, 148, 255, 0.75)'
            }}
          >
            {selectedLineId === 'all'
              ? t('slideshow.title', 'AUTOMATION')
              : tDynamic(selectedLine?.name || '')}
          </h1>
        </div>

        {/* Right Actions (Clock & Controls) */}
        <div className="flex items-center justify-end gap-[22px]">
          {/* Clock Display */}
          <div
            className="flex items-center gap-[12px] text-[#00eaff] font-extrabold"
            style={{
              fontSize: 'clamp(14px, 1.05vw, 20px)',
              textShadow: '0 0 10px rgba(0, 222, 255, 0.7)'
            }}
          >
            <svg className="w-6 h-6 fill-none stroke-current stroke-[2.2] stroke-linecap-round stroke-linejoin-round" viewBox="0 0 24 24" aria-hidden="true">
              <circle cx="12" cy="12" r="8.5" />
              <path d="M12 7v5l3 2" />
            </svg>
            <span className="font-mono">{formattedDateTime}</span>
          </div>

          {/* Fullscreen Button */}
          <button
            onClick={toggleFullscreen}
            className="w-[51px] h-[51px] p-[12px] rounded border-[1.5px] border-[#08bce8] bg-gradient-to-b from-[#07375d]/65 to-[#031027]/80 text-[#00eaff] hover:text-white transition-all shadow-[0_0_10px_rgba(0,220,255,0.35),_inset_0_0_12px_rgba(0,123,255,0.14)] cursor-pointer"
            title={isFullscreen ? 'Thoát toàn màn hình' : 'Bật toàn màn hình'}
          >
            <svg viewBox="0 0 24 24" aria-hidden="true" className="w-full h-full fill-none stroke-current stroke-[2.4] stroke-linecap-square">
              <path d="M8 3H3v5M16 3h5v5M8 21H3v-5M16 21h5v-5" />
              <path d="M3 8l6-5M21 8l-6-5M3 16l6 5M21 16l-6 5" />
            </svg>
          </button>

          {/* Exit Button */}
          <button
            onClick={() => {
              if (document.fullscreenElement) {
                document.exitFullscreen().catch(() => { });
              }
              navigate('/');
            }}
            className="w-[51px] h-[51px] p-[12px] rounded border-[1.5px] border-[#ff0b55]/80 bg-gradient-to-b from-[#07375d]/65 to-[#031027]/80 text-[#ff0b55] hover:text-white transition-all shadow-[0_0_11px_rgba(255,0,81,0.25),_inset_0_0_12px_rgba(255,0,81,0.08)] cursor-pointer"
            title={t('slideshow.exitSlideshow')}
          >
            <svg viewBox="0 0 24 24" aria-hidden="true" className="w-full h-full fill-none stroke-current stroke-[2.4]">
              <path d="M5 5l14 14M19 5L5 19" />
            </svg>
          </button>
        </div>
      </div>
    </header>
  );
};

export const SlideshowPage = () => {
  const { t } = useTranslation();
  const { tDynamic } = useDynamicTranslation();
  const navigate = useNavigate();

  // Selected line state
  const [selectedLineId, setSelectedLineId] = useState<string>('all');
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [time, setTime] = useState(new Date());

  // Update clock every second
  useEffect(() => {
    const timer = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  // Monitor fullscreen
  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, []);

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => { });
    } else {
      document.exitFullscreen().catch(() => { });
    }
  };

  // Queries
  const { isLoading: isDashboardLoading } = useQuery({
    queryKey: ['dashboardSummary'],
    queryFn: dashboardApi.getSummary,
    refetchInterval: 2000,
  });

  const { data: lines, isLoading: isLinesLoading } = useQuery({
    queryKey: queryKeys.lines.list(),
    queryFn: linesApi.getAll,
    refetchInterval: queryTimings.lines,
  });

  const lineMachinesQueries = useQueries({
    queries: (lines || []).map((line) => ({
      queryKey: ['line-machines', line.id],
      queryFn: () => linesApi.getMachines(line.id),
      refetchInterval: 2000,
      enabled: !!lines,
    })),
  });

  const { data: telemetryMap = {} } = useQuery({
    queryKey: ['simulation-all-telemetry'],
    queryFn: getSimulationAll,
    refetchInterval: 2000,
  });

  const { data: reportsDailyData } = useQuery<SlideshowReportData>({
    queryKey: ['reports-daily-slideshow', selectedLineId],
    queryFn: () =>
      api.get<SlideshowReportData>('/reports/query', {
        params: {
          timeRange: 'last_7_days',
          lineId: selectedLineId || 'all',
          machineId: 'all',
          groupBy: 'day',
        },
      }).then(res => res.data),
    refetchInterval: 5000,
  });

  const activeLineMachines = useMemo<SlideshowMachine[]>(() => {
    if (selectedLineId === 'all') return [];
    const selectedIdx = lines?.findIndex(l => l.id === selectedLineId);
    if (selectedIdx === undefined || selectedIdx === -1) return [];
    return lineMachinesQueries[selectedIdx]?.data || [];
  }, [selectedLineId, lines, lineMachinesQueries]);

  // Helper to gather all machines across all lines
  const allMachines = useMemo<SlideshowMachine[]>(() => {
    const list: SlideshowMachine[] = [];
    lineMachinesQueries.forEach((q) => {
      if (q.data) {
        list.push(...q.data);
      }
    });
    return list;
  }, [lineMachinesQueries]);

  // Calculate lines analytics (fetched dynamically from database)
  const linesAnalytics = useMemo(() => {
    if (!lines || lineMachinesQueries.some(q => q.isLoading || !q.data)) return [];

    return lines.map((line, idx) => {
      const machines: SlideshowMachine[] = lineMachinesQueries[idx].data || [];
      const totalMachines = machines.length;
      const sortedMachines = [...machines].sort((a, b) => (a.sequenceOrder ?? 0) - (b.sequenceOrder ?? 0));
      const lastMachine = sortedMachines.length > 0 ? sortedMachines[sortedMachines.length - 1] : null;

      // Calculate stats
      let oeeSum = 0;
      let yieldSum = 0;
      let uphSum = 0;
      let approvedCount = 0;
      let hasError = false;
      let hasRunning = false;
      let hasIdle = false;

      machines.forEach((m) => {
        if (m.approvalStatus.toLowerCase() === 'approved') {
          approvedCount++;
          const oeeVal = Number(m.lastPlcData?.production?.oee ?? m.lastPlcData?.tags?.oee ?? 0);
          const yieldVal = Number(m.lastPlcData?.production?.yieldRate ?? m.lastPlcData?.tags?.yieldRate ?? 0);
          const uphVal = Number(m.lastPlcData?.production?.uph ?? m.lastPlcData?.tags?.uph ?? 0);
          oeeSum += oeeVal;
          yieldSum += yieldVal;
          uphSum += uphVal;

          const machineStatus = m.status.toLowerCase();
          if (machineStatus === 'error') hasError = true;
          if (machineStatus === 'running' || machineStatus === 'đang chạy') hasRunning = true;
          if (machineStatus === 'idle' || machineStatus === 'chờ') hasIdle = true;
        }
      });

      const lineOee = approvedCount > 0 ? oeeSum / approvedCount : 0.0;
      const lineYield = approvedCount > 0 ? yieldSum / approvedCount : 100.0;
      const lineUph = approvedCount > 0 ? Math.round(uphSum / approvedCount) : 0;
      const lineOutput = lastMachine
        ? (lastMachine.lastPlcData?.productionCount ?? lastMachine.productionCount ?? 0)
        : 0;

      let status = 'offline';
      if (hasError) status = 'error';
      else if (hasRunning) status = 'running';
      else if (hasIdle) status = 'idle';

      return {
        ...line,
        oee: Math.round(lineOee * 10) / 10,
        output: lineOutput,
        uph: lineUph,
        yieldRate: Math.round(lineYield * 10) / 10,
        totalMachines,
        status,
        lastMachine,
      };
    });
  }, [lines, lineMachinesQueries]);

  // Aggregate Metrics computed dynamically from active line / machines
  const selectedMetrics = useMemo(() => {
    if (selectedLineId === 'all') {
      let totalOutput = 0;
      let oeeSum = 0;
      let uphSum = 0;
      let yieldSum = 0;
      let approvedCount = 0;

      linesAnalytics.forEach((l) => {
        totalOutput += l.output;
      });

      allMachines.forEach((m) => {
        if (m.approvalStatus.toLowerCase() === 'approved') {
          approvedCount++;
          const oeeVal = Number(m.lastPlcData?.production?.oee ?? m.lastPlcData?.tags?.oee ?? 0);
          const yieldVal = Number(m.lastPlcData?.production?.yieldRate ?? m.lastPlcData?.tags?.yieldRate ?? 0);
          const uphVal = Number(m.lastPlcData?.production?.uph ?? m.lastPlcData?.tags?.uph ?? 0);
          oeeSum += oeeVal;
          yieldSum += yieldVal;
          uphSum += uphVal;
        }
      });

      const avgOee = approvedCount > 0 ? oeeSum / approvedCount : 0.0;
      const avgYield = approvedCount > 0 ? yieldSum / approvedCount : 100.0;
      const avgUph = approvedCount > 0 ? uphSum / approvedCount : 0;

      return {
        output: totalOutput,
        oee: Math.round(avgOee * 10) / 10,
        uph: Math.round(avgUph),
        yieldRate: Math.round(avgYield * 10) / 10,
        assembly: 0,
      };
    } else {
      const line = linesAnalytics.find((l) => l.id === selectedLineId);
      if (!line) {
        return { output: 0, oee: 0.0, uph: 0, yieldRate: 100.0, assembly: 0 };
      }
      return {
        output: line.output,
        oee: line.oee,
        uph: line.uph,
        yieldRate: line.yieldRate,
        assembly: 0,
      };
    }
  }, [selectedLineId, linesAnalytics, allMachines]);

  const targetOutput = useMemo(() => {
    let activeCount = 0;
    allMachines.forEach((m) => {
      if (m.approvalStatus.toLowerCase() === 'approved') {
        activeCount++;
      }
    });
    return activeCount * 1500 || 10000;
  }, [allMachines]);

  const outputProgress = useMemo(() => {
    if (selectedMetrics.output === 0) {
      return {
        percent: 0,
        text: '0.0%',
        subtext: '0 PCS'
      };
    }
    const target = selectedLineId === 'all' ? targetOutput : 1500;
    const pct = Math.round((selectedMetrics.output / target) * 1000) / 10;
    return {
      percent: Math.min(100, Math.round(pct)),
      text: `${pct.toFixed(1)}%`,
      subtext: `${selectedMetrics.output} PCS`
    };
  }, [selectedMetrics.output, selectedLineId, targetOutput]);

  // Selected line object for header display
  const selectedLine = useMemo(() => {
    return lines?.find(l => l.id === selectedLineId);
  }, [selectedLineId, lines]);

  // Get active items for Left panels (fetched dynamically from database)
  const leftPanelData = useMemo(() => {
    if (selectedLineId === 'all') {
      const oeeItems = linesAnalytics.map(l => {
        const oeeVal = Number(l.oee || 0);
        return {
          name: tDynamic(l.name),
          val: oeeVal,
          displayVal: `${oeeVal.toFixed(1)}%`,
          percent: oeeVal,
          color: oeeVal >= 90 ? '#00e676' : (oeeVal >= 75 ? '#ffc107' : '#ff5c6c'),
        };
      });

      const uphItems = linesAnalytics.map(l => {
        const uphVal = Number(l.uph || 0);
        return {
          name: tDynamic(l.name),
          val: uphVal,
          displayVal: `${uphVal} UPH`,
          percent: uphVal,
          color: '#2F7BFF',
        };
      });

      return {
        oeeTitle: t('slideshow.oeeTitleAll', 'Tỷ lệ OEE các Dây chuyền'),
        uphTitle: t('slideshow.uphTitleAll', 'Tốc độ UPH các Dây chuyền'),
        oeeItems,
        uphItems,
      };
    } else {
      const selectedIdx = lines?.findIndex(l => l.id === selectedLineId);
      const machines = (selectedIdx !== undefined && selectedIdx !== -1) ? (lineMachinesQueries[selectedIdx]?.data || []) : [];

      const oeeItems = machines.map(m => {
        const oeeVal = Number(m.lastPlcData?.production?.oee ?? m.lastPlcData?.tags?.oee ?? 0);
        return {
          name: m.name,
          val: oeeVal,
          displayVal: `${oeeVal.toFixed(1)}%`,
          percent: oeeVal,
          color: oeeVal >= 90 ? '#00e676' : (oeeVal >= 75 ? '#ffc107' : '#ff5c6c'),
        };
      });

      const uphItems = machines.map(m => {
        const uphVal = Number(m.lastPlcData?.production?.uph ?? m.lastPlcData?.tags?.uph ?? 0);
        return {
          name: m.name,
          val: uphVal,
          displayVal: `${uphVal} UPH`,
          percent: uphVal,
          color: '#2F7BFF',
        };
      });

      return {
        oeeTitle: t('slideshow.oeeTitleLine', 'Chỉ số OEE các Thiết bị'),
        uphTitle: t('slideshow.uphTitleLine', 'Tốc độ UPH các Thiết bị'),
        oeeItems,
        uphItems,
      };
    }
  }, [selectedLineId, lines, linesAnalytics, lineMachinesQueries, t, tDynamic]);

  // Panel M2: Output / Target achievement (fetched from reportsDailyData)
  const outputChartData = useMemo(() => {
    if (!reportsDailyData?.chartData || reportsDailyData.chartData.length === 0) {
      // Return 7 days of 0 values
      const chart = [];
      for (let i = 6; i >= 0; i--) {
        const d = new Date();
        d.setDate(d.getDate() - i);
        const label = `${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
        chart.push({
          date: label,
          output: 0,
          rate: 0,
        });
      }
      return chart;
    }

    return reportsDailyData.chartData.map((item) => {
      const dateParts = item.date ? item.date.split('-') : [];
      const label = dateParts.length >= 3 ? `${dateParts[1]}-${dateParts[2]}` : (item.date || '');
      const outVal = Number(item.output || 0);
      const tarVal = Number(item.target || 0);
      const rateVal = tarVal > 0 ? Math.min(150, Math.round((outVal / tarVal) * 1000) / 10) : 0;
      return {
        date: label,
        output: outVal,
        rate: rateVal,
      };
    });
  }, [reportsDailyData]);

  // Panel R1: Radar Performance Indicators
  const radarData = useMemo(() => {
    const hasProduction = selectedMetrics.output > 0;
    const yieldScore = hasProduction ? selectedMetrics.yieldRate : 0;
    const oeeScore = selectedMetrics.oee;
    const uptimeScore = oeeScore > 0 ? Math.min(100, Math.round(oeeScore * 1.08)) : 0;
    const uphScore = selectedMetrics.uph > 0 ? Math.min(100, Math.round((selectedMetrics.uph / 500) * 100)) : 0;
    const productivityScore = oeeScore > 0 ? Math.min(100, Math.round(oeeScore * 0.98)) : 0;
    const multiskillScore = oeeScore > 0 ? Math.min(100, Math.round(80 + (oeeScore % 10))) : 0;

    return [
      { subject: 'OEE', score: Math.round(oeeScore), fullMark: 100 },
      { subject: 'Tỷ lệ đạt', score: Math.round(yieldScore), fullMark: 100 },
      { subject: 'Tỷ lệ chạy máy', score: uptimeScore, fullMark: 100 },
      { subject: 'Đạt UPH', score: uphScore, fullMark: 100 },
      { subject: 'Năng suất', score: productivityScore, fullMark: 100 },
      { subject: 'Tỷ lệ đa năng', score: multiskillScore, fullMark: 100 },
    ];
  }, [selectedMetrics]);


  const renderMetricCard = (value: number, centerText: string, text: string, label: string, color: string) => {
    const progress = Math.max(0, Math.min(100, value));

    return (
      <article className="modern-slideshow__metric-card" style={{ borderTopColor: color }}>
        <span className="modern-slideshow__metric-label">{label}</span>
        <strong className="modern-slideshow__metric-value">{centerText}</strong>
        <span className="modern-slideshow__metric-unit">{text}</span>
        <div className="modern-slideshow__metric-progress" aria-hidden="true">
          <span style={{ width: `${progress}%`, backgroundColor: color }} />
        </div>
      </article>
    );
  };

  if (isDashboardLoading || isLinesLoading) {
    return (
      <div className="modern-slideshow__loading flex h-screen w-screen items-center justify-center bg-[#070707] text-[#ef4444]">
        <div className="flex flex-col items-center gap-3">
          <RefreshCw className="h-10 w-10 animate-spin" />
          <span className="text-sm font-semibold tracking-wider uppercase">{t('dashboard.loading', 'Khởi tạo màn hình trình chiếu...')}</span>
        </div>
      </div>
    );
  }

  // Localized date formatting matching Chinese image style: 2026-06-17 17:08
  const formattedDateTime = `${time.getFullYear()}-${String(time.getMonth() + 1).padStart(2, '0')}-${String(time.getDate()).padStart(2, '0')} ${String(time.getHours()).padStart(2, '0')}:${String(time.getMinutes()).padStart(2, '0')}:${String(time.getSeconds()).padStart(2, '0')}`;

  return (
    <div
      className="modern-slideshow fixed inset-0 h-screen w-screen text-[#c1d3ee] flex flex-col overflow-hidden font-sans select-none z-[999]"
      style={{
        background: '#070707'
      }}
    >
      <style>{`
        .cyber-header {
          position: relative;
          background: linear-gradient(180deg, rgba(16, 29, 61, 0.9) 0%, rgba(7, 13, 30, 0.9) 100%);
          border-bottom: 2px solid #14356a;
          box-shadow: 0 0 15px rgba(20, 53, 106, 0.4);
        }
        .cyber-panel {
          background: rgba(10, 17, 39, 0.85);
          border: 1px solid #14356a;
          box-shadow: inset 0 0 10px rgba(20, 53, 106, 0.3);
          position: relative;
        }
        .cyber-panel::before {
          content: '';
          position: absolute;
          top: 0; left: 0;
          width: 8px; height: 8px;
          border-top: 2px solid #00f0ff;
          border-left: 2px solid #00f0ff;
        }
        .cyber-panel::after {
          content: '';
          position: absolute;
          bottom: 0; right: 0;
          width: 8px; height: 8px;
          border-bottom: 2px solid #00f0ff;
          border-right: 2px solid #00f0ff;
        }
        .cyber-panel-title {
          font-weight: 900;
          letter-spacing: 0.1em;
          text-transform: uppercase;
          color: #00f0ff;
          border-bottom: 1px solid rgba(20, 53, 106, 0.5);
          padding-bottom: 6px;
          margin-bottom: 10px;
          display: flex;
          align-items: center;
          gap: 6px;
          font-size: 15px;
        }
        .custom-select {
          background: #0f1c3f;
          border: 1px solid #1d3e7a;
          color: #00f0ff;
          border-radius: 4px;
          outline: none;
          cursor: pointer;
        }
        .scrollable-content::-webkit-scrollbar {
          width: 4px;
        }
        .scrollable-content::-webkit-scrollbar-track {
          background: rgba(20, 53, 106, 0.1);
        }
        .scrollable-content::-webkit-scrollbar-thumb {
          background: #14356a;
          border-radius: 2px;
        }
        .slideshow-diagram-container .flex.items-center.justify-between.px-6.py-4 {
          display: none !important;
        }
      `}</style>

      <SlideshowHeader
        selectedLineId={selectedLineId}
        setSelectedLineId={setSelectedLineId}
        lines={lines}
        tDynamic={tDynamic}
        selectedLine={selectedLine}
        formattedDateTime={formattedDateTime}
        toggleFullscreen={toggleFullscreen}
        isFullscreen={isFullscreen}
        navigate={navigate}
        t={t}
      />

      {/* Main 3-Column Grid Dashboard Body */}
      <div className="modern-slideshow__content flex-1 flex min-h-0 gap-3.5 p-3.5 pt-2">

        {/* COLUMN 1: LEFT PANEL COLUMN (24.5% Width) */}
        <div className="modern-slideshow__column modern-slideshow__column--left w-[24.5%] h-full flex flex-col gap-3.5 shrink-0 min-h-0">

          {/* L1: OEE Status */}
          <SlideshowFuturisticCard className="p-4 flex flex-col min-h-0 relative flex-[51]">
            <div className="cyber-panel-title justify-between">
              <div className="flex items-center gap-1.5">
                <span className="text-[12px] font-black text-cyan-400 mr-1.5">■</span>
                {leftPanelData.oeeTitle.toUpperCase()}
              </div>
              <div className="text-cyan-400/50 font-mono text-[8px] tracking-tight mr-1 select-none">
                /////
              </div>
            </div>
            <HoneycombPattern />
            <div className="flex-1 overflow-y-auto pr-1 scrollable-content flex flex-col justify-start gap-3">
              {leftPanelData.oeeItems.slice(0, 8).map((d, idx) => (
                <div key={d.name + idx} className="flex flex-col gap-1.5 text-[12px]">
                  <div className="flex justify-between font-bold text-slate-300">
                    <span className="truncate max-w-[120px]" title={d.name}>{d.name}</span>
                    <span>{d.displayVal}</span>
                  </div>
                  <div className="w-full h-1.5 bg-[#0f172a] rounded overflow-hidden">
                    <div
                      className="h-full rounded transition-all duration-1000"
                      style={{ width: `${Math.min(100, d.percent)}%`, backgroundColor: d.color }}
                    />
                  </div>
                </div>
              ))}
              {leftPanelData.oeeItems.length === 0 && (
                <div className="flex-1 flex items-center justify-center text-xs text-slate-500">
                  {t('common.status.noData', 'Không có dữ liệu')}
                </div>
              )}
            </div>
          </SlideshowFuturisticCard>

          {/* L2: UPH Speed Rate */}
          <SlideshowFuturisticCard className="p-4 flex flex-col min-h-0 relative flex-[49]">
            <div className="cyber-panel-title justify-between">
              <div className="flex items-center gap-1.5">
                <span className="text-[12px] font-black text-cyan-400 mr-1.5">■</span>
                {leftPanelData.uphTitle.toUpperCase()}
              </div>
              <div className="text-cyan-400/50 font-mono text-[8px] tracking-tight mr-1 select-none">
                /////
              </div>
            </div>
            <FactorySkyline />
            <div className="flex-1 overflow-y-auto pr-1 scrollable-content flex flex-col justify-start gap-3">
              {leftPanelData.uphItems.slice(0, 8).map((d, idx) => (
                <div key={d.name + idx} className="flex flex-col gap-1.5 text-[12px]">
                  <div className="flex justify-between font-bold text-slate-300">
                    <span className="truncate max-w-[120px]" title={d.name}>{d.name}</span>
                    <span style={{ color: d.color }}>{d.displayVal}</span>
                  </div>
                  <div className="w-full h-1.5 bg-[#0f172a] rounded overflow-hidden">
                    <div
                      className="h-full rounded transition-all duration-1000"
                      style={{ width: `${Math.min(100, d.percent)}%`, backgroundColor: d.color }}
                    />
                  </div>
                </div>
              ))}
              {leftPanelData.uphItems.length === 0 && (
                <div className="flex-1 flex items-center justify-center text-xs text-slate-500">
                  {t('common.status.noData', 'Không có dữ liệu')}
                </div>
              )}
            </div>
          </SlideshowFuturisticCard>
        </div>

        {/* COLUMN 2: MIDDLE CHART COLUMN (49.5% Width) */}
        <div className="modern-slideshow__column modern-slideshow__column--main w-[49.5%] h-full flex flex-col gap-3.5 min-h-0">

          {/* M1: Key production metrics */}
          <SlideshowFuturisticCard className="modern-slideshow__metrics-panel p-4 shrink-0 h-[190px]">
            <div className="modern-slideshow__metrics">
              {renderMetricCard(
                outputProgress.percent,
                outputProgress.text,
                outputProgress.subtext,
                'SẢN LƯỢNG',
                '#4ec798'
              )}
              {renderMetricCard(
                selectedMetrics.yieldRate,
                `${selectedMetrics.yieldRate.toFixed(1)}%`,
                'Tỷ lệ đạt',
                'TỶ LỆ ĐẠT',
                '#ef4444'
              )}
              {renderMetricCard(
                selectedMetrics.uph,
                `${selectedMetrics.uph}`,
                'Đơn vị / giờ',
                'UPH',
                '#ff8a8c'
              )}
              {renderMetricCard(
                selectedMetrics.oee,
                `${selectedMetrics.oee.toFixed(1)}%`,
                'Hiệu suất thiết bị',
                'OEE',
                '#ef4444'
              )}
            </div>
          </SlideshowFuturisticCard>

          {/* Graphic divider between gauges and composed chart */}
          <CyberDivider />

          {/* M2: Composed Output Chart */}
          <SlideshowFuturisticCard variant="gauges" className="p-4 flex flex-col min-h-0 flex-1">
            <div className="cyber-panel-title justify-between">
              <div className="flex items-center gap-1.5">
                <span className="text-[12px] font-black text-cyan-400 mr-1.5">■</span>
                {t('slideshow.outputAchieved')}
              </div>
              <div className="text-cyan-400/50 font-mono text-[8px] tracking-tight mr-1 select-none">
                /////
              </div>
            </div>
            <div className="flex-1 min-h-0 w-full flex flex-col justify-between">
              <div className="flex justify-center items-center gap-6 text-[12px] font-bold mb-2 select-none">
                <div className="flex items-center gap-1.5">
                  <div className="w-3 h-3 bg-[#ef4444] rounded-sm" />
                  <span className="text-slate-300">{t('slideshow.outputPcs')}</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <div className="w-3 h-0.5 bg-[#00e676] relative flex items-center justify-center">
                    <div className="w-1.5 h-1.5 rounded-full bg-[#00e676]" />
                  </div>
                  <span className="text-slate-300">{t('slideshow.completionRate')}</span>
                </div>
              </div>
              <div className="flex-1 min-h-0 w-full">
                <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0} className="pointer-events-none">
                  <ComposedChart data={outputChartData} margin={{ top: 25, right: 25, left: 10, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(255, 255, 255, 0.12)" />
                    <XAxis dataKey="date" stroke="#a4a4a4" fontSize={12} tickLine={false} />
                    <YAxis yAxisId="left" stroke="#a4a4a4" fontSize={12} tickLine={false} />
                    <YAxis yAxisId="right" orientation="right" stroke="#a4a4a4" fontSize={12} tickLine={false} domain={[0, 150]} />
                    <Bar yAxisId="left" dataKey="output" fill="#ef4444" radius={[4, 4, 0, 0]} barSize={28} />
                    <Line yAxisId="right" dataKey="rate" stroke="#00e676" strokeWidth={1.8} dot={{ fill: '#00e676', r: 2.5 }} />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            </div>
          </SlideshowFuturisticCard>



        </div>

        {/* COLUMN 3: RIGHT PANEL COLUMN (26% Width) */}
        <div className="modern-slideshow__column modern-slideshow__column--right w-[26%] h-full flex flex-col gap-3.5 shrink-0 min-h-0">

          {/* R1: Radar Performance chart */}
          <SlideshowFuturisticCard className="p-4 flex flex-col min-h-0 flex-[55]">
            <div className="cyber-panel-title justify-between">
              <div className="flex items-center gap-1.5">
                <span className="text-[12px] font-black text-cyan-400 mr-1.5">■</span>
                {t('slideshow.performanceRadar')}
              </div>
              <div className="text-cyan-400/50 font-mono text-[8px] tracking-tight mr-1 select-none">
                /////
              </div>
            </div>
            <div className="flex-1 min-h-0 w-full flex items-center justify-center">
              <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0} className="pointer-events-none">
                <RadarChart cx="50%" cy="50%" outerRadius="70%" data={radarData}>
                  <PolarGrid stroke="rgba(255, 255, 255, 0.18)" />
                  <PolarAngleAxis dataKey="subject" stroke="#a4a4a4" fontSize={12} />
                  <PolarRadiusAxis angle={30} domain={[0, 100]} stroke="rgba(255, 255, 255, 0.15)" tick={false} />
                  <Radar name="Indicators" dataKey="score" stroke="#ef4444" fill="#ef4444" fillOpacity={0.22} />
                </RadarChart>
              </ResponsiveContainer>
            </div>
          </SlideshowFuturisticCard>

          {/* R2: Production Efficiency list table or Machine list table */}
          <SlideshowFuturisticCard className="p-4 flex flex-col min-h-0 flex-[45]">
            <div className="cyber-panel-title justify-between">
              <div className="flex items-center gap-1.5">
                <span className="text-[12px] font-black text-cyan-400 mr-1.5">■</span>
                {selectedLineId === 'all' ? 'HIỆU SUẤT SẢN XUẤT' : 'DANH SÁCH MÁY'}
              </div>
              <div className="text-cyan-400/50 font-mono text-[8px] tracking-tight mr-1 select-none">
                /////
              </div>
            </div>
            <div className="flex-1 overflow-y-auto scrollable-content text-[13px]">
              {selectedLineId === 'all' ? (
                <table className="w-full border-collapse">
                  <thead>
                    <tr className="border-b border-[#14356a]/60 text-slate-400 font-bold">
                      <th className="py-2 text-left">{t('slideshow.table.no')}</th>
                      <th className="py-2 text-left">{t('slideshow.table.line')}</th>
                      <th className="py-2 text-right">{t('slideshow.table.output')}</th>
                      <th className="py-2 text-right">{t('slideshow.table.efficiency')}</th>
                      <th className="py-2 text-center">{t('slideshow.table.status')}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#14356a]/20 font-mono text-slate-300">
                    {linesAnalytics.map((line, idx) => {
                      const statusClass = line.status === 'running' ? 'text-[#00e676]' : 'text-[#ff5c6c]';
                      const efficiencyVal = line.oee > 0 ? (line.oee * 1.3).toFixed(2) : '0.00';
                      return (
                        <tr key={line.id} className="hover:bg-[#14356a]/15 transition-all">
                          <td className="py-2">{idx + 21}</td>
                          <td className="py-2 font-sans font-bold max-w-[80px] truncate" title={tDynamic(line.name)}>
                            {tDynamic(line.name)}
                          </td>
                          <td className="py-2 text-right">{line.output}</td>
                          <td className="py-2 text-right">{efficiencyVal}%</td>
                          <td className="py-2 text-center">
                            <span className={`font-black ${statusClass}`}>
                              {line.status === 'running' ? '●' : '▲'}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                    {linesAnalytics.length === 0 && (
                      <tr>
                        <td colSpan={5} className="py-6 text-center text-slate-500 uppercase tracking-widest">
                          {t('common.status.noData', 'Không có dữ liệu')}
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              ) : (
                <table className="w-full border-collapse">
                  <thead>
                    <tr className="border-b border-[#14356a]/60 text-slate-400 font-bold">
                      <th className="py-2 text-left">{t('slideshow.table.no')}</th>
                      <th className="py-2 text-left">{t('slideshow.table.station')}</th>
                      <th className="py-2 text-right">{t('slideshow.table.output')}</th>
                      <th className="py-2 text-center">{t('slideshow.table.status')}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#14356a]/20 font-mono text-slate-300">
                    {activeLineMachines.map((m, idx) => {
                      const telemetry: SimulationData | undefined = telemetryMap[m.id];
                      const statusStr = String(telemetry?.status ?? m.status ?? '').toLowerCase();
                      const isRunning = statusStr === 'running' || statusStr === 'đang chạy';
                      const statusClass = isRunning ? 'text-[#00e676]' : 'text-[#ff5c6c]';
                      const prodQty = telemetry?.productionCount
                        ?? m.productionCount
                        ?? m.lastPlcData?.productionCount
                        ?? 0;
                      return (
                        <tr key={m.id} className="hover:bg-[#14356a]/15 transition-all">
                          <td className="py-2">{String(idx + 1).padStart(2, '0')}</td>
                          <td className="py-2 font-sans font-bold max-w-[120px] truncate" title={tDynamic(m.name)}>
                            {tDynamic(m.name)}
                          </td>
                          <td className="py-2 text-right">{prodQty.toLocaleString()}</td>
                          <td className="py-2 text-center">
                            <span className={`font-black ${statusClass}`}>
                              {isRunning ? '●' : '▲'}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                    {activeLineMachines.length === 0 && (
                      <tr>
                        <td colSpan={4} className="py-6 text-center text-slate-500 uppercase tracking-widest">
                          {t('common.status.noData', 'Không có dữ liệu')}
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              )}
            </div>
          </SlideshowFuturisticCard>

        </div>

      </div>
    </div>
  );
};

export default SlideshowPage;
