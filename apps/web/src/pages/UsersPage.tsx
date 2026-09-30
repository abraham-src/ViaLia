import type { RoleName, UserAdminDto, UserStatus } from '@simu/shared-types';
import { ROLE_NAMES, USER_STATUSES } from '@simu/shared-types';
import { KeyRound, Plus, Search, UserX, X } from 'lucide-react';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Chip } from '../components/ui/Chip';
import { Empty, ErrorLine, SkeletonRows } from '../components/ui/Feedback';
import { useCreateUser, useDeactivateUser, useUpdateUser, useUsers } from '../hooks/admin';
import { ApiError } from '../lib/api';
import { formatDateTime } from '../lib/format';
import { ROLE_LABEL } from '../lib/labels';
import { useAuth } from '../stores/auth';

const STATUS_LABEL: Record<UserStatus, string> = {
  active: 'Activo',
  inactive: 'Inactivo',
  suspended: 'Suspendido',
};
const field = 'rounded-sm border border-line bg-base px-2 py-1 text-[12px] text-fg';

function errorText(err: unknown): string | null {
  if (!err) return null;
  if (err instanceof ApiError) {
    return Array.isArray(err.details)
      ? (err.details as Array<{ message: string }>).map((d) => d.message).join('; ')
      : err.message;
  }
  return 'No se pudo completar la acción.';
}

function Dialog({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => ref.current?.showModal(), []);
  return (
    <dialog
      ref={ref}
      onClose={onClose}
      className="m-auto w-[400px] max-w-[calc(100vw-32px)] border border-line bg-surface p-0 text-fg backdrop:bg-black/60"
      aria-label={title}
    >
      <div className="flex h-8 items-center border-b border-line bg-surface-2 px-3">
        <h2 className="text-[11px] font-medium uppercase tracking-wider text-fg-muted">{title}</h2>
        <button
          type="button"
          onClick={() => ref.current?.close()}
          className="ml-auto text-fg-muted hover:text-fg"
          aria-label="Cerrar"
        >
          <X size={14} strokeWidth={1.5} />
        </button>
      </div>
      {children}
    </dialog>
  );
}

function CreateUserDialog({ onClose }: { onClose: () => void }) {
  const create = useCreateUser();
  const [form, setForm] = useState({
    name: '',
    email: '',
    password: '',
    role: 'operator' as RoleName,
  });
  const submit = (e: FormEvent) => {
    e.preventDefault();
    create.mutate(form, { onSuccess: onClose });
  };
  return (
    <Dialog title="Nuevo usuario" onClose={onClose}>
      <form onSubmit={submit} className="space-y-2.5 p-3">
        <label className="block">
          <span className="mb-1 block text-[12px] text-fg-muted">Nombre</span>
          <input
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            className={`${field} w-full`}
            required
            minLength={2}
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-[12px] text-fg-muted">Correo</span>
          <input
            type="email"
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
            className={`${field} w-full`}
            required
            autoComplete="off"
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-[12px] text-fg-muted">Contraseña inicial (mín. 8)</span>
          <input
            type="password"
            value={form.password}
            onChange={(e) => setForm({ ...form, password: e.target.value })}
            className={`${field} w-full`}
            required
            minLength={8}
            autoComplete="new-password"
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-[12px] text-fg-muted">Rol</span>
          <select
            value={form.role}
            onChange={(e) => setForm({ ...form, role: e.target.value as RoleName })}
            className={`${field} w-full`}
          >
            {ROLE_NAMES.map((r) => (
              <option key={r} value={r}>
                {ROLE_LABEL[r]}
              </option>
            ))}
          </select>
        </label>
        {create.error && (
          <p
            role="alert"
            className="border border-danger/50 bg-danger/10 px-2 py-1 text-[12px] text-critical"
          >
            {errorText(create.error)}
          </p>
        )}
        <div className="flex justify-end gap-2 pt-1">
          <button
            type="submit"
            disabled={create.isPending}
            className="rounded-sm border border-accent bg-accent px-3 py-1 text-[12px] text-white disabled:opacity-50"
          >
            {create.isPending ? 'Creando…' : 'Crear usuario'}
          </button>
        </div>
      </form>
    </Dialog>
  );
}

function ResetPasswordDialog({ user, onClose }: { user: UserAdminDto; onClose: () => void }) {
  const update = useUpdateUser();
  const [password, setPassword] = useState('');
  return (
    <Dialog title={`Restablecer contraseña · ${user.name}`} onClose={onClose}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          update.mutate({ id: user.id, patch: { password } }, { onSuccess: onClose });
        }}
        className="space-y-2.5 p-3"
      >
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Nueva contraseña (mín. 8)"
          minLength={8}
          required
          autoComplete="new-password"
          className={`${field} w-full`}
        />
        <p className="text-[11px] text-fg-muted">
          Se cerrarán todas las sesiones abiertas de este usuario.
        </p>
        {update.error && (
          <p role="alert" className="text-[12px] text-critical">
            {errorText(update.error)}
          </p>
        )}
        <div className="flex justify-end">
          <button
            type="submit"
            disabled={update.isPending}
            className="rounded-sm border border-accent bg-accent px-3 py-1 text-[12px] text-white disabled:opacity-50"
          >
            Guardar
          </button>
        </div>
      </form>
    </Dialog>
  );
}

/** Spec §7.2 "Usuarios": CRUD (admin only). Deleting deactivates the account. */
export function UsersPage() {
  const me = useAuth((s) => s.user);
  const [q, setQ] = useState('');
  const [role, setRole] = useState('');
  const [status, setStatus] = useState('');
  const [debounced, setDebounced] = useState('');
  const [creating, setCreating] = useState(false);
  const [resetting, setResetting] = useState<UserAdminDto | null>(null);
  const update = useUpdateUser();
  const deactivate = useDeactivateUser();

  useEffect(() => {
    const t = window.setTimeout(() => setDebounced(q.trim()), 300);
    return () => window.clearTimeout(t);
  }, [q]);
  const users = useUsers({
    q: debounced || undefined,
    role: role || undefined,
    status: status || undefined,
  });
  const actionError = errorText(update.error ?? deactivate.error);

  return (
    <section className="flex h-full min-h-0 flex-col">
      <div className="flex flex-wrap items-center gap-2 border-b border-line bg-surface px-3 py-2">
        <div className="relative">
          <Search
            size={13}
            strokeWidth={1.5}
            className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-fg-muted"
            aria-hidden
          />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Nombre o correo"
            aria-label="Buscar usuarios"
            className={`${field} w-56 pl-7`}
          />
        </div>
        <select
          value={role}
          onChange={(e) => setRole(e.target.value)}
          className={field}
          aria-label="Rol"
        >
          <option value="">Todos los roles</option>
          {ROLE_NAMES.map((r) => (
            <option key={r} value={r}>
              {ROLE_LABEL[r]}
            </option>
          ))}
        </select>
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          className={field}
          aria-label="Estado"
        >
          <option value="">Todos los estados</option>
          {USER_STATUSES.map((s) => (
            <option key={s} value={s}>
              {STATUS_LABEL[s]}
            </option>
          ))}
        </select>
        <span className="flex-1" />
        <button
          type="button"
          onClick={() => setCreating(true)}
          className="inline-flex items-center gap-1 rounded-sm border border-accent bg-accent px-2 py-1 text-[12px] text-white"
        >
          <Plus size={13} strokeWidth={1.5} aria-hidden /> Nuevo usuario
        </button>
      </div>
      {actionError && <ErrorLine message={actionError} />}
      <div className="min-h-0 flex-1 overflow-auto">
        {users.error ? (
          <ErrorLine
            message="No se pudieron cargar los usuarios."
            onRetry={() => void users.refetch()}
          />
        ) : users.isLoading ? (
          <SkeletonRows rows={6} cols={6} />
        ) : !users.data?.length ? (
          <Empty>Sin usuarios con estos filtros.</Empty>
        ) : (
          <table className="w-full text-left">
            <thead className="sticky top-0 bg-surface-2 text-[11px] uppercase tracking-wider text-fg-muted">
              <tr className="border-b border-line">
                <th className="px-3 py-1.5 font-medium">Nombre</th>
                <th className="px-3 py-1.5 font-medium">Correo</th>
                <th className="px-3 py-1.5 font-medium">Rol</th>
                <th className="px-3 py-1.5 font-medium">Estado</th>
                <th className="px-3 py-1.5 font-medium">Alta</th>
                <th className="px-3 py-1.5 font-medium">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {users.data.map((u) => {
                const self = u.id === me?.id;
                return (
                  <tr key={u.id} className="border-b border-line">
                    <td className="px-3 py-1.5">
                      {u.name} {self && <span className="text-[11px] text-fg-muted">(tú)</span>}
                    </td>
                    <td className="px-3 py-1.5 font-mono text-[12px] text-fg-muted">{u.email}</td>
                    <td className="px-3 py-1.5">
                      <select
                        value={u.role}
                        disabled={self || update.isPending}
                        onChange={(e) =>
                          update.mutate({ id: u.id, patch: { role: e.target.value as RoleName } })
                        }
                        className={field}
                        aria-label={`Rol de ${u.name}`}
                      >
                        {ROLE_NAMES.map((r) => (
                          <option key={r} value={r}>
                            {ROLE_LABEL[r]}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="px-3 py-1.5">
                      {self ? (
                        <Chip tone="ok" label={STATUS_LABEL[u.status]} />
                      ) : (
                        <select
                          value={u.status}
                          disabled={update.isPending}
                          onChange={(e) =>
                            update.mutate({
                              id: u.id,
                              patch: { status: e.target.value as UserStatus },
                            })
                          }
                          className={field}
                          aria-label={`Estado de ${u.name}`}
                        >
                          {USER_STATUSES.map((s) => (
                            <option key={s} value={s}>
                              {STATUS_LABEL[s]}
                            </option>
                          ))}
                        </select>
                      )}
                    </td>
                    <td className="px-3 py-1.5 font-mono text-[11px] text-fg-muted">
                      {formatDateTime(u.created_at)}
                    </td>
                    <td className="px-3 py-1.5">
                      <div className="flex gap-1.5">
                        <button
                          type="button"
                          onClick={() => setResetting(u)}
                          className="inline-flex items-center gap-1 rounded-sm border border-line px-2 py-0.5 text-[12px] hover:border-accent"
                        >
                          <KeyRound size={12} strokeWidth={1.5} aria-hidden /> Contraseña
                        </button>
                        {!self && u.status === 'active' && (
                          <button
                            type="button"
                            disabled={deactivate.isPending}
                            onClick={() => {
                              if (
                                window.confirm(`¿Desactivar a ${u.name}? No podrá iniciar sesión.`)
                              )
                                deactivate.mutate(u.id);
                            }}
                            className="inline-flex items-center gap-1 rounded-sm border border-danger/60 px-2 py-0.5 text-[12px] text-critical hover:bg-danger/10"
                          >
                            <UserX size={12} strokeWidth={1.5} aria-hidden /> Desactivar
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
      {creating && <CreateUserDialog onClose={() => setCreating(false)} />}
      {resetting && <ResetPasswordDialog user={resetting} onClose={() => setResetting(null)} />}
    </section>
  );
}
