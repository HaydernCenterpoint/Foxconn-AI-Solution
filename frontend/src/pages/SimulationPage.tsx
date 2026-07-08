import React from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { getSimulationConfigs, toggleSimulation, resetSimulation } from '../features/simulation/services/simulation.api';
import type { SimulationConfig } from '../shared/types/machine';

function asSimulationConfigs(data: Record<string, unknown>[] | undefined): SimulationConfig[] {
  return (data ?? []) as unknown as SimulationConfig[];
}
import {
  Play,
  Square,
  RotateCcw,
  Settings2
} from 'lucide-react';

export const SimulationPage: React.FC = () => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  // Query: Get all simulation configs
  const { data: configsRaw, isLoading, error } = useQuery({
    queryKey: ['simulationConfigs'],
    queryFn: getSimulationConfigs,
    refetchInterval: 2000,
  });
  const configs = asSimulationConfigs(configsRaw);

  // Mutation: Toggle simulation
  const toggleMutation = useMutation({
    mutationFn: async (id: string) => {
      await toggleSimulation(id);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['simulationConfigs'] });
    }
  });

  // Mutation: Reset simulation data
  const resetMutation = useMutation({
    mutationFn: async (id: string) => {
      await resetSimulation(id);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['simulationConfigs'] });
    }
  });

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-3">
        <div className="w-10 h-10 border-4 border-brand-blue-200 border-t-brand-blue-800 rounded-full animate-spin"></div>
        <p className="text-slate-500 text-sm font-medium">Đang tải bộ giả lập...</p>
      </div>
    );
  }

  if (error || !configs) {
    return (
      <div className="bg-red-50 border border-red-200 text-red-700 p-4 rounded-xl max-w-2xl mx-auto mt-8">
        <h3 className="font-bold text-lg">Lỗi tải dữ liệu</h3>
        <p className="text-sm mt-1">Không thể kết nối với API mô phỏng. Đảm bảo backend đang hoạt động.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Title */}
      <div>
        <h1 className="text-2xl font-extrabold text-slate-900 tracking-tight">Giả lập vận hành</h1>
        <p className="text-slate-500 text-sm mt-0.5">Quản lý và điều chỉnh bộ tạo lập dữ liệu tự động cho từng trạm máy.</p>
      </div>

      {/* Grid of simulators */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {configs.map((config) => {
          const isEnabled = config.enabled;

          return (
            <div
              key={config.machineId}
              className={`bg-white rounded-2xl border shadow-sm p-5 space-y-4 flex flex-col justify-between transition-all ${
                isEnabled ? 'border-brand-blue-500/30 ring-1 ring-brand-blue-500/10' : 'border-slate-200/80'
              }`}
            >
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                    isEnabled ? 'bg-brand-blue-50 text-brand-blue-700' : 'bg-slate-100 text-slate-500'
                  }`}>
                    {isEnabled ? 'ĐANG GIẢ LẬP' : 'DỪNG GIẢ LẬP'}
                  </span>

                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => navigate(`/machines/${config.machineId}`)}
                      className="p-1 rounded hover:bg-slate-100 text-slate-500 hover:text-slate-800 transition-colors"
                      title="Cấu hình chi tiết"
                    >
                      <Settings2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                <div>
                  <h3 className="font-bold text-slate-800 text-sm">{config.machineName}</h3>
                  <p className="text-[10px] text-slate-400 font-semibold mt-0.5">IP: {config.machineIp || '0.0.0.0'}</p>
                </div>
              </div>

              {/* Simulation metrics overview */}
              <div className="bg-slate-50 border border-slate-100 rounded-xl p-3 grid grid-cols-2 gap-y-2 gap-x-4 text-xs font-semibold text-slate-600">
                <div>
                  <p className="text-[10px] text-slate-400 font-normal">Nhiệt độ:</p>
                  <p className="text-slate-700">{config.temperatureMin} - {config.temperatureMax}°C</p>
                </div>
                <div>
                  <p className="text-[10px] text-slate-400 font-normal">Áp suất:</p>
                  <p className="text-slate-700">{config.pressureMin} - {config.pressureMax} bar</p>
                </div>
                <div>
                  <p className="text-[10px] text-slate-400 font-normal">Tốc độ:</p>
                  <p className="text-slate-700">{config.speedMin} - {config.speedMax} pcs/m</p>
                </div>
                <div>
                  <p className="text-[10px] text-slate-400 font-normal">Lỗi ngẫu nhiên:</p>
                  <p className="text-slate-700">{(config.errorProbability * 100).toFixed(0)}%</p>
                </div>
              </div>

              {/* Actions toggling */}
              <div className="pt-3 border-t border-slate-100 flex items-center justify-between gap-2">
                <button
                  onClick={() => toggleMutation.mutate(config.machineId)}
                  className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl text-xs font-semibold shadow transition-all ${
                    isEnabled
                      ? 'bg-red-50 hover:bg-red-100 text-red-600 border border-red-200'
                      : 'bg-emerald-50 hover:bg-emerald-100 text-emerald-600 border border-emerald-200'
                  }`}
                >
                  {isEnabled ? (
                    <>
                      <Square className="w-3.5 h-3.5 shrink-0" />
                      <span>Dừng phát</span>
                    </>
                  ) : (
                    <>
                      <Play className="w-3.5 h-3.5 shrink-0" />
                      <span>Bật giả lập</span>
                    </>
                  )}
                </button>

                <button
                  onClick={() => resetMutation.mutate(config.machineId)}
                  className="bg-slate-50 hover:bg-slate-100 border border-slate-200 text-slate-500 p-2 rounded-xl"
                  title="Reset sản lượng"
                >
                  <RotateCcw className="w-4 h-4 shrink-0" />
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
export default SimulationPage;
