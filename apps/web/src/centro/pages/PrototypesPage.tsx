import { Boxes, Download, MousePointer2, Radio, TrafficCone } from 'lucide-react';
import { useCallback, useRef, useState, type ReactNode } from 'react';
import { TopActions } from '../components/TopActions';
import { Button, Card, Note, PageHeader, Pill, Segmented, Toggle } from '../components/ui';
import { useCxData } from '../data/useCxData';
import {
  DRAIN_VIEWS,
  buildDrainCover,
  measuredCm,
  type DrainState,
} from '../prototypes/drainCoverModel';
import {
  TRAFFIC_LIGHT_VIEWS,
  buildTrafficLight,
  type TrafficLightState,
} from '../prototypes/trafficLightModel';
import { Viewer3D, type Viewer3DHandle } from '../prototypes/Viewer3D';
import { LIMITS, lampFor, pedSignal, type SimState } from '../sim/intersection';
import { MAIN_LIGHT, useSignal } from '../sim/store';

const DRAIN_CODE = 'DRAIN-001';

function download(blob: Blob | null, name: string) {
  if (!blob) return;
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function trafficState(sim: SimState, showFov: boolean): TrafficLightState {
  const ped = pedSignal(sim);
  const { kind, elapsed } = sim.phase;
  const countdown =
    kind === 'walk'
      ? Math.ceil(LIMITS.walk + LIMITS.flash - elapsed)
      : kind === 'flash'
        ? Math.ceil(LIMITS.flash - elapsed)
        : null;
  return { lamp: lampFor(sim, 'N'), ped, countdown, aiOnline: sim.aiOnline, showFov };
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="mt-4">
      <h3 className="text-[11.5px] font-bold uppercase tracking-[0.12em] text-cx-ink3">{title}</h3>
      <div className="mt-1.5 text-[13.5px] leading-relaxed text-cx-ink2">{children}</div>
    </div>
  );
}

function Steps({ items }: { items: ReactNode[] }) {
  return (
    <ol className="flex flex-col gap-1.5">
      {items.map((it, i) => (
        <li key={i} className="flex gap-2.5">
          <span className="mt-[1px] grid size-5 shrink-0 place-items-center rounded-full bg-cx-bluesoft text-[11px] font-bold text-cx-blue">
            {i + 1}
          </span>
          <span>{it}</span>
        </li>
      ))}
    </ol>
  );
}

function Bullets({ items }: { items: ReactNode[] }) {
  return (
    <ul className="flex flex-col gap-1">
      {items.map((it, i) => (
        <li key={i} className="flex gap-2">
          <span className="mt-[8px] size-1.5 shrink-0 rounded-full bg-cx-blue" />
          <span>{it}</span>
        </li>
      ))}
    </ul>
  );
}

function Specs({ rows }: { rows: Array<[string, string]> }) {
  return (
    <dl className="divide-y divide-cx-line2 rounded-[12px] border border-cx-line">
      {rows.map(([k, v]) => (
        <div key={k} className="grid grid-cols-[120px_minmax(0,1fr)] gap-3 px-3 py-2 text-[12.5px]">
          <dt className="font-semibold text-cx-ink">{k}</dt>
          <dd className="text-cx-ink2">{v}</dd>
        </div>
      ))}
    </dl>
  );
}

function ViewerFrame({
  viewer,
  toolbar,
  footer,
}: {
  viewer: ReactNode;
  toolbar: ReactNode;
  footer: ReactNode;
}) {
  return (
    <section className="relative overflow-hidden rounded-[22px] border border-cx-line bg-gradient-to-b from-[#f4f7fb] to-[#e4eaf2] shadow-cx">
      {viewer}
      <div className="pointer-events-none absolute inset-x-4 top-4 flex flex-wrap items-start justify-between gap-2 [&>*]:pointer-events-auto">
        {toolbar}
      </div>
      <div className="pointer-events-none absolute inset-x-4 bottom-4 flex flex-wrap items-end justify-between gap-2 [&>*]:pointer-events-auto">
        {footer}
      </div>
    </section>
  );
}

function HoverHint() {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-white/90 px-3 py-1.5 text-[12px] font-semibold text-cx-ink2 shadow-cx">
      <MousePointer2 size={13} /> Pasa el cursor: el modelo te sigue
    </span>
  );
}

// ───────────────────────── Semáforo ─────────────────────────

const PHASE_TEXT = {
  green: 'Verde',
  yellow: 'Amarillo',
  allred: 'Todo en rojo',
  walk: 'Cruce peatonal',
  flash: 'Peatones: despejar',
} as const;

function TrafficLiveLine() {
  const sim = useSignal((s) => s.sim);
  useSignal((s) => s.v);
  const lamp = lampFor(sim, 'N');
  const color = { red: '#e5484d', yellow: '#d97706', green: '#16a34a' }[lamp];
  return (
    <span className="inline-flex items-center gap-2 rounded-full bg-white/90 px-3 py-1.5 text-[12px] font-semibold text-cx-ink shadow-cx">
      <span className="size-2.5 rounded-full" style={{ background: color }} />
      {MAIN_LIGHT} en vivo · {PHASE_TEXT[sim.phase.kind]} · IA{' '}
      {sim.aiOnline ? 'en línea' : 'fuera (modo seguro)'}
    </span>
  );
}

function TrafficLightPrototype() {
  const [view, setView] = useState<keyof typeof TRAFFIC_LIGHT_VIEWS>('conjunto');
  const [fov, setFov] = useState(true);
  const fovRef = useRef(fov);
  fovRef.current = fov;
  const viewer = useRef<Viewer3DHandle>(null);
  const build = useCallback(
    () => buildTrafficLight(() => trafficState(useSignal.getState().sim, fovRef.current)),
    [],
  );

  return (
    <div className="grid grid-cols-[minmax(0,1.3fr)_minmax(360px,1fr)] items-start gap-5">
      <ViewerFrame
        viewer={
          <Viewer3D
            ref={viewer}
            build={build}
            view={TRAFFIC_LIGHT_VIEWS[view]}
            className="h-[600px] w-full"
            ariaLabel="Modelo 3D del semáforo adaptativo con cámara de IA integrada"
          />
        }
        toolbar={
          <>
            <Segmented
              size="sm"
              value={view}
              onChange={setView}
              options={[
                { value: 'conjunto', label: 'Conjunto' },
                { value: 'cabeza', label: 'Cabeza + cámara' },
                { value: 'base', label: 'Botón y gabinete' },
              ]}
            />
            <TrafficLiveLine />
          </>
        }
        footer={
          <>
            <HoverHint />
            <div className="flex items-center gap-2">
              <div className="rounded-[12px] bg-white/95 px-3 py-2 shadow-cx">
                <Toggle checked={fov} onChange={setFov} label="Campo de visión" />
              </div>
              <Button
                variant="ghost"
                icon={Download}
                className="!bg-white/95 shadow-cx"
                onClick={() =>
                  download(viewer.current?.exportStl() ?? null, 'vialia-semaforo-camara-ia.stl')
                }
              >
                STL
              </Button>
            </div>
          </>
        }
      />

      <Card
        title="Semáforo adaptativo con cámara de IA integrada"
        icon={TrafficCone}
        action={<Pill color="#0f766e">Prototipo 1</Pill>}
        bodyClassName="!pt-1"
      >
        <Section title="Qué es">
          Un semáforo vehicular estándar (lentes LED de 300 mm) que trae la cámara de IA dentro de
          la misma cabeza. Se instala en el poste y la ménsula que ya existen: no hay que poner otro
          poste ni tender otro cable para la cámara.
        </Section>
        <Section title="Cómo funciona">
          <Steps
            items={[
              'La cámara, inclinada 20° y con infrarrojo para la noche, ve los accesos del cruce. El cómputo de borde del gabinete cuenta vehículos y peatones por zona sin mandar video a la nube.',
              `El controlador alarga o corta el verde según colas y esperas, pero nunca rompe las reglas fijas: verde de ${LIMITS.minGreen} a ${LIMITS.maxGreen} s, amarillo de ${LIMITS.yellow} s, todo en rojo de ${LIMITS.allRed} s y peatón esperando ${LIMITS.pedMaxWait} s como máximo.`,
              'Si la misma cámara detecta agua, un choque u obstáculo, avisa a ViaLia y el semáforo limita el flujo hacia esa zona.',
              'Si la IA deja de reportar, el controlador pasa solo al plan fijo (modo seguro). El UPS lo mantiene funcionando 4 h sin luz.',
            ]}
          />
        </Section>
        <Section title="En qué aporta">
          <Bullets
            items={[
              'Menos espera en cruces con demanda desigual: el verde va a donde está la fila.',
              'Cruce más seguro y accesible: cuenta regresiva, botón con señal sonora y flecha táctil.',
              'Detección temprana de encharcamientos e incidentes en el mismo punto donde se controla el tráfico.',
              'Privacidad: el video se procesa en sitio; a la plataforma solo llegan conteos y eventos.',
            ]}
          />
        </Section>
        <Section title="Especificación propuesta">
          <Specs
            rows={[
              [
                'Cabeza',
                '3 × LED 300 mm, policarbonato, viseras túnel, placa de contraste con borde retrorreflejante',
              ],
              ['Cámara', '4 MP, WDR, IR 30 m, IP66, inclinación 20°, antena LTE'],
              ['Cómputo', 'Módulo de IA de borde (~20 TOPS) en el gabinete'],
              ['Peatones', 'Cabeza con cuenta regresiva y botón accesible'],
              ['Energía', '127 V + UPS de 4 h'],
              ['Estructura', 'Poste cónico galvanizado de 6 m, ménsula de 4.4 m'],
            ]}
          />
        </Section>
      </Card>
    </div>
  );
}

// ───────────────────────── Coladera ─────────────────────────

function drainColor(level: number): string {
  return level > 90 ? '#dc2626' : level > 80 ? '#ea580c' : level >= 50 ? '#d97706' : '#16a34a';
}

function DrainCoverPrototype() {
  const data = useCxData();
  const live = data.byCode.get(DRAIN_CODE)?.drain?.obstruction_level;
  const level = typeof live === 'number' ? live : 35;
  const [view, setView] = useState<keyof typeof DRAIN_VIEWS>('conjunto');
  const [exploded, setExploded] = useState(false);
  const stateRef = useRef<DrainState>({ level, exploded });
  stateRef.current = { level, exploded };
  const viewer = useRef<Viewer3DHandle>(null);
  const build = useCallback(() => buildDrainCover(() => stateRef.current), []);

  return (
    <div className="grid grid-cols-[minmax(0,1.3fr)_minmax(360px,1fr)] items-start gap-5">
      <ViewerFrame
        viewer={
          <Viewer3D
            ref={viewer}
            build={build}
            view={DRAIN_VIEWS[view]}
            className="h-[600px] w-full"
            ariaLabel="Modelo 3D de la coladera inteligente en corte"
          />
        }
        toolbar={
          <>
            <Segmented
              size="sm"
              value={view}
              onChange={setView}
              options={[
                { value: 'conjunto', label: 'Corte del pozo' },
                { value: 'modulo', label: 'Módulo sensor' },
                { value: 'rejilla', label: 'Rejilla' },
              ]}
            />
            <span className="inline-flex items-center gap-2 rounded-full bg-white/90 px-3 py-1.5 text-[12px] font-semibold text-cx-ink shadow-cx">
              <span className="size-2.5 rounded-full" style={{ background: drainColor(level) }} />
              {DRAIN_CODE} en vivo · {Math.round(level)} % · el sensor mide {measuredCm(level)} cm
            </span>
          </>
        }
        footer={
          <>
            <HoverHint />
            <div className="flex items-center gap-2">
              <div className="rounded-[12px] bg-white/95 px-3 py-2 shadow-cx">
                <Toggle checked={exploded} onChange={setExploded} label="Vista explosionada" />
              </div>
              <Button
                variant="ghost"
                icon={Download}
                className="!bg-white/95 shadow-cx"
                onClick={() =>
                  download(viewer.current?.exportStl() ?? null, 'vialia-coladera-inteligente.stl')
                }
              >
                STL
              </Button>
            </div>
          </>
        }
      />

      <Card
        title="Coladera pluvial inteligente"
        icon={Radio}
        action={<Pill color="#0f766e">Prototipo 2</Pill>}
        bodyClassName="!pt-1"
      >
        <Section title="Qué es">
          Una rejilla pluvial de hierro dúctil que soporta tránsito pesado, con un módulo sensor
          sellado atornillado debajo. Mide cuánto se llena el pozo y avisa antes de que la calle se
          encharque. Entra en el marco estándar de 600 mm, así que se instala sin obra.
        </Section>
        <Section title="Cómo funciona">
          <Steps
            items={[
              'Cada 5 min (cada 30 s si llueve o el nivel sube rápido), el ultrasónico mide la distancia al agua o a la basura acumulada. El firmware la convierte en nivel (%).',
              'La lectura sale por LoRaWAN o NB-IoT a través de la ventana de polímero del centro, porque el hierro bloquea la señal. Llega al gateway, que la guarda y la reenvía cuando vuelve Internet.',
              'ViaLia marca precaución en 50 %, alerta en 80 % y crítico en 90 %. Si además llueve y una cámara ve agua cerca, crea la incidencia y la asigna a una cuadrilla.',
              'Un acelerómetro avisa si la rejilla se mueve o la roban. La canasta retiene la basura y se vacía en el mantenimiento.',
            ]}
          />
        </Section>
        <Section title="En qué aporta">
          <Bullets
            items={[
              'Mantenimiento según el estado real: se limpian las coladeras que lo necesitan, no todas por calendario.',
              'Aviso antes del encharcamiento, cuando todavía se puede actuar.',
              'Menos accidentes por coladeras abiertas o robadas.',
              'Sin cableado: la pila dura 5 años o más.',
            ]}
          />
        </Section>
        <Section title="Especificación propuesta">
          <Specs
            rows={[
              ['Rejilla', 'Hierro dúctil clase D400 (EN 124), Ø 600 mm, ranuras paralelas'],
              ['Sensor', 'Ultrasónico impermeable (tipo JSN-SR04T), 0.25–4.5 m'],
              ['Electrónica', 'Microcontrolador de bajo consumo + acelerómetro, carcasa IP68'],
              ['Radio', 'LoRaWAN 915 MHz o NB-IoT, antena bajo ventana de polímero'],
              ['Energía', 'Pila Li-SOCl₂ de 19 Ah (5 años o más)'],
              ['Canasta', 'Acero inoxidable perforado, anular: deja libre el haz del sensor'],
            ]}
          />
        </Section>
      </Card>
    </div>
  );
}

export function PrototypesPage() {
  return (
    <div className="flex min-h-full flex-col">
      <PageHeader
        title="Prototipos 3D"
        subtitle="Diseños de campo del semáforo con cámara y de la coladera inteligente · conectados a los datos en vivo"
      >
        <TopActions search={false} />
      </PageHeader>
      <div className="flex flex-col gap-6 px-7 pb-8">
        <TrafficLightPrototype />
        <DrainCoverPrototype />
        <Note className="flex items-center gap-1.5 px-1">
          <Boxes size={13} /> Modelos paramétricos en metros. &quot;STL&quot; descarga la pieza en
          milímetros, sin las ayudas visuales (conos, agua, pulsos), para abrirla en un programa CAD
          (Fusion 360, SolidWorks, FreeCAD) o imprimirla en 3D. Las especificaciones son la
          propuesta de diseño, no un producto certificado.
        </Note>
      </div>
    </div>
  );
}
