import type { HealthResponse, RoleName, TokenResponse } from '@simu/shared-types';
import { useQuery } from '@tanstack/react-query';
import { LogIn } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { Chip } from '../components/ui/Chip';
import { API_BASE, ApiError, request, UnreachableError } from '../lib/api';
import { formatTime } from '../lib/format';
import { ROLE_LABEL } from '../lib/labels';
import { useAuth } from '../stores/auth';

/** Demo accounts from the seed (password comes from SEED_DEMO_PASSWORD, default simu2026). */
const DEMO_ACCOUNTS: ReadonlyArray<{ email: string; role: RoleName }> = [
  { email: 'admin@simu.local', role: 'admin' },
  { email: 'operador@simu.local', role: 'operator' },
  { email: 'mantenimiento@simu.local', role: 'maintenance' },
  { email: 'ciudadano@simu.local', role: 'citizen' },
];

function ServiceStatus() {
  const { data, isError, dataUpdatedAt } = useQuery({
    queryKey: ['health'],
    queryFn: async () => {
      const res = await fetch(`${API_BASE}/health`);
      return (await res.json()) as HealthResponse;
    },
    refetchInterval: 15_000,
    retry: false,
  });
  const rows: Array<[string, boolean | null, string]> = [
    ['API', isError ? false : data ? data.status === 'ok' : null, data ? `v${data.version}` : '—'],
    [
      'PostgreSQL',
      isError ? false : data ? data.db === 'up' : null,
      data?.db === 'up' ? 'conexión OK' : '—',
    ],
    [
      'PostGIS',
      isError ? false : data ? data.postgis !== null : null,
      data?.postgis ? `lib ${data.postgis}` : '—',
    ],
  ];
  return (
    <div className="border border-line bg-surface">
      <div className="flex h-8 items-center justify-between border-b border-line bg-surface-2 px-3">
        <span className="text-[11px] font-medium uppercase tracking-wider text-fg-muted">
          Estado de servicios
        </span>
        <span className="font-mono text-[11px] text-fg-muted">
          {dataUpdatedAt ? formatTime(dataUpdatedAt) : '—'}
        </span>
      </div>
      <table className="w-full">
        <tbody>
          {rows.map(([name, ok, detail]) => (
            <tr key={name} className="border-b border-line last:border-b-0">
              <td className="px-3 py-1.5">{name}</td>
              <td className="px-3 py-1.5">
                <Chip
                  tone={ok === null ? 'neutral' : ok ? 'ok' : 'danger'}
                  label={ok === null ? 'verificando' : ok ? 'en línea' : 'caído'}
                />
              </td>
              <td className="px-3 py-1.5 font-mono text-[12px] text-fg-muted">{detail}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function LoginPage() {
  const status = useAuth((s) => s.status);
  const navigate = useNavigate();
  const location = useLocation();
  const from = (location.state as { from?: string } | null)?.from ?? '/';
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  if (status === 'authenticated') return <Navigate to={from} replace />;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const tokens = await request<TokenResponse>('/auth/login', {
        method: 'POST',
        body: { email, password },
        auth: false,
      });
      useAuth.getState().setSession(tokens);
      navigate(from, { replace: true });
    } catch (err) {
      if (err instanceof UnreachableError)
        setError('Servidor no disponible. Intenta de nuevo en unos segundos.');
      else if (err instanceof ApiError && err.status === 429)
        setError('Demasiados intentos. Espera un minuto.');
      else if (err instanceof ApiError) setError(err.message);
      else setError('No se pudo iniciar sesión.');
    } finally {
      setSubmitting(false);
    }
  };

  const input =
    'w-full rounded-sm border border-line bg-base px-2.5 py-1.5 text-fg outline-none focus:border-accent';

  return (
    <div className="flex h-full flex-col">
      <header className="flex h-10 items-center border-b border-line bg-surface px-4">
        <span className="font-mono text-[13px] font-medium tracking-wide">ViaLia · CDMX</span>
        <span className="ml-3 text-[12px] text-fg-muted">
          Sistema Inteligente de Monitoreo Urbano
        </span>
      </header>

      <main className="grid flex-1 content-start gap-6 p-6 md:grid-cols-[360px_minmax(0,520px)]">
        <section className="border border-line bg-surface">
          <div className="flex h-8 items-center border-b border-line bg-surface-2 px-3">
            <h1 className="text-[11px] font-medium uppercase tracking-wider text-fg-muted">
              Acceso al centro de control
            </h1>
          </div>
          <form onSubmit={(e) => void submit(e)} className="space-y-3 p-3" noValidate>
            <label className="block">
              <span className="mb-1 block text-[12px] text-fg-muted">Correo</span>
              <input
                className={input}
                type="email"
                autoComplete="username"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoFocus
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-[12px] text-fg-muted">Contraseña</span>
              <input
                className={input}
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </label>
            {error && (
              <p
                role="alert"
                className="border border-danger/50 bg-danger/10 px-2 py-1 text-[12px] text-critical"
              >
                {error}
              </p>
            )}
            <button
              type="submit"
              disabled={submitting || !email || !password}
              className="inline-flex w-full items-center justify-center gap-2 rounded-sm border border-accent bg-accent px-3 py-1.5 font-medium text-white disabled:opacity-50"
            >
              <LogIn size={14} strokeWidth={1.5} aria-hidden />
              {submitting ? 'Verificando…' : 'Iniciar sesión'}
            </button>
          </form>
        </section>

        <div className="space-y-6">
          <section className="border border-line bg-surface">
            <div className="flex h-8 items-center border-b border-line bg-surface-2 px-3">
              <h2 className="text-[11px] font-medium uppercase tracking-wider text-fg-muted">
                Cuentas de demostración
              </h2>
              <span className="ml-auto font-mono text-[11px] text-fg-muted">
                contraseña: simu2026
              </span>
            </div>
            <table className="w-full">
              <tbody>
                {DEMO_ACCOUNTS.map((a) => (
                  <tr key={a.email} className="border-b border-line last:border-b-0">
                    <td className="px-3 py-1.5 font-mono text-[12px]">{a.email}</td>
                    <td className="px-3 py-1.5 text-fg-muted">{ROLE_LABEL[a.role]}</td>
                    <td className="px-3 py-1.5 text-right">
                      <button
                        type="button"
                        onClick={() => {
                          setEmail(a.email);
                          setPassword('simu2026');
                        }}
                        className="rounded-sm border border-line px-2 py-0.5 text-[12px] hover:border-accent"
                      >
                        Usar
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
          <ServiceStatus />
        </div>
      </main>
    </div>
  );
}
