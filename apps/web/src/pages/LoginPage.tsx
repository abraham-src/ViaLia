import '@fontsource-variable/plus-jakarta-sans';

import type { HealthResponse, RoleName, TokenResponse } from '@simu/shared-types';
import { useQuery } from '@tanstack/react-query';
import { BellRing, CloudRain, LogIn, ScanEye, type LucideIcon } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { LogoMark } from '../centro/components/Logo';
import { BRAND } from '../centro/brand';
import { API_BASE, ApiError, request, UnreachableError } from '../lib/api';
import { ROLE_LABEL } from '../lib/labels';
import { useAuth } from '../stores/auth';

/** Demo accounts from the seed (password comes from SEED_DEMO_PASSWORD, default simu2026). */
const DEMO_ACCOUNTS: ReadonlyArray<{ email: string; role: RoleName }> = [
  { email: 'admin@simu.local', role: 'admin' },
  { email: 'operador@simu.local', role: 'operator' },
  { email: 'mantenimiento@simu.local', role: 'maintenance' },
  { email: 'ciudadano@simu.local', role: 'citizen' },
];

/** Lo que ViaLia hace, en palabras de quien no es técnico. */
const VALUE: ReadonlyArray<{ icon: LucideIcon; title: string; text: string }> = [
  {
    icon: ScanEye,
    title: 'Ve la calle en tiempo real',
    text: 'Cámaras con IA y coladeras con sensor detectan obstáculos, choques y agua acumulada.',
  },
  {
    icon: CloudRain,
    title: 'Se anticipa a la lluvia',
    text: 'Combina pronóstico, nivel de coladeras e historial para avisar antes de que se inunde.',
  },
  {
    icon: BellRing,
    title: 'Actúa en minutos',
    text: 'Crea la incidencia, ajusta el semáforo y asigna a la cuadrilla más cercana.',
  },
];

function ServiceStatus() {
  const { data, isError } = useQuery({
    queryKey: ['health'],
    queryFn: async () => {
      const res = await fetch(`${API_BASE}/health`);
      return (await res.json()) as HealthResponse;
    },
    refetchInterval: 15_000,
    retry: false,
  });
  const rows: Array<[string, boolean | null]> = [
    ['API', isError ? false : data ? data.status === 'ok' : null],
    ['Base de datos', isError ? false : data ? data.db === 'up' : null],
    ['Mapas (PostGIS)', isError ? false : data ? data.postgis !== null : null],
  ];
  return (
    <ul className="flex flex-wrap gap-2" aria-label="Estado de servicios">
      {rows.map(([name, ok]) => (
        <li
          key={name}
          className="inline-flex items-center gap-2 rounded-full bg-white/[0.08] px-3 py-1.5 text-[12px] font-medium text-[#dbe4ef]"
        >
          <span
            className={`size-2 rounded-full ${
              ok === null ? 'bg-[#b8bbc0]' : ok ? 'bg-[#34d399]' : 'bg-[#f87171]'
            }`}
          />
          {name}
          <span className="text-[#9fb0c6]">
            {ok === null ? 'verificando' : ok ? 'en línea' : 'caído'}
          </span>
        </li>
      ))}
    </ul>
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
    'w-full rounded-[12px] border border-cx-line bg-white px-3.5 py-2.5 text-[14px] text-cx-ink outline-none transition placeholder:text-cx-ink3 focus:border-cx-blue focus:ring-4 focus:ring-cx-blue/15';

  return (
    <div className="grid min-h-full bg-cx-bg font-display text-cx-ink lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
      {/* Marca: qué es ViaLia, para público y empresas */}
      <aside className="relative overflow-hidden bg-gradient-to-br from-[#1b3d66] via-cx-navy to-[#0b1d33] px-6 py-8 text-white sm:px-10 lg:flex lg:flex-col lg:px-14 lg:py-12">
        <div
          className="pointer-events-none absolute -right-24 -top-24 size-[420px] rounded-full bg-[radial-gradient(circle,rgb(184_187_192/0.18),transparent_65%)]"
          aria-hidden
        />
        <div
          className="pointer-events-none absolute -bottom-32 -left-20 size-[380px] rounded-full bg-[radial-gradient(circle,rgb(31_95_166/0.45),transparent_65%)]"
          aria-hidden
        />
        <div className="relative flex items-center gap-3">
          <LogoMark size={48} />
          <div className="leading-tight">
            <div className="text-[22px] font-extrabold tracking-[-0.02em]">{BRAND.name}</div>
            <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#aebccd]">
              {BRAND.tagline}
            </div>
          </div>
        </div>

        <div className="relative mt-8 max-w-[520px] lg:mt-auto">
          <h1 className="text-[30px] font-extrabold leading-[1.1] tracking-[-0.03em] sm:text-[40px]">
            La ciudad que se anticipa.
          </h1>
          <p className="mt-3 text-[15px] leading-relaxed text-[#c9d6e5] sm:text-[16px]">
            Movilidad, seguridad e infraestructura de la {BRAND.city} en un solo centro de control
            inteligente.
          </p>
          <ul className="mt-7 hidden flex-col gap-4 sm:flex">
            {VALUE.map(({ icon: Icon, title, text }) => (
              <li key={title} className="flex gap-3.5">
                <span className="grid size-10 shrink-0 place-items-center rounded-[12px] bg-white/10 ring-1 ring-white/15">
                  <Icon size={19} strokeWidth={2} aria-hidden />
                </span>
                <span>
                  <span className="block text-[14.5px] font-bold">{title}</span>
                  <span className="block text-[13.5px] leading-snug text-[#aebccd]">{text}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>

        <div className="relative mt-8 lg:mt-auto">
          <ServiceStatus />
        </div>
      </aside>

      {/* Acceso */}
      <main className="flex items-start justify-center px-4 py-8 sm:px-8 lg:items-center lg:py-12">
        <div className="w-full max-w-[440px]">
          <h2 className="text-[26px] font-extrabold tracking-[-0.02em]">Bienvenido</h2>
          <p className="mt-1 text-[14.5px] text-cx-ink3">
            Entra al centro de control con tu cuenta.
          </p>

          <form
            onSubmit={(e) => void submit(e)}
            className="mt-6 space-y-4 rounded-[20px] border border-cx-line bg-white p-5 shadow-cx sm:p-6"
            noValidate
          >
            <label className="block">
              <span className="mb-1.5 block text-[13px] font-semibold text-cx-ink2">Correo</span>
              <input
                className={input}
                type="email"
                autoComplete="username"
                placeholder="tu@correo.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoFocus
              />
            </label>
            <label className="block">
              <span className="mb-1.5 block text-[13px] font-semibold text-cx-ink2">
                Contraseña
              </span>
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
                className="rounded-[12px] border border-[#f3c7c9] bg-[#fff5f5] px-3 py-2 text-[13px] font-medium text-[#c62a2f]"
              >
                {error}
              </p>
            )}
            <button
              type="submit"
              disabled={submitting || !email || !password}
              className="inline-flex w-full items-center justify-center gap-2 rounded-[12px] bg-cx-navy px-4 py-3 text-[14.5px] font-bold text-white shadow-[0_14px_28px_-14px_rgb(20_50_84/0.9)] transition hover:bg-[#1b3d66] disabled:cursor-not-allowed disabled:opacity-50"
            >
              <LogIn size={17} strokeWidth={2.2} aria-hidden />
              {submitting ? 'Verificando…' : 'Iniciar sesión'}
            </button>
          </form>

          <section className="mt-5 rounded-[20px] border border-cx-line bg-white p-2 shadow-cx">
            <div className="flex flex-wrap items-baseline justify-between gap-2 px-3 pb-1 pt-2">
              <h3 className="text-[13px] font-bold">Cuentas de demostración</h3>
              <span className="text-[12px] text-cx-ink3">
                contraseña <span className="font-semibold text-cx-ink2">simu2026</span>
              </span>
            </div>
            <table className="w-full">
              <tbody>
                {DEMO_ACCOUNTS.map((a) => (
                  <tr key={a.email} className="border-t border-cx-line2 first:border-t-0">
                    <td className="px-3 py-2">
                      <span className="block text-[13px] font-semibold">{ROLE_LABEL[a.role]}</span>
                      <span className="block break-all text-[12px] text-cx-ink3">{a.email}</span>
                    </td>
                    <td className="px-3 py-2 text-right">
                      <button
                        type="button"
                        onClick={() => {
                          setEmail(a.email);
                          setPassword('simu2026');
                        }}
                        className="rounded-[10px] bg-cx-bluesoft px-3 py-1.5 text-[12.5px] font-semibold text-cx-blue transition hover:bg-[#d6e4f3]"
                      >
                        Usar
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        </div>
      </main>
    </div>
  );
}
