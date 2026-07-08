import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useAuthStore } from '../../shared/store/auth.store';
import { usersApi, type CreateUserRequest } from '../../features/admin/services/users.api';
import {
  Trash2,
  UserPlus,
  Shield,
  X,
  ShieldCheck,
  UserCheck,
  Users,
  ChevronDown,
} from 'lucide-react';

interface UserItem {
  id: number;
  username: string;
  role: string;
}

const ROLE_CONFIG: Record<string, { label: string; bg: string; text: string; border: string; icon: React.ReactNode }> = {
  ADMIN: {
    label: 'Quản trị viên',
    bg: 'bg-[rgba(255,92,108,0.1)]',
    text: 'text-[#FF5C6C]',
    border: 'border-[rgba(255,92,108,0.35)]',
    icon: <ShieldCheck className="w-3.5 h-3.5 shrink-0" />,
  },
  ENGINEER: {
    label: 'Kỹ sư',
    bg: 'bg-[rgba(255,197,71,0.1)]',
    text: 'text-[#FFC547]',
    border: 'border-[rgba(255,197,71,0.35)]',
    icon: <Shield className="w-3.5 h-3.5 shrink-0" />,
  },
  GUEST: {
    label: 'Khách',
    bg: 'bg-[rgba(111,123,150,0.1)]',
    text: 'text-[#6F7B96]',
    border: 'border-[rgba(111,123,150,0.3)]',
    icon: <UserCheck className="w-3.5 h-3.5 shrink-0" />,
  },
};

export const UserManagementPage: React.FC = () => {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const currentUsername = useAuthStore(state => state.username);

  const [showAddForm, setShowAddForm] = useState(false);
  const [usernameInput, setUsernameInput] = useState('');
  const [passwordInput, setPasswordInput] = useState('');
  const [roleInput, setRoleInput] = useState<'ADMIN' | 'ENGINEER' | 'GUEST'>('GUEST');
  const [formError, setFormError] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<UserItem | null>(null);

  // ── Data ──────────────────────────────────────────────────────────────
  const { data: users = [], isLoading, error } = useQuery({
    queryKey: ['users'],
    queryFn: usersApi.getAll,
  });

  const createMutation = useMutation({
    mutationFn: (newUser: CreateUserRequest) =>
      usersApi.create(newUser),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] });
      setShowAddForm(false);
      setUsernameInput(''); setPasswordInput(''); setRoleInput('GUEST'); setFormError('');
    },
    onError: (err: any) => setFormError(err.response?.data?.error || t('pages.users.toasts.createError', 'Lỗi khi tạo tài khoản')),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => usersApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] });
      setDeleteTarget(null);
    },
  });

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!usernameInput.trim() || !passwordInput.trim()) {
      setFormError(t('pages.users.validation.usernamePasswordRequired', 'Tên tài khoản và mật khẩu là bắt buộc'));
      return;
    }
    createMutation.mutate({ username: usernameInput, password: passwordInput, role: roleInput });
  };

  const getRoleCfg = (r: string) => {
    const uppercaseRole = r.toUpperCase();
    const config = ROLE_CONFIG[uppercaseRole] ?? ROLE_CONFIG.GUEST;
    let label = '';
    if (uppercaseRole === 'ADMIN') label = t('pages.users.roles.admin', 'Quản trị viên');
    else if (uppercaseRole === 'ENGINEER') label = t('pages.users.roles.engineer', 'Kỹ sư');
    else label = t('pages.users.roles.guest', 'Khách');
    return { ...config, label };
  };

  // ── Shared UI constants ────────────────────────────────────────────────
  const panelBg  = { background: 'rgba(7,17,47,0.85)' } as React.CSSProperties;
  const panelCls = 'rounded-xl border border-[rgba(47,123,255,0.25)] overflow-hidden';
  const inputCls =
    'w-full bg-[rgba(7,17,47,0.9)] border border-[rgba(47,123,255,0.3)] rounded-lg px-3 py-2 text-sm text-[#B7C8E8] placeholder-[#3A4A6B] focus:outline-none focus:border-[#2F7BFF] transition-colors';
  const selectCls =
    'w-full appearance-none bg-[rgba(7,17,47,0.9)] border border-[rgba(47,123,255,0.3)] rounded-lg px-3 py-2 pr-8 text-sm text-[#B7C8E8] focus:outline-none focus:border-[#2F7BFF] cursor-pointer transition-colors';

  // ── Stats ──────────────────────────────────────────────────────────────
  const admins    = users.filter(u => u.role === 'ADMIN').length;
  const engineers = users.filter(u => u.role === 'ENGINEER').length;
  const guests    = users.filter(u => u.role === 'GUEST').length;

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-3">
        <div className="w-8 h-8 border-2 border-[#18D7FF] border-t-transparent rounded-full animate-spin" />
        <p className="text-sm" style={{ color: '#7183A8' }}>{t('pages.users.loading', 'Đang tải danh sách tài khoản...')}</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-xl border border-[rgba(255,92,108,0.35)] bg-[rgba(255,92,108,0.08)] p-5 max-w-2xl mx-auto mt-8">
        <h3 className="font-bold text-[#FF5C6C]">{t('pages.users.loadErrorTitle', 'Lỗi tải dữ liệu')}</h3>
        <p className="text-sm mt-1" style={{ color: '#B7C8E8' }}>{t('pages.users.loadError', 'Không thể lấy danh sách người dùng. Kiểm tra quyền Admin.')}</p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* ── Header ── */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-xl font-bold text-white tracking-wide">{t('titles.users', 'Quản lý người dùng')}</h1>
          <p className="text-xs mt-0.5" style={{ color: '#7183A8' }}>
            {t('pages.users.subtitle', 'Tạo tài khoản, phân quyền và quản lý truy cập hệ thống')}
          </p>
        </div>
        <button
          onClick={() => { setShowAddForm(true); setFormError(''); }}
          className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold text-white transition-all active:scale-95 cursor-pointer"
          style={{ background: 'linear-gradient(135deg,#2F7BFF,#18D7FF)' }}
        >
          <UserPlus className="w-4 h-4" />
          {t('pages.users.addAccount', 'Thêm tài khoản')}
        </button>
      </div>

      {/* ── Stats row ── */}
      <div className="grid grid-cols-4 gap-3">
        {[
          { label: t('pages.users.totalAccounts', 'Tổng tài khoản'), value: users.length, color: '#18D7FF' },
          { label: t('pages.users.roles.admin', 'Quản trị viên'),  value: admins,       color: '#FF5C6C' },
          { label: t('pages.users.roles.engineer', 'Kỹ sư'),          value: engineers,    color: '#FFC547' },
          { label: t('pages.users.roles.guest', 'Khách'),          value: guests,       color: '#6F7B96' },
        ].map(s => (
          <div key={s.label} className={panelCls} style={panelBg}>
            <div className="px-4 py-3 flex items-center justify-between">
              <span className="text-xs font-semibold" style={{ color: '#7183A8' }}>{s.label}</span>
              <span className="text-2xl font-bold tabular-nums" style={{ color: s.color }}>{s.value}</span>
            </div>
          </div>
        ))}
      </div>

      {/* ── Create modal ── */}
      {showAddForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div
            className="w-full max-w-md rounded-xl border border-[rgba(47,123,255,0.35)] shadow-2xl p-6 space-y-4"
            style={{ background: '#07112F' }}
          >
            <div className="flex items-center justify-between border-b border-[rgba(47,123,255,0.2)] pb-3">
              <h3 className="font-bold uppercase tracking-wider text-white text-sm">
                <Users className="w-4 h-4 inline-block mr-2 text-[#18D7FF]" />
                {t('pages.users.createTitle', 'Thêm người dùng mới')}
              </h3>
              <button onClick={() => setShowAddForm(false)} className="text-[#6F7B96] hover:text-white transition-colors cursor-pointer">
                <X className="w-4 h-4" />
              </button>
            </div>

            {formError && (
              <div className="px-3 py-2 rounded-lg border border-[rgba(255,92,108,0.3)] bg-[rgba(255,92,108,0.1)] text-[#FF5C6C] text-xs">
                {formError}
              </div>
            )}

            <form onSubmit={handleCreate} className="space-y-4">
              <div className="space-y-1.5">
                <label className="block text-xs font-bold uppercase tracking-wider" style={{ color: '#7183A8' }}>{t('pages.users.username', 'Tên tài khoản')}</label>
                <input
                  type="text"
                  value={usernameInput}
                  onChange={e => setUsernameInput(e.target.value)}
                  placeholder={t('pages.users.usernamePlaceholder', 'ví dụ: engineer02')}
                  className={inputCls}
                  required
                />
              </div>
              <div className="space-y-1.5">
                <label className="block text-xs font-bold uppercase tracking-wider" style={{ color: '#7183A8' }}>{t('pages.users.password', 'Mật khẩu')}</label>
                <input
                  type="password"
                  value={passwordInput}
                  onChange={e => setPasswordInput(e.target.value)}
                  placeholder={t('pages.users.validation.passwordMin', 'Tối thiểu 6 ký tự')}
                  className={inputCls}
                  required
                />
              </div>
              <div className="space-y-1.5">
                <label className="block text-xs font-bold uppercase tracking-wider" style={{ color: '#7183A8' }}>{t('pages.users.role', 'Vai trò')}</label>
                <div className="relative">
                  <select value={roleInput} onChange={e => setRoleInput(e.target.value as 'ADMIN' | 'ENGINEER' | 'GUEST')} className={selectCls}>
                    <option value="ADMIN">{t('pages.users.roles.admin', 'Quản trị viên')} (ADMIN)</option>
                    <option value="ENGINEER">{t('pages.users.roles.engineer', 'Kỹ sư')} (ENGINEER)</option>
                    <option value="GUEST">{t('pages.users.roles.guest', 'Khách')} (GUEST)</option>
                  </select>
                  <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 pointer-events-none" style={{ color: '#7183A8' }} />
                </div>
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowAddForm(false)}
                  className="px-4 py-2 rounded-lg text-sm font-semibold border border-[rgba(47,123,255,0.25)] text-[#7183A8] hover:text-white transition-colors cursor-pointer"
                >
                  {t('common.actions.cancel', 'Hủy')}
                </button>
                <button
                  type="submit"
                  disabled={createMutation.isPending}
                  className="px-4 py-2 rounded-lg text-sm font-bold text-white transition-all disabled:opacity-50 cursor-pointer"
                  style={{ background: 'linear-gradient(135deg,#2F7BFF,#18D7FF)' }}
                >
                  {createMutation.isPending ? t('pages.users.createPending', 'Đang tạo...') : t('pages.users.createButton', 'Tạo tài khoản')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Delete confirm modal ── */}
      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div
            className="w-full max-w-sm rounded-xl border border-[rgba(255,92,108,0.35)] shadow-2xl p-6 space-y-4"
            style={{ background: '#07112F' }}
          >
            <div className="flex items-center gap-2.5 border-b border-[rgba(255,92,108,0.2)] pb-3">
              <span className="text-[#FF5C6C]">⚠️</span>
              <h3 className="font-bold text-[#FF5C6C] text-sm uppercase tracking-wider">{t('pages.users.deleteConfirmTitle', 'Xác nhận xóa tài khoản')}</h3>
            </div>
            <p className="text-xs leading-relaxed" style={{ color: '#B7C8E8' }}>
              {t('pages.users.deleteWarning', 'Hành động này không thể hoàn tác. Bạn có chắc chắn muốn xóa tài khoản ')}
              <span className="font-bold text-white">{deleteTarget.username}</span>?
            </p>
            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={() => setDeleteTarget(null)}
                className="px-4 py-2 rounded-lg text-sm font-semibold border border-[rgba(47,123,255,0.25)] text-[#7183A8] hover:text-white transition-colors cursor-pointer"
              >
                {t('common.actions.cancel', 'Hủy')}
              </button>
              <button
                onClick={() => deleteMutation.mutate(deleteTarget.id)}
                disabled={deleteMutation.isPending}
                className="px-4 py-2 rounded-lg text-sm font-bold text-white transition-all bg-[#FF5C6C] hover:bg-[#E04B5B] disabled:opacity-50 cursor-pointer"
              >
                {deleteMutation.isPending ? t('common.status.loading', 'Đang xóa...') : t('common.actions.delete', 'Xóa')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Users Table ── */}
      <div className={panelCls} style={panelBg}>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-[#B7C8E8] border-collapse">
            <thead>
              <tr className="border-b border-[rgba(47,123,255,0.2)] bg-[rgba(7,17,47,0.4)] text-[10px] uppercase font-bold tracking-wider" style={{ color: '#7183A8' }}>
                <th className="py-3.5 px-5 w-12 text-center">#</th>
                <th className="py-3.5 px-4">{t('pages.users.table.username', 'Tên tài khoản')}</th>
                <th className="py-3.5 px-4">{t('pages.users.table.role', 'Quyền hạn')}</th>
                <th className="py-3.5 px-5 text-center">{t('pages.users.table.actions', 'Thao tác')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[rgba(47,123,255,0.15)]">
              {users.map((u: any, idx: number) => {
                const isCurrent = u.username === currentUsername;
                const cfg = getRoleCfg(u.role);
                return (
                  <tr key={u.id} className="hover:bg-[rgba(47,123,255,0.03)] transition-colors">
                    <td className="py-3.5 px-5 text-center font-mono" style={{ color: '#7183A8' }}>{idx + 1}</td>
                    <td className="py-3.5 px-4">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-white text-sm">{u.username}</span>
                        {isCurrent && (
                          <span className="rounded bg-[#18D7FF]/10 border border-[#18D7FF]/35 px-1.5 py-0.5 text-[9px] font-bold text-[#18D7FF] uppercase tracking-wider">
                            {t('pages.users.table.activeSelf', 'Tài khoản của bạn')}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="py-3.5 px-4">
                      <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[10px] font-bold uppercase ${cfg.bg} ${cfg.text} ${cfg.border}`}>
                        {cfg.icon}
                        {cfg.label}
                      </span>
                    </td>
                    <td className="py-3.5 px-5 text-center">
                      {!isCurrent && (
                        <button
                          onClick={() => setDeleteTarget(u)}
                          className="p-1.5 rounded-lg border border-[rgba(255,92,108,0.2)] hover:bg-[rgba(255,92,108,0.1)] text-[#FF5C6C] transition-all active:scale-95 cursor-pointer"
                          title={t('common.actions.delete', 'Xóa')}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
export default UserManagementPage;
