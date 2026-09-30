import type { IncidentDto, PaginatedResponse, SensorReadingDto } from '@simu/shared-types';
import {
  ApiClient,
  expect,
  loginAs,
  openTimeline,
  simulator,
  type SimulatorState,
  test,
} from '../fixtures';

/** The six demo scenarios of docs/escenarios-demo.md, driven through the simulator. */

async function incidentsOf(api: ApiClient, query: string): Promise<IncidentDto[]> {
  const res = await api.get<PaginatedResponse<IncidentDto>>(`/incidents?${query}`);
  return res.data;
}

test('1 · Operación normal: los 11 dispositivos en línea, sin alertas', async ({ page }) => {
  await simulator('scenario/1');
  await loginAs(page, 'operador');

  const status = page.getByLabel('Estado de dispositivos');
  await expect(status).toContainText('11 en línea');
  await expect(status).toContainText('0 fuera de línea');

  const drainRow = page.getByRole('row', { name: /DRAIN-001/ });
  await expect(drainRow).toContainText('Normal');

  const api = await ApiClient.login('operador');
  expect(await incidentsOf(api, 'device_code=DRAIN-001')).toHaveLength(0);
});

test('2 · Coladera obstruyéndose: 42 → 71 → 88 % y ALERTA', async ({ page }) => {
  test.setTimeout(90_000);
  await loginAs(page, 'operador');
  await simulator('scenario/2');

  const drainRow = page.getByRole('row', { name: /DRAIN-001/ });
  await expect(drainRow).toContainText('42 %');
  await expect(drainRow).toContainText('71 %', { timeout: 25_000 });
  await expect(drainRow).toContainText('88 %', { timeout: 25_000 });
  await expect(drainRow).toContainText('Alerta');

  const timeline = await openTimeline(page);
  await expect(timeline.getByText(/ALERTA ·/).first()).toBeVisible();

  const api = await ApiClient.login('operador');
  const [incident] = await incidentsOf(api, 'device_code=DRAIN-001');
  expect(incident).toMatchObject({ type: 'drain_obstruction', priority: 'medium' });
});

test('3 · Cámara detecta un obstáculo y aparece como incidencia en vivo', async ({ page }) => {
  await loginAs(page, 'operador');
  await page.getByRole('navigation').getByRole('link', { name: 'Incidencias' }).click();
  await expect(page).toHaveTitle('ViaLia · Incidencias');
  const timeline = await openTimeline(page);

  await simulator('scenario/3');

  await expect(timeline.getByText('Detecta OBSTACLE · confianza 0.91 · incidencia')).toBeVisible();
  const api = await ApiClient.login('operador');
  await expect
    .poll(async () => (await incidentsOf(api, 'device_code=CAM-001&type=obstacle')).length)
    .toBe(1);
  const [incident] = await incidentsOf(api, 'device_code=CAM-001&type=obstacle');
  // The new incident shows up in the table without reloading.
  await expect(page.locator('tbody tr', { hasText: incident!.description }).first()).toBeVisible();
});

test('4 · Riesgo combinado: ALERTA → RIESGO ALTO → RIESGO CRÍTICO', async ({ page }) => {
  test.setTimeout(90_000);
  await loginAs(page, 'operador');
  const timeline = await openTimeline(page);
  const api = await ApiClient.login('operador');
  const drainPriority = async () =>
    (await incidentsOf(api, 'device_code=DRAIN-001'))[0]?.priority ?? 'none';

  await simulator('scenario/4');

  await expect(timeline.getByText(/ALERTA ·/).first()).toBeVisible();
  await expect.poll(drainPriority, { timeout: 20_000 }).toBe('medium');
  await expect(timeline.getByText(/RIESGO ALTO ·/).first()).toBeVisible({ timeout: 20_000 });
  await expect.poll(drainPriority, { timeout: 20_000 }).toBe('high');
  await expect(timeline.getByText(/RIESGO CRÍTICO ·/).first()).toBeVisible({ timeout: 20_000 });
  await expect.poll(drainPriority, { timeout: 20_000 }).toBe('critical');

  // Escalation updates one incident per drain instead of piling up three.
  const incidents = await incidentsOf(api, 'device_code=DRAIN-001');
  expect(incidents).toHaveLength(1);
  expect(incidents[0]).toMatchObject({ type: 'flood_risk', priority: 'critical' });
});

test('5 · Accesibilidad: la ruta se recalcula sola y usa la rampa de Córdoba', async ({ page }) => {
  await loginAs(page, 'ciudadano');
  await page.getByRole('navigation').getByRole('link', { name: 'Accesibilidad' }).click();
  const planner = page.getByRole('complementary', { name: 'Planificador de ruta accesible' });
  await expect(planner.getByLabel('Origen', { exact: true })).toHaveValue('0'); // Orizaba y Colima
  await expect(planner.getByLabel('Destino', { exact: true })).toHaveValue('3'); // Álvaro Obregón y Mérida

  await planner.getByRole('button', { name: 'Calcular ruta' }).click();
  // Baseline: the seeded sidewalk works (a citizen report plus an obstacle point) already
  // force a detour through Córdoba.
  await expect(planner.getByText('Ruta alternativa', { exact: true })).toBeVisible();
  const blocks = planner.getByText('Bloqueo de accesibilidad:');
  await expect(blocks).toHaveCount(1);

  await simulator('scenario/5');

  // No click: the camera incident arrives over the WebSocket, the route recomputes and
  // lists the new blocker while still crossing at the Córdoba ramp.
  await expect(blocks).toHaveCount(2, { timeout: 20_000 });
  await expect(planner.getByText('Ruta alternativa', { exact: true })).toBeVisible();
  await expect(planner).toContainText('Rampa Álvaro Obregón y Córdoba');
});

test('6 · Pérdida de conectividad: SQLite guarda todo y sincroniza al volver', async ({ page }) => {
  test.setTimeout(240_000);
  await loginAs(page, 'operador');
  await page.getByRole('navigation').getByRole('link', { name: 'Dispositivos' }).click();
  const startedAt = new Date();
  const deadBefore = (await simulator<SimulatorState>('state')).outbox.dead;

  await simulator('scenario/6');

  // Gateway offline: nothing reaches the API, so the heartbeat monitor flags the devices.
  await expect(page.getByLabel('Estado de dispositivos')).toContainText(/[1-9]\d* fuera de línea/, {
    timeout: 45_000,
  });
  await expect(page.getByText('Fuera de línea').first()).toBeVisible();
  const during = await simulator<SimulatorState>('state');
  expect(during.internet.online).toBe(false);
  expect(during.outbox.pending).toBeGreaterThan(0);

  // Internet back at 100 s: the backlog drains and every device returns.
  await expect
    .poll(async () => (await simulator<SimulatorState>('state')).internet.online, {
      timeout: 120_000,
      intervals: [2_000],
    })
    .toBe(true);
  await expect
    .poll(async () => (await simulator<SimulatorState>('state')).outbox.pending, {
      timeout: 30_000,
    })
    .toBe(0);
  const after = await simulator<SimulatorState>('state');
  expect(after.outbox.dead).toBe(deadBefore); // nothing dead-lettered by the outage
  await expect(page.getByLabel('Estado de dispositivos')).toContainText('0 fuera de línea', {
    timeout: 30_000,
  });

  // No data loss: the offline readings are in the API, flagged as late (synced=false).
  const api = await ApiClient.login('operador');
  const { data } = await api.get<{ data: SensorReadingDto[] }>(
    `/drains/DRAIN-001/readings?from=${startedAt.toISOString()}&limit=500`,
  );
  const late = data.filter((r) => !r.synced).map((r) => r.value);
  expect(late).toEqual(expect.arrayContaining([55, 70, 84]));
});
