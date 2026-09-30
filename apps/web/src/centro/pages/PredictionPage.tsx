import type { Feature } from 'geojson';
import {
  CloudRain,
  FlaskConical,
  Lightbulb,
  ListOrdered,
  RotateCcw,
  Sparkles,
  TrendingUp,
} from 'lucide-react';
import { useMemo, useState } from 'react';
import { TopActions } from '../components/TopActions';
import { Legend, RiskCurve } from '../components/charts';
import { Button, Card, Meter, Note, PageHeader, Pill, Segmented } from '../components/ui';
import { lngLatOf } from '../data/useCxData';
import { fc } from '../lib/geo';
import type { Position } from 'geojson';
import { CxMap, MapMarker, type CxView } from '../map/CxMap';
import { FallbackNotice, MapControls } from '../map/controls';
import { DrainGauge } from '../map/markers';
import { LEVEL_COLOR, LEVEL_LABEL, confidenceLabel, type ZoneRisk } from '../risk/model';
import { isScenarioActive, usePrediction, useScenario, type Horizon } from '../risk/usePrediction';

const CITY_VIEW: CxView = {
  center: [-99.152, 19.395],
  zoom: 12.6,
  bounds: [
    [-99.182, 19.343],
    [-99.124, 19.442],
  ],
  padding: { top: 40, bottom: 40, left: 40, right: 40 },
};

function bbox(ring: readonly Position[]): [number, number, number, number] {
  const xs = ring.map((p) => p[0] ?? 0);
  const ys = ring.map((p) => p[1] ?? 0);
  return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
}

function ZoneChip({
  risk,
  active,
  onClick,
}: {
  risk: ZoneRisk;
  active: boolean;
  onClick: () => void;
}) {
  const color = LEVEL_COLOR[risk.level];
  return (
    <button
      type="button"
      onClick={onClick}
      className={`cx-marker flex items-center gap-2 whitespace-nowrap rounded-full border-2 bg-white py-1 pl-1 pr-3 text-[12.5px] font-bold text-cx-ink shadow-cx-lg transition ${
        active ? 'scale-105' : ''
      }`}
      style={{ borderColor: active ? color : '#fff' }}
    >
      <span
        className="grid h-6 min-w-9 place-items-center rounded-full px-1.5 text-[11.5px] font-extrabold text-white"
        style={{ background: color }}
      >
        {Math.round(risk.probability * 100)}%
      </span>
      {risk.name}
    </button>
  );
}

function AlertCard({ risk, horizon }: { risk: ZoneRisk; horizon: number }) {
  const color = LEVEL_COLOR[risk.level];
  const maxW = Math.max(...risk.factors.map((f) => f.weight), 0.01);
  return (
    <section
      className="overflow-hidden rounded-[20px] border bg-white shadow-cx"
      style={{ borderColor: `${color}66` }}
    >
      <header className="flex items-center gap-3 px-5 py-4" style={{ background: `${color}14` }}>
        <span
          className="grid size-10 place-items-center rounded-[12px] text-white"
          style={{ background: color }}
        >
          <CloudRain size={20} strokeWidth={2.3} />
        </span>
        <div className="min-w-0 flex-1">
          <div
            className="text-[11.5px] font-extrabold uppercase tracking-[0.14em]"
            style={{ color }}
          >
            Alerta predictiva
          </div>
          <div className="text-[18px] font-extrabold leading-tight text-cx-ink">{risk.name}</div>
        </div>
        <Pill color={color} soft="#ffffff">
          Riesgo {LEVEL_LABEL[risk.level].toLowerCase()}
        </Pill>
      </header>
      <div className="grid grid-cols-3 gap-2 px-5 pt-4">
        {[
          ['Probabilidad', `${Math.round(risk.probability * 100)} %`],
          ['Horizonte', `${horizon} min`],
          ['Confianza', `${confidenceLabel(risk.confidence)} (${risk.confidence.toFixed(2)})`],
        ].map(([k, v]) => (
          <div key={k} className="rounded-[12px] bg-cx-line2 px-3 py-2">
            <div className="text-[11.5px] text-cx-ink3">{k}</div>
            <div className="text-[15px] font-bold text-cx-ink">{v}</div>
          </div>
        ))}
      </div>
      <div className="px-5 pt-4">
        <div className="text-[12px] font-bold uppercase tracking-[0.1em] text-cx-ink3">Por qué</div>
        <ul className="mt-2 flex flex-col gap-2">
          {risk.factors.slice(0, 5).map((f) => (
            <li key={f.key}>
              <div className="flex items-baseline justify-between gap-3">
                <span className="text-[13px] font-semibold text-cx-ink">{f.label}</span>
                <span className="cx-tabular text-[11.5px] text-cx-ink3">
                  +{(f.weight * 100).toFixed(0)} pts
                </span>
              </div>
              <div className="mt-1">
                <Meter value={(f.weight / maxW) * 100} color={color} height={5} />
              </div>
              <div className="mt-0.5 text-[11.5px] text-cx-ink3">{f.detail}</div>
            </li>
          ))}
        </ul>
      </div>
      <div className="px-5 pb-5 pt-4">
        <div className="text-[12px] font-bold uppercase tracking-[0.1em] text-cx-ink3">
          Acción sugerida
        </div>
        <ul className="mt-2 flex flex-col gap-1.5">
          {risk.actions.map((a) => (
            <li key={a} className="flex items-start gap-2 text-[13px] text-cx-ink2">
              <Lightbulb size={15} className="mt-0.5 shrink-0 text-cx-blue" />
              {a}
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

function ScenarioCard() {
  const { data } = usePrediction();
  const s = useScenario((x) => x.scenario);
  const setRain = useScenario((x) => x.setRain);
  const setRainAt = useScenario((x) => x.setRainAt);
  const setDrain = useScenario((x) => x.setDrain);
  const setAccident = useScenario((x) => x.setAccident);
  const setClosure = useScenario((x) => x.setClosure);
  const reset = useScenario((x) => x.reset);
  const select =
    'w-full rounded-[12px] border border-cx-line bg-white px-3 py-2 text-[13px] text-cx-ink';
  return (
    <Card
      title="Simular escenario"
      icon={FlaskConical}
      action={
        <button
          type="button"
          onClick={reset}
          className="inline-flex items-center gap-1 text-[12.5px] font-semibold text-cx-ink2 hover:text-cx-blue"
        >
          <RotateCcw size={13} /> Restablecer
        </button>
      }
    >
      <Button
        variant="soft"
        icon={Sparkles}
        className="w-full"
        onClick={() => {
          setRain(30);
          setRainAt(30);
        }}
      >
        Lluvia de 30 mm/h en 30 min
      </Button>
      <div className="mt-4">
        <div className="flex items-baseline justify-between">
          <label htmlFor="cx-rain" className="text-[13px] font-semibold text-cx-ink">
            Lluvia pronosticada
          </label>
          <span className="text-[13px] font-bold text-cx-ink">{s.rainPeak} mm/h</span>
        </div>
        <input
          id="cx-rain"
          type="range"
          min={0}
          max={60}
          step={2}
          value={s.rainPeak}
          onChange={(e) => setRain(Number(e.target.value))}
          className="mt-2 w-full accent-[#2563eb]"
        />
        <div className="mt-2 flex items-center justify-between gap-2">
          <span className="text-[12.5px] text-cx-ink3">Pico en</span>
          <Segmented
            size="sm"
            value={String(s.rainPeakAt)}
            onChange={(v) => setRainAt(Number(v))}
            options={[15, 30, 45, 60].map((m) => ({ value: String(m), label: `${m} min` }))}
          />
        </div>
      </div>
      <div className="mt-4 grid grid-cols-1 gap-3">
        <label className="text-[13px] font-semibold text-cx-ink">
          Coladera obstruida (92 %)
          <select
            className={`${select} mt-1.5`}
            value={Object.keys(s.drainOverride)[0] ?? ''}
            onChange={(e) => {
              for (const k of Object.keys(s.drainOverride)) setDrain(k, null);
              if (e.target.value) setDrain(e.target.value, 92);
            }}
          >
            <option value="">Ninguna</option>
            {data.drains.map((d) => (
              <option key={d.device_code} value={d.device_code}>
                {d.device_code} · {d.name.replace(/^Coladera\s+/, '')}
              </option>
            ))}
          </select>
        </label>
        <div className="grid grid-cols-2 gap-3">
          <label className="text-[13px] font-semibold text-cx-ink">
            Accidente en
            <select
              className={`${select} mt-1.5`}
              value={s.accidentZone ?? ''}
              onChange={(e) => setAccident(e.target.value || null)}
            >
              <option value="">Ninguna</option>
              {data.zoneList.map((z) => (
                <option key={z.code} value={z.code}>
                  {z.name}
                </option>
              ))}
            </select>
          </label>
          <label className="text-[13px] font-semibold text-cx-ink">
            Cierre vial en
            <select
              className={`${select} mt-1.5`}
              value={s.closureZone ?? ''}
              onChange={(e) => setClosure(e.target.value || null)}
            >
              <option value="">Ninguna</option>
              {data.zoneList.map((z) => (
                <option key={z.code} value={z.code}>
                  {z.name}
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>
      <Note className="mt-3">
        Gemelo digital: estos cambios solo existen en esta simulación y no tocan los datos reales.
        El pronóstico es manual hasta conectar un servicio meteorológico.
      </Note>
    </Card>
  );
}

export function PredictionPage() {
  const { data, risks, baseline, horizon, scenario } = usePrediction();
  const setHorizon = useScenario((s) => s.setHorizon);
  const [picked, setPicked] = useState<string | null>(null);
  const active = isScenarioActive(scenario);
  const selected = risks.find((r) => r.code === picked) ?? risks[0] ?? null;
  const base = baseline.find((b) => b.code === selected?.code);

  const overlays = useMemo(() => {
    const areas: Feature[] = [];
    for (const z of data.zoneList) {
      const r = risks.find((x) => x.code === z.code);
      const color = r ? LEVEL_COLOR[r.level] : '#94a3b8';
      areas.push({
        type: 'Feature',
        properties: {
          fill: color,
          fillOpacity: r ? 0.12 + r.probability * 0.28 : 0.08,
          line: color,
          lineWidth: z.code === selected?.code ? 3 : 1.6,
        },
        geometry: { type: 'Polygon', coordinates: [z.ring] },
      });
    }
    for (const f of data.flood?.features ?? []) {
      areas.push({
        ...f,
        properties: {
          fill: '#0b1b34',
          fillOpacity: 0.06,
          line: '#0b1b34',
          lineWidth: 1.2,
          dashed: true,
        },
      });
    }
    return { areas: fc(areas) };
  }, [data, risks, selected?.code]);

  return (
    <div className="flex min-h-full flex-col">
      <PageHeader
        title="Predicción y escenarios"
        subtitle="Riesgo estimado por zona para los próximos 90 minutos · probabilidad, no certeza"
      >
        <Segmented<string>
          value={String(horizon)}
          onChange={(v) => setHorizon(Number(v) as Horizon)}
          options={[
            { value: '30', label: '30 min' },
            { value: '60', label: '60 min' },
            { value: '90', label: '90 min' },
          ]}
        />
        <TopActions search={false} />
      </PageHeader>

      <div className="grid grid-cols-[minmax(0,1fr)_380px] items-start gap-5 px-7 pb-8">
        <div className="flex min-w-0 flex-col gap-5">
          <CxMap
            view={CITY_VIEW}
            overlays={overlays}
            className="h-[520px] rounded-[22px] border border-cx-line shadow-cx"
            chrome={
              <>
                <div className="absolute right-4 top-4">
                  <MapControls home={CITY_VIEW} />
                </div>
                <div className="absolute left-4 top-4 rounded-[14px] border border-white/70 bg-white/95 px-3 py-2.5 shadow-cx-lg backdrop-blur">
                  <div className="mb-1 text-[12px] font-bold text-cx-ink">
                    Riesgo en {horizon} min
                  </div>
                  <div className="flex gap-3">
                    {(['low', 'medium', 'high', 'critical'] as const).map((l) => (
                      <span
                        key={l}
                        className="inline-flex items-center gap-1.5 text-[12px] text-cx-ink2"
                      >
                        <span
                          className="size-2.5 rounded-[3px]"
                          style={{ background: LEVEL_COLOR[l] }}
                        />
                        {LEVEL_LABEL[l]}
                      </span>
                    ))}
                  </div>
                </div>
                <FallbackNotice />
              </>
            }
          >
            {data.zoneList.map((z) => {
              const r = risks.find((x) => x.code === z.code);
              if (!r) return null;
              // Zonas que se enciman (Roma Norte y Condesa): la de más al sur pone su etiqueta abajo.
              const bb = bbox(z.ring);
              const south = data.zoneList.some((o) => {
                if (o.code === z.code) return false;
                const ob = bbox(o.ring);
                const overlap = bb[0] < ob[2] && ob[0] < bb[2] && bb[1] < ob[3] && ob[1] < bb[3];
                return overlap && (ob[1] + ob[3]) / 2 > (bb[1] + bb[3]) / 2;
              });
              const at: [number, number] = [(bb[0] + bb[2]) / 2, south ? bb[1] : bb[3]];
              return (
                <MapMarker
                  key={z.code}
                  lngLat={at}
                  anchor={south ? 'top' : 'bottom'}
                  offset={[0, south ? 6 : -6]}
                  z={r.code === selected?.code ? 30 : 20}
                >
                  <ZoneChip
                    risk={r}
                    active={r.code === selected?.code}
                    onClick={() => setPicked(r.code)}
                  />
                </MapMarker>
              );
            })}
            {data.drains.map((d) =>
              d.drain ? (
                <MapMarker key={d.device_code} lngLat={lngLatOf(d)} offset={[0, 34]} z={10}>
                  <DrainGauge
                    level={scenario.drainOverride[d.device_code] ?? d.drain.obstruction_level}
                    status={
                      (scenario.drainOverride[d.device_code] ?? 0) > 90
                        ? 'critical'
                        : d.drain.status
                    }
                    deviceStatus={d.status}
                    title={d.device_code}
                  />
                </MapMarker>
              ) : null,
            )}
          </CxMap>

          {selected && (
            <Card
              title={`${selected.name} · próximos 90 minutos`}
              icon={TrendingUp}
              action={
                active && base ? (
                  <Legend
                    items={[
                      { label: 'Con escenario', color: '#2563eb', kind: 'line' },
                      { label: 'Sin escenario', color: '#7d8aa0', kind: 'line' },
                    ]}
                  />
                ) : undefined
              }
            >
              <RiskCurve
                curve={selected.curve}
                horizon={horizon}
                baseline={active ? base?.curve : undefined}
              />
            </Card>
          )}
        </div>

        <div className="flex flex-col gap-4">
          {selected && <AlertCard risk={selected} horizon={horizon} />}
          <Card title="Zonas" icon={ListOrdered}>
            <ul className="-mx-2 flex flex-col">
              {risks.map((r) => {
                const b = baseline.find((x) => x.code === r.code);
                const delta = b ? Math.round((r.probability - b.probability) * 100) : 0;
                return (
                  <li key={r.code}>
                    <button
                      type="button"
                      onClick={() => setPicked(r.code)}
                      className={`flex w-full items-center gap-3 rounded-[12px] px-2 py-2 text-left hover:bg-cx-line2 ${
                        r.code === selected?.code ? 'bg-cx-line2' : ''
                      }`}
                    >
                      <span
                        className="size-3 rounded-full"
                        style={{ background: LEVEL_COLOR[r.level] }}
                      />
                      <span className="flex-1 text-[13.5px] font-semibold text-cx-ink">
                        {r.name}
                      </span>
                      {active && delta !== 0 && (
                        <span
                          className={`text-[12px] font-bold ${delta > 0 ? 'text-cx-critical' : 'text-cx-ok'}`}
                        >
                          {delta > 0 ? '+' : ''}
                          {delta} pts
                        </span>
                      )}
                      <span className="w-12 text-right text-[14px] font-bold text-cx-ink">
                        {Math.round(r.probability * 100)}%
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </Card>
          <ScenarioCard />
        </div>
      </div>
    </div>
  );
}
