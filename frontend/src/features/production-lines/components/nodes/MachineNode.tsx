import { memo } from 'react';
import { Handle, Position, type NodeProps, type Node } from '@xyflow/react';
import { useTranslation } from 'react-i18next';
import { useDynamicTranslation } from '../../../../shared/lib/translator';

export type MachineNodeData = {
  id: string;
  name: string;
  machineCode: string;
  status: string;
  ip: string;
  productionCount: number;
  telemetry?: any;
  errorCode?: string;
  plcConnected?: boolean;
  plcOnline?: boolean;
};

type MachineNodeProps = NodeProps<Node<MachineNodeData, 'machineNode'>>;

function MachineNodeComponent({ data, selected }: MachineNodeProps) {
  const { t, i18n } = useTranslation();
  const { tDynamic } = useDynamicTranslation();
  const currentLang = i18n.language || 'vi';
  const locale = currentLang === 'zh-CN' || currentLang === 'zh' ? 'zh-CN' : currentLang === 'en' ? 'en-US' : 'vi-VN';
  
  const status = (data.status || 'offline').toLowerCase().trim();
  const isRunning = status === 'running';
  const isIdle = status === 'idle';
  const isError = status === 'error';
  const isWarning = status === 'warning' || status === 'stopped';

  // Determine colors based on status
  let statusColor = '#9CA3AF'; // offline / gray
  let statusText = 'OFFLINE';
  let cardBgClass = 'bg-[#070c1e]/90';
  let cardStrokeColor = 'rgba(20, 53, 106, 0.35)';
  let bracketColor = 'rgba(20, 53, 106, 0.6)';
  let glowClass = '';

  if (isRunning) {
    statusColor = '#00E676';
    statusText = 'RUNNING';
    cardBgClass = 'bg-[#070c1e]/95';
    cardStrokeColor = 'rgba(0, 240, 255, 0.35)';
    bracketColor = '#00f0ff';
    glowClass = 'shadow-[0_0_15px_rgba(0,240,255,0.12)]';
  } else if (isIdle) {
    statusColor = '#38BDF8';
    statusText = 'IDLE';
    cardBgClass = 'bg-[#120f0a]/90';
    cardStrokeColor = 'rgba(245, 158, 11, 0.35)';
    bracketColor = '#f59e0b';
    glowClass = 'shadow-[0_0_12px_rgba(245,158,11,0.08)]';
  } else if (isError) {
    statusColor = '#EF4444';
    statusText = 'ERROR';
    cardBgClass = 'bg-[#1c0f13]/90';
    cardStrokeColor = 'rgba(239, 68, 68, 0.45)';
    bracketColor = '#ef4444';
    glowClass = 'shadow-[0_0_20px_rgba(239,68,68,0.22)]';
  } else if (isWarning) {
    statusColor = '#F59E0B';
    statusText = 'WARNING';
    cardBgClass = 'bg-[#120f0a]/90';
    cardStrokeColor = 'rgba(245, 158, 11, 0.35)';
    bracketColor = '#f59e0b';
    glowClass = 'shadow-[0_0_12px_rgba(245,158,11,0.08)]';
  }

  // Highlight if selected in the React Flow viewport
  if (selected) {
    cardStrokeColor = 'rgba(0, 240, 255, 0.85)';
    bracketColor = '#00f0ff';
    glowClass = 'shadow-[0_0_18px_rgba(0,240,255,0.22)]';
  }

  // Calculate OEE & UPH dynamically
  const prodQty = data.productionCount || 0;
  const oeeVal = data.telemetry?.production?.oee ?? data.telemetry?.tags?.oee ?? 0;
  const uphVal = data.telemetry?.production?.uph ?? data.telemetry?.tags?.uph ?? 0;

  // Render Machine Node
  return (
    <div
      className={`w-[260px] relative p-0.5 flex flex-col justify-between transition-all duration-300 text-left ${cardBgClass} ${glowClass}`}
      style={{ 
        clipPath: 'polygon(4px 0, calc(100% - 4px) 0, 100% 4px, 100% calc(100% - 4px), calc(100% - 4px) 100%, 4px 100%, 0 calc(100% - 4px), 0 4px)' 
      }}
    >
      {/* SVG overlay for slanted corners and double corner brackets */}
      <svg className="absolute inset-0 w-full h-full pointer-events-none z-0" preserveAspectRatio="none" viewBox="0 0 100 100">
        <path 
          d="M 4 1.5 L 96 1.5 L 98.5 4 L 98.5 96 L 96 98.5 L 4 98.5 L 1.5 96 L 1.5 4 Z" 
          fill="none" 
          stroke={cardStrokeColor} 
          strokeWidth={selected ? "1.8" : "1.2"} 
          vectorEffect="non-scaling-stroke"
        />
        {/* Top-Left double corner bracket */}
        <path d="M 1.5 12 L 1.5 4 L 4 1.5 L 12 1.5" fill="none" stroke={bracketColor} strokeWidth="2.5" vectorEffect="non-scaling-stroke" />
        {/* Bottom-Right double corner bracket */}
        <path d="M 98.5 88 L 98.5 96 L 96 98.5 L 88 98.5" fill="none" stroke={bracketColor} strokeWidth="2.5" vectorEffect="non-scaling-stroke" />
      </svg>

      {/* Target handle on Left */}
      <Handle
        type="target"
        position={Position.Left}
        id="input"
        className={`!h-3 !w-3 ${isRunning ? '!bg-cyan-400 !border-cyan-950' : '!bg-[#243044] !border-[#0B0F1A]'} !border-2`}
      />

      <div className="relative z-10 w-full">
        {/* Card Header */}
        <div className="flex items-start justify-between p-3 border-b border-cyan-500/10">
          <div className="min-w-0 flex-1">
            <h4 className="font-semibold text-xs md:text-sm text-[#EEEEEE] break-words leading-tight uppercase tracking-wide">
              {tDynamic(data.name)}
            </h4>
            <p className="font-mono text-[10px] text-[#9CA3AF] mt-0.5">{data.machineCode || 'N/A'}</p>
          </div>
          <span
            className="px-2 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider border shrink-0"
            style={{
              color: statusColor,
              backgroundColor: `${statusColor}1A`,
              borderColor: `${statusColor}33`,
            }}
          >
            {statusText}
          </span>
        </div>

        {/* Card Content Indicators - 2 Column Layout */}
        <div className="p-3.5 space-y-2 text-xs text-[#EEEEEE] font-medium">
          <div className="flex justify-between items-center">
            <span className="text-[#9CA3AF]">{t('machines.table.output', 'Sản lượng')}:</span>
            <span className="font-mono text-sm font-bold text-[#EEEEEE]">{prodQty.toLocaleString(locale)}</span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-[#9CA3AF]">{t('dashboard.table.oee', 'OEE')}:</span>
            <span className="font-mono font-bold" style={{ color: isError ? '#EF4444' : '#00E676' }}>
              {oeeVal}%
            </span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-[#9CA3AF]">{t('common.uph', 'Tốc độ UPH')}:</span>
            <span className="font-mono font-bold text-[#38BDF8]">
              {uphVal} pcs/h
            </span>
          </div>

          {/* Display active error code if in error state */}
          {isError && (
            <div className="mt-2.5 pt-2 border-t border-dashed border-[#EF4444]/30 flex flex-col gap-1">
              <span className="text-[#EF4444] text-[10px] uppercase font-bold tracking-wider">{t('common.errors.errorCode', 'Mã lỗi phát hiện')}:</span>
              <div className="bg-[#EF4444]/10 border border-[#EF4444]/20 rounded px-2 py-1 text-center font-mono font-bold text-[10px] text-[#EF4444]">
                {data.errorCode || 'ERR-059: OVERHEAT'}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Source handle on Right */}
      <Handle
        type="source"
        position={Position.Right}
        id="output"
        className={`!h-3 !w-3 ${isRunning ? '!bg-cyan-400 !border-cyan-950' : '!bg-[#243044] !border-[#0B0F1A]'} !border-2`}
      />
    </div>
  );
}

export const MachineNode = memo(MachineNodeComponent);
export default MachineNode;
