import { useEffect, useId, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useForm } from 'react-hook-form';
import { Plus, RefreshCw, ShieldCheck, Trash2, UserRound, UsersRound } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { queryKeys } from '../../app/queryKeys';
import { UserRoleBadge } from '../../features/admin/components/UserRoleBadge';
import { getApiErrorMessage } from '../../features/admin/lib/apiError';
import { usersApi, type CreateUserRequest, type User } from '../../features/admin/services/users.api';
import { useAuthStore } from '../../shared/store/auth.store';
import { useUiStore } from '../../shared/store/ui.store';
import { Button } from '../../shared/components/ui/Button';
import { ConfirmDialog } from '../../shared/components/ui/ConfirmDialog';
import { DataState } from '../../shared/components/ui/DataState';
import { IconButton } from '../../shared/components/ui/IconButton';
import { Modal } from '../../shared/components/ui/Modal';
import { PageHeader } from '../../shared/components/ui/PageHeader';
import { StatCard } from '../../shared/components/ui/StatCard';
import { Surface } from '../../shared/components/ui/Surface';
import { Badge } from '../../shared/components/ui/Badge';

interface CreateUserFormData {
  username: string;
  password: string;
  role: CreateUserRequest['role'];
}

const initialFormValues: CreateUserFormData = {
  username: '',
  password: '',
  role: 'GUEST',
};

export function UserManagementPage() {
  const { i18n, t } = useTranslation();
  const queryClient = useQueryClient();
  const currentUsername = useAuthStore((state) => state.username);
  const addToast = useUiStore((state) => state.addToast);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [formError, setFormError] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<User | null>(null);
  const [deleteError, setDeleteError] = useState('');
  const createFormId = useId();
  const usernameId = useId();
  const passwordId = useId();
  const roleId = useId();
  const usernameErrorId = useId();
  const passwordErrorId = useId();
  const roleErrorId = useId();

  const schema = useMemo(
    () => z.object({
      username: z.string().trim().min(1, t('pages.users.validation.usernamePasswordRequired')),
      password: z.string().min(1, t('pages.users.validation.usernamePasswordRequired')),
      role: z.enum(['ADMIN', 'ENGINEER', 'GUEST']),
    }),
    [t],
  );

  const {
    register,
    handleSubmit,
    reset,
    trigger,
    formState: { errors, isSubmitted },
  } = useForm<CreateUserFormData>({
    defaultValues: initialFormValues,
    mode: 'onBlur',
    resolver: zodResolver(schema),
  });

  useEffect(() => {
    if (isSubmitted) {
      void trigger();
    }
  }, [i18n.language, isSubmitted, trigger]);

  const {
    data: users = [],
    isError,
    isFetching,
    isLoading,
    refetch,
  } = useQuery({
    queryKey: queryKeys.admin.users(),
    queryFn: usersApi.getAll,
  });

  const createMutation = useMutation({
    mutationFn: (newUser: CreateUserRequest) => usersApi.create(newUser),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.admin.users() }),
        queryClient.invalidateQueries({ queryKey: ['audit-logs'] }),
      ]);
      addToast('success', t('pages.users.createSuccess', { defaultValue: t('common.success') }));
      setIsCreateModalOpen(false);
      setFormError('');
      reset(initialFormValues);
    },
    onError: (error) => {
      setFormError(getApiErrorMessage(error, t('errors.unknown')));
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => usersApi.delete(id),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.admin.users() }),
        queryClient.invalidateQueries({ queryKey: ['audit-logs'] }),
      ]);
      addToast('success', t('settings.users.deleteSuccess'));
      setDeleteTarget(null);
      setDeleteError('');
    },
    onError: (error) => {
      setDeleteError(getApiErrorMessage(error, t('settings.users.deleteError')));
    },
  });

  const openCreateModal = () => {
    reset(initialFormValues);
    setFormError('');
    createMutation.reset();
    setIsCreateModalOpen(true);
  };

  const closeCreateModal = () => {
    if (createMutation.isPending) return;
    setIsCreateModalOpen(false);
    setFormError('');
    reset(initialFormValues);
  };

  const isCurrentUser = (username: string) =>
    Boolean(currentUsername && username.toLowerCase() === currentUsername.toLowerCase());

  const roleCounts = useMemo(
    () => ({
      admin: users.filter((user) => user.role === 'ADMIN').length,
      engineer: users.filter((user) => user.role === 'ENGINEER').length,
      guest: users.filter((user) => user.role === 'GUEST').length,
    }),
    [users],
  );

  const unavailableValue = t('common.notAvailable');
  const deleteDescription = deleteTarget
    ? `${t('pages.users.deleteDescription', { username: deleteTarget.username })}${deleteError ? ` ${deleteError}` : ''}`
    : '';

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={t('settings.sections.users')}
        title={t('titles.users')}
        description={t('pages.users.subtitle')}
        className="max-sm:flex-col max-sm:items-start"
        actions={(
          <>
            <Button
              variant="secondary"
              size="sm"
              loading={isFetching && !isLoading}
              startIcon={<RefreshCw size={16} aria-hidden="true" />}
              onClick={() => {
                void refetch();
              }}
            >
              {t('common.actions.refresh')}
            </Button>
            <Button startIcon={<Plus size={16} aria-hidden="true" />} onClick={openCreateModal}>
              {t('pages.users.addAccount')}
            </Button>
          </>
        )}
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label={t('pages.users.totalAccounts')}
          value={isError ? unavailableValue : users.length}
          icon={<UsersRound size={18} />}
          accent="primary"
          loading={isLoading}
        />
        <StatCard
          label={t('pages.users.roles.admin')}
          value={isError ? unavailableValue : roleCounts.admin}
          icon={<ShieldCheck size={18} />}
          accent="info"
          loading={isLoading}
        />
        <StatCard
          label={t('pages.users.roles.engineer')}
          value={isError ? unavailableValue : roleCounts.engineer}
          icon={<UserRound size={18} />}
          accent="warning"
          loading={isLoading}
        />
        <StatCard
          label={t('pages.users.roles.guest')}
          value={isError ? unavailableValue : roleCounts.guest}
          icon={<UserRound size={18} />}
          accent="neutral"
          loading={isLoading}
        />
      </div>

      {isLoading ? (
        <DataState kind="loading" title={t('pages.users.loading')} />
      ) : isError ? (
        <DataState
          kind="error"
          title={t('pages.users.loadErrorTitle')}
          description={t('pages.users.loadError')}
          action={(
            <Button
              variant="secondary"
              size="sm"
              startIcon={<RefreshCw size={16} aria-hidden="true" />}
              onClick={() => {
                void refetch();
              }}
            >
              {t('common.actions.retry')}
            </Button>
          )}
        />
      ) : users.length === 0 ? (
        <DataState
          kind="empty"
          icon={<UsersRound aria-hidden="true" />}
          title={t('pages.users.empty')}
          action={(
            <Button size="sm" startIcon={<Plus size={16} aria-hidden="true" />} onClick={openCreateModal}>
              {t('pages.users.addAccount')}
            </Button>
          )}
        />
      ) : (
        <Surface variant="default" padding="none" className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="data-table min-w-[680px]">
              <caption className="sr-only">{t('pages.users.listTitle')}</caption>
              <thead>
                <tr>
                  <th scope="col">{t('pages.users.columns.id')}</th>
                  <th scope="col">{t('pages.users.columns.username')}</th>
                  <th scope="col">{t('pages.users.columns.role')}</th>
                  <th scope="col" className="text-right">{t('pages.users.columns.actions')}</th>
                </tr>
              </thead>
              <tbody>
                {users.map((user) => {
                  const isSelf = isCurrentUser(user.username);

                  return (
                    <tr key={user.id}>
                      <td className="font-mono text-text-muted">{user.id}</td>
                      <td>
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-medium text-text-primary">{user.username}</span>
                          {isSelf && <Badge variant="primary" size="sm">{t('pages.users.self')}</Badge>}
                        </div>
                      </td>
                      <td><UserRoleBadge role={user.role} /></td>
                      <td className="text-right">
                        {isSelf ? (
                          <span className="text-xs text-text-muted">{t('pages.users.cannotDeleteSelf')}</span>
                        ) : (
                          <IconButton
                            variant="danger"
                            size="sm"
                            icon={<Trash2 size={16} aria-hidden="true" />}
                            label={t('pages.users.deleteAria', { username: user.username })}
                            onClick={() => {
                              setDeleteError('');
                              setDeleteTarget(user);
                            }}
                          />
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Surface>
      )}

      <Modal
        open={isCreateModalOpen}
        onClose={closeCreateModal}
        title={t('pages.users.createTitle')}
        subtitle={t('pages.users.subtitle')}
        size="md"
        footer={(
          <>
            <Button variant="secondary" onClick={closeCreateModal} disabled={createMutation.isPending}>
              {t('common.actions.cancel')}
            </Button>
            <Button type="submit" form={createFormId} loading={createMutation.isPending}>
              {createMutation.isPending ? t('pages.users.createPending') : t('pages.users.createButton')}
            </Button>
          </>
        )}
      >
        <form
          id={createFormId}
          className="space-y-5"
          noValidate
          aria-busy={createMutation.isPending || undefined}
          onChange={() => {
            if (formError) setFormError('');
          }}
          onSubmit={handleSubmit((data) => {
            setFormError('');
            createMutation.mutate({
              username: data.username.trim(),
              password: data.password,
              role: data.role,
            });
          })}
        >
          {formError && (
            <div className="rounded-md border border-error bg-error-container px-3 py-2 text-sm text-error" role="alert">
              {formError}
            </div>
          )}

          <div>
            <label htmlFor={usernameId} className="mb-2 block text-sm font-semibold text-text-primary">
              {t('pages.users.username')}
            </label>
            <input
              {...register('username')}
              id={usernameId}
              type="text"
              autoComplete="username"
              disabled={createMutation.isPending}
              aria-invalid={Boolean(errors.username)}
              aria-describedby={errors.username ? usernameErrorId : undefined}
              placeholder={t('pages.users.usernamePlaceholder')}
              className="field"
            />
            {errors.username && (
              <p id={usernameErrorId} className="mt-2 text-sm text-error" role="alert">
                {errors.username.message}
              </p>
            )}
          </div>

          <div>
            <label htmlFor={passwordId} className="mb-2 block text-sm font-semibold text-text-primary">
              {t('pages.users.password')}
            </label>
            <input
              {...register('password')}
              id={passwordId}
              type="password"
              autoComplete="new-password"
              disabled={createMutation.isPending}
              aria-invalid={Boolean(errors.password)}
              aria-describedby={errors.password ? passwordErrorId : undefined}
              placeholder={t('pages.users.passwordPlaceholder')}
              className="field"
            />
            {errors.password && (
              <p id={passwordErrorId} className="mt-2 text-sm text-error" role="alert">
                {errors.password.message}
              </p>
            )}
          </div>

          <div>
            <label htmlFor={roleId} className="mb-2 block text-sm font-semibold text-text-primary">
              {t('pages.users.role')}
            </label>
            <select
              {...register('role')}
              id={roleId}
              disabled={createMutation.isPending}
              aria-invalid={Boolean(errors.role)}
              aria-describedby={errors.role ? roleErrorId : undefined}
              className="field"
            >
              <option value="ADMIN">{t('pages.users.roles.admin')}</option>
              <option value="ENGINEER">{t('pages.users.roles.engineer')}</option>
              <option value="GUEST">{t('pages.users.roles.guest')}</option>
            </select>
            {errors.role && (
              <p id={roleErrorId} className="mt-2 text-sm text-error" role="alert">
                {errors.role.message}
              </p>
            )}
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        title={t('pages.users.deleteTitle')}
        description={deleteDescription}
        confirmLabel={t('common.actions.delete')}
        cancelLabel={t('common.actions.cancel')}
        confirmTone="danger"
        isPending={deleteMutation.isPending}
        onCancel={() => {
          if (!deleteMutation.isPending) {
            setDeleteTarget(null);
            setDeleteError('');
          }
        }}
        onConfirm={() => {
          if (deleteTarget) deleteMutation.mutate(deleteTarget.id);
        }}
      />
    </div>
  );
}

export default UserManagementPage;
