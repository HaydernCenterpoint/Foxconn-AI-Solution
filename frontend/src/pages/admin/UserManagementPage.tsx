import React, { useState, type ReactNode } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { MaterialSymbol } from '../../shared/components/ui/MaterialSymbol';
import { usersApi, type CreateUserRequest, type User } from '../../features/admin/services/users.api';
import { useAuthStore } from '../../shared/store/auth.store';
import './admin-modern.css';

type Role = CreateUserRequest['role'];

interface RoleMeta {
  icon: string;
  tone: 'red' | 'amber' | 'neutral';
}

const ROLE_META: Record<Role, RoleMeta> = {
  ADMIN: { icon: 'verified_user', tone: 'red' },
  ENGINEER: { icon: 'shield', tone: 'amber' },
  GUEST: { icon: 'person_check', tone: 'neutral' },
};

function extractErrorMessage(error: unknown): string | undefined {
  if (typeof error !== 'object' || error === null || !('response' in error)) return undefined;
  const response = error.response;
  if (typeof response !== 'object' || response === null || !('data' in response)) return undefined;
  const data = response.data;
  if (typeof data !== 'object' || data === null || !('error' in data)) return undefined;
  return typeof data.error === 'string' ? data.error : undefined;
}

function Modal({ children }: { children: ReactNode }) {
  return <div className="admin-modal__backdrop">{children}</div>;
}

export const UserManagementPage: React.FC = () => {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const currentUsername = useAuthStore((state) => state.username);
  const [showAddForm, setShowAddForm] = useState(false);
  const [usernameInput, setUsernameInput] = useState('');
  const [passwordInput, setPasswordInput] = useState('');
  const [roleInput, setRoleInput] = useState<Role>('GUEST');
  const [formError, setFormError] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<User | null>(null);

  const { data: users = [], isLoading, error } = useQuery({
    queryKey: ['users'],
    queryFn: usersApi.getAll,
  });

  const createMutation = useMutation({
    mutationFn: (newUser: CreateUserRequest) => usersApi.create(newUser),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] });
      setShowAddForm(false);
      setUsernameInput('');
      setPasswordInput('');
      setRoleInput('GUEST');
      setFormError('');
    },
    onError: (requestError) => {
      setFormError(extractErrorMessage(requestError) || t('pages.users.toasts.createError', 'Lỗi khi tạo tài khoản'));
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => usersApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] });
      setDeleteTarget(null);
    },
  });

  const handleCreate = (event: React.FormEvent) => {
    event.preventDefault();
    if (!usernameInput.trim() || !passwordInput.trim()) {
      setFormError(t('pages.users.validation.usernamePasswordRequired', 'Tên tài khoản và mật khẩu là bắt buộc'));
      return;
    }
    createMutation.mutate({ username: usernameInput, password: passwordInput, role: roleInput });
  };

  const roleLabel = (role: Role) => {
    if (role === 'ADMIN') return t('pages.users.roles.admin', 'Quản trị viên');
    if (role === 'ENGINEER') return t('pages.users.roles.engineer', 'Kỹ sư');
    return t('pages.users.roles.guest', 'Khách');
  };

  const counts = {
    admins: users.filter((user) => user.role === 'ADMIN').length,
    engineers: users.filter((user) => user.role === 'ENGINEER').length,
    guests: users.filter((user) => user.role === 'GUEST').length,
  };

  if (isLoading) {
    return (
      <div className="admin-page admin-page__state">
        <div className="admin-page__spinner" aria-hidden="true" />
        <p>{t('pages.users.loading', 'Đang tải danh sách tài khoản...')}</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="admin-page admin-page__error">
        <h3>{t('pages.users.loadErrorTitle', 'Lỗi tải dữ liệu')}</h3>
        <p>{t('pages.users.loadError', 'Không thể lấy danh sách người dùng. Kiểm tra quyền Admin.')}</p>
      </div>
    );
  }

  return (
    <div className="admin-page admin-users-page">
      <header className="admin-page__header">
        <div>
          <p>{t('pages.users.subtitle', 'Tạo tài khoản, phân quyền và quản lý truy cập hệ thống')}</p>
          <h1>{t('titles.users', 'Quản lý người dùng')}</h1>
        </div>
        <button
          type="button"
          className="admin-page__primary-action"
          onClick={() => {
            setShowAddForm(true);
            setFormError('');
          }}
        >
          <MaterialSymbol name="person_add" size={17} />
          {t('pages.users.addAccount', 'Thêm tài khoản')}
        </button>
      </header>

      <section className="admin-page__stats" aria-label={t('titles.users', 'User management')}>
        {[
          { label: t('pages.users.totalAccounts', 'Tổng tài khoản'), value: users.length, tone: 'neutral' },
          { label: t('pages.users.roles.admin', 'Quản trị viên'), value: counts.admins, tone: 'red' },
          { label: t('pages.users.roles.engineer', 'Kỹ sư'), value: counts.engineers, tone: 'amber' },
          { label: t('pages.users.roles.guest', 'Khách'), value: counts.guests, tone: 'muted' },
        ].map((stat) => (
          <article className={`admin-page__stat admin-page__stat--${stat.tone}`} key={stat.label}>
            <span>{stat.label}</span>
            <strong>{stat.value}</strong>
          </article>
        ))}
      </section>

      <section className="admin-page__panel admin-page__table-panel">
        <div className="admin-page__table-wrap">
          <table>
            <thead>
              <tr>
                <th scope="col" className="is-center">#</th>
                <th scope="col">{t('pages.users.table.username', 'Tên tài khoản')}</th>
                <th scope="col">{t('pages.users.table.role', 'Quyền hạn')}</th>
                <th scope="col" className="is-center">{t('pages.users.table.actions', 'Thao tác')}</th>
              </tr>
            </thead>
            <tbody>
              {users.map((user, index) => {
                const isCurrent = user.username === currentUsername;
                const meta = ROLE_META[user.role];
                return (
                  <tr key={user.id}>
                    <td className="is-center admin-page__index">{index + 1}</td>
                    <td>
                      <div className="admin-page__user-cell">
                        <b>{user.username}</b>
                        {isCurrent && <em>{t('pages.users.table.activeSelf', 'Tài khoản của bạn')}</em>}
                      </div>
                    </td>
                    <td>
                      <span className={`admin-page__badge admin-page__badge--${meta.tone}`}>
                        <MaterialSymbol name={meta.icon} size={14} />
                        {roleLabel(user.role)}
                      </span>
                    </td>
                    <td className="is-center">
                      {!isCurrent && (
                        <button
                          type="button"
                          className="admin-page__delete-button"
                          onClick={() => setDeleteTarget(user)}
                          title={t('common.actions.delete', 'Xóa')}
                        >
                          <MaterialSymbol name="delete" size={15} />
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      {showAddForm && (
        <Modal>
          <div className="admin-modal" role="dialog" aria-modal="true" aria-labelledby="create-user-title">
            <header className="admin-modal__header">
              <h2 id="create-user-title"><MaterialSymbol name="group" size={18} /> {t('pages.users.createTitle', 'Thêm người dùng mới')}</h2>
              <button type="button" onClick={() => setShowAddForm(false)} aria-label={t('common.actions.close', 'Đóng')}><MaterialSymbol name="close" size={18} /></button>
            </header>
            {formError && <p className="admin-modal__error">{formError}</p>}
            <form onSubmit={handleCreate} className="admin-modal__form">
              <label>
                <span>{t('pages.users.username', 'Tên tài khoản')}</span>
                <input
                  type="text"
                  value={usernameInput}
                  onChange={(event) => setUsernameInput(event.target.value)}
                  placeholder={t('pages.users.usernamePlaceholder', 'ví dụ: engineer02')}
                  required
                />
              </label>
              <label>
                <span>{t('pages.users.password', 'Mật khẩu')}</span>
                <input
                  type="password"
                  value={passwordInput}
                  onChange={(event) => setPasswordInput(event.target.value)}
                  placeholder={t('pages.users.validation.passwordMin', 'Tối thiểu 6 ký tự')}
                  required
                />
              </label>
              <label>
                <span>{t('pages.users.role', 'Vai trò')}</span>
                <span className="admin-modal__select-wrap">
                  <select value={roleInput} onChange={(event) => setRoleInput(event.target.value as Role)}>
                    <option value="ADMIN">{roleLabel('ADMIN')} {t('pages.users.roleCode', { role: 'ADMIN' })}</option>
                    <option value="ENGINEER">{roleLabel('ENGINEER')} {t('pages.users.roleCode', { role: 'ENGINEER' })}</option>
                    <option value="GUEST">{roleLabel('GUEST')} {t('pages.users.roleCode', { role: 'GUEST' })}</option>
                  </select>
                  <MaterialSymbol name="expand_more" size={15} />
                </span>
              </label>
              <footer className="admin-modal__actions">
                <button type="button" className="admin-modal__secondary" onClick={() => setShowAddForm(false)}>{t('common.actions.cancel', 'Hủy')}</button>
                <button type="submit" className="admin-modal__primary" disabled={createMutation.isPending}>
                  {createMutation.isPending ? t('pages.users.createPending', 'Đang tạo...') : t('pages.users.createButton', 'Tạo tài khoản')}
                </button>
              </footer>
            </form>
          </div>
        </Modal>
      )}

      {deleteTarget && (
        <Modal>
          <div className="admin-modal admin-modal--danger" role="dialog" aria-modal="true" aria-labelledby="delete-user-title">
            <header className="admin-modal__header">
              <h2 id="delete-user-title"><MaterialSymbol name="warning" size={18} /> {t('pages.users.deleteConfirmTitle', 'Xác nhận xóa tài khoản')}</h2>
            </header>
            <p className="admin-modal__copy">
              {t('pages.users.deleteWarning', 'Hành động này không thể hoàn tác. Bạn có chắc chắn muốn xóa tài khoản ')} <b>{deleteTarget.username}</b>?
            </p>
            <footer className="admin-modal__actions">
              <button type="button" className="admin-modal__secondary" onClick={() => setDeleteTarget(null)}>{t('common.actions.cancel', 'Hủy')}</button>
              <button type="button" className="admin-modal__danger" disabled={deleteMutation.isPending} onClick={() => deleteMutation.mutate(deleteTarget.id)}>
                {deleteMutation.isPending ? t('common.status.loading', 'Đang xóa...') : t('common.actions.delete', 'Xóa')}
              </button>
            </footer>
          </div>
        </Modal>
      )}
    </div>
  );
};

export default UserManagementPage;
