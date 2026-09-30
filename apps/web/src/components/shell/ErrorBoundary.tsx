import { AlertTriangle, RotateCw } from 'lucide-react';
import { Component, type ErrorInfo, type ReactNode } from 'react';

interface State {
  error: Error | null;
}

/**
 * Catches render errors in a view so one broken panel never blanks the whole control
 * center. The shell (top bar, nav, live strip) stays usable around it.
 */
export class ErrorBoundary extends Component<{ children: ReactNode; resetKey?: string }, State> {
  override state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    // No user data in the log: component stack + message only.
    console.error('[simu] view crashed', error.message, info.componentStack);
  }

  override componentDidUpdate(prev: { resetKey?: string }): void {
    // Navigating to another view clears the error.
    if (this.state.error && prev.resetKey !== this.props.resetKey) this.setState({ error: null });
  }

  override render(): ReactNode {
    if (!this.state.error) return this.props.children;
    return (
      <div role="alert" className="m-4 max-w-xl border border-danger/50 bg-surface">
        <div className="flex h-8 items-center gap-2 border-b border-line bg-surface-2 px-3 text-critical">
          <AlertTriangle size={14} strokeWidth={1.5} aria-hidden />
          <span className="text-[11px] font-medium uppercase tracking-wider">Esta vista falló</span>
        </div>
        <div className="space-y-2 p-3">
          <p className="text-[12px] text-fg-muted">
            Ocurrió un error al mostrar esta vista. El resto del centro de control sigue
            funcionando.
          </p>
          <p className="font-mono text-[11px] text-fg-muted">{this.state.error.message}</p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => this.setState({ error: null })}
              className="inline-flex items-center gap-1 rounded-sm border border-accent bg-accent px-2 py-1 text-[12px] text-white"
            >
              <RotateCw size={12} strokeWidth={1.5} aria-hidden /> Reintentar
            </button>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="rounded-sm border border-line px-2 py-1 text-[12px] hover:border-accent"
            >
              Recargar página
            </button>
          </div>
        </div>
      </div>
    );
  }
}
