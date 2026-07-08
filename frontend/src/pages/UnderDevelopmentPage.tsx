import { Wrench } from 'lucide-react';

export default function UnderDevelopmentPage({ title }: { title: string }) {
  return (
    <div className="w-full min-h-[70dvh] flex items-center justify-center p-6 bg-transparent">
      <div className="cyber-panel border border-[#14356a] bg-[#0A1129]/80 p-8 max-w-md w-full min-w-[320px] md:min-w-[400px] text-center relative shadow-[0_4px_30px_rgba(0,240,255,0.05)]">
        {/* Corner Decals */}
        <div className="absolute top-0 left-0 w-3 h-3 border-t-2 border-l-2 border-[#00f0ff]" />
        <div className="absolute top-0 right-0 w-3 h-3 border-t-2 border-r-2 border-[#00f0ff]" />
        <div className="absolute bottom-0 left-0 w-3 h-3 border-b-2 border-l-2 border-[#00f0ff]" />
        <div className="absolute bottom-0 right-0 w-3 h-3 border-b-2 border-r-2 border-[#00f0ff]" />

        <div className="flex justify-center mb-6">
          <div className="relative flex h-16 w-16 items-center justify-center rounded-full bg-[#00f0ff]/10 border border-[#00f0ff]/30 text-[#00f0ff] animate-pulse">
            <Wrench className="h-8 w-8 stroke-[1.5]" />
          </div>
        </div>

        <h2 className="text-lg font-black tracking-widest text-[#00f0ff] uppercase mb-2">
          {title.toUpperCase()}
        </h2>
        <div className="h-px bg-[#14356a]/40 my-4 w-full" />
        
        <p className="text-xs font-bold text-slate-300 uppercase tracking-wide leading-relaxed">
          Phân hệ đang được nâng cấp &amp; cấu hình kết nối PLC.
        </p>
        <p className="text-[10px] font-semibold text-text-muted mt-2">
          Hệ thống giám sát vận hành thông minh NEXUS-9000
        </p>
      </div>
    </div>
  );
}
