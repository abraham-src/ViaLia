/**
 * Self-contained control panel page (no build step, no external requests).
 * Works at /control (direct) and at /simulator/control (behind the web proxy):
 * every request is relative to the path the page was served from.
 * The inline script avoids template literals so this file can be a TS template string.
 */
export const CONTROL_PANEL_HTML = /* html */ `<!doctype html>
<html lang="es-MX">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>ViaLia · Simulador de campo</title>
<style>
  :root {
    --base:#0f1419; --surface:#161b22; --surface2:#1c232c; --line:#2a3139;
    --fg:#e6edf3; --muted:#8b949e; --accent:#1f6feb; --ok:#2ea043; --warn:#d29922;
    --danger:#da3633; --critical:#f85149;
    --mono: ui-monospace, "IBM Plex Mono", "SFMono-Regular", Consolas, monospace;
    --sans: "IBM Plex Sans", system-ui, "Segoe UI", sans-serif;
  }
  * { box-sizing: border-box; }
  body { margin:0; background:var(--base); color:var(--fg); font:13px/1.4 var(--sans); }
  header { height:40px; display:flex; align-items:center; gap:16px; padding:0 16px;
           background:var(--surface); border-bottom:1px solid var(--line); }
  header .brand { font-family:var(--mono); font-weight:500; letter-spacing:.03em; }
  header .sp { flex:1; }
  main { display:grid; grid-template-columns: 1.1fr 1.4fr 1fr; gap:12px; padding:12px; }
  @media (max-width: 1100px) { main { grid-template-columns: 1fr; } }
  section { background:var(--surface); border:1px solid var(--line); }
  section > h2 { margin:0; padding:6px 10px; font-size:11px; font-weight:500; text-transform:uppercase;
                 letter-spacing:.06em; color:var(--muted); background:var(--surface2); border-bottom:1px solid var(--line); }
  .body { padding:10px; }
  .stack > * + * { margin-top:12px; }
  table { width:100%; border-collapse:collapse; }
  th, td { text-align:left; padding:4px 6px; border-bottom:1px solid var(--line); }
  th { font-size:11px; font-weight:500; color:var(--muted); text-transform:uppercase; letter-spacing:.05em; }
  tr:last-child td { border-bottom:0; }
  .mono { font-family:var(--mono); font-size:12px; }
  .muted { color:var(--muted); }
  button { font:inherit; font-size:12px; color:var(--fg); background:var(--surface2); border:1px solid var(--line);
           padding:3px 8px; cursor:pointer; border-radius:2px; }
  button:hover { border-color:var(--accent); }
  button.primary { background:var(--accent); border-color:var(--accent); color:#fff; }
  button.danger { border-color:var(--danger); color:var(--critical); }
  input, select { font:inherit; font-size:12px; color:var(--fg); background:var(--base); border:1px solid var(--line);
                  padding:3px 6px; border-radius:2px; }
  input[type=number] { width:64px; }
  .row { display:flex; gap:6px; align-items:center; flex-wrap:wrap; }
  .chip { display:inline-flex; align-items:center; gap:6px; font-family:var(--mono); font-size:11px;
          text-transform:uppercase; border:1px solid var(--line); padding:1px 6px; border-radius:2px; }
  .chip i { width:6px; height:6px; display:inline-block; background:var(--muted); }
  .chip.ok { border-color:rgba(46,160,67,.5); color:var(--ok); } .chip.ok i { background:var(--ok); }
  .chip.warn { border-color:rgba(210,153,34,.5); color:var(--warn); } .chip.warn i { background:var(--warn); }
  .chip.bad { border-color:rgba(218,54,51,.6); color:var(--critical); } .chip.bad i { background:var(--critical); }
  .bar { position:relative; height:8px; background:var(--base); border:1px solid var(--line); width:120px; }
  .bar > span { position:absolute; inset:0 auto 0 0; background:var(--ok); }
  .bar.caution > span { background:var(--warn); } .bar.alert > span { background:var(--danger); }
  .bar.critical > span { background:var(--critical); }
  .scn { border-bottom:1px solid var(--line); padding:8px 0; }
  .scn:last-child { border-bottom:0; }
  .scn .title { font-weight:500; }
  .steps { margin:6px 0 0; padding:0; list-style:none; }
  .steps li { font-family:var(--mono); font-size:11px; color:var(--muted); }
  .steps li.done { color:var(--ok); }
  .log { max-height:320px; overflow:auto; font-family:var(--mono); font-size:11px; }
  .log div { padding:2px 0; border-bottom:1px solid var(--line); }
  .log time { color:var(--muted); margin-right:8px; }
  .kv { display:grid; grid-template-columns: auto 1fr; gap:2px 12px; }
  .kv dt { color:var(--muted); } .kv dd { margin:0; font-family:var(--mono); font-size:12px; }
  .banner { display:none; padding:6px 16px; border-bottom:1px solid rgba(210,153,34,.4);
            background:rgba(210,153,34,.1); color:var(--warn); }
</style>
</head>
<body>
<div class="banner" id="offline-banner"></div>
<header>
  <span class="brand">ViaLia · CDMX — Simulador de campo</span>
  <span class="sp"></span>
  <span class="chip" id="chip-api"><i></i>API</span>
  <span class="chip" id="chip-net"><i></i>Internet</span>
  <span class="chip" id="chip-outbox"><i></i>Pendientes 0</span>
</header>
<main>
  <section>
    <h2>Escenarios de demo</h2>
    <div class="body" id="scenarios"></div>
  </section>

  <div class="stack">
    <section>
      <h2>Acciones rápidas</h2>
      <div class="body row">
        <button class="danger" data-act="net-off-60">Internet OFF 60 s</button>
        <button data-act="drain-88">DRAIN-001 = 88 %</button>
        <button data-act="cam-water">CAM-001 = WATER_ACCUMULATION</button>
        <button data-act="cam-obstacle">CAM-001 = OBSTACLE</button>
        <button data-act="reset">Reiniciar estado</button>
      </div>
    </section>
    <section>
      <h2>Coladeras (Arduino + sensor ultrasónico)</h2>
      <div class="body">
        <table>
          <thead><tr><th>Código</th><th>Nivel</th><th></th><th>Base</th><th>Forzar</th></tr></thead>
          <tbody id="drains"></tbody>
        </table>
      </div>
    </section>
    <section>
      <h2>Cámaras (Ray-Ban Meta → app puente → IA)</h2>
      <div class="body row">
        <select id="cam-code"></select>
        <select id="cam-type"></select>
        <label class="muted">confianza <input type="number" id="cam-conf" min="0" max="1" step="0.01" value="0.92" /></label>
        <button class="primary" id="cam-send">Enviar detección</button>
      </div>
    </section>
    <section>
      <h2>Tráfico en tiempo real (tramos OSM de la CDMX)</h2>
      <div class="body">
        <table>
          <thead><tr><th>Zona</th><th>Tramos</th><th>En vivo</th><th>Nivel</th></tr></thead>
          <tbody id="traffic"></tbody>
        </table>
        <div class="muted" style="margin-top:6px">Automático = curva horaria de la ciudad + lluvia + variación por tramo. Las vistas del centro de control leen /traffic cada pocos segundos.</div>
      </div>
    </section>
    <section>
      <h2>Clima y salud de dispositivos</h2>
      <div class="body stack">
        <div class="row">
          <span class="muted">Lluvia</span>
          <select id="rain-zone">
            <option value="">toda la ciudad</option>
            <option>ZONE-001</option><option>ZONE-002</option><option>ZONE-003</option><option>ZONE-004</option>
          </select>
          <label class="muted">mm/h <input type="number" id="rain-mm" min="0" max="200" value="22" /></label>
          <button id="rain-on">Activar lluvia</button>
          <button id="rain-off">Desactivar</button>
          <span class="mono muted" id="rain-state"></span>
        </div>
        <div class="row">
          <span class="muted">Dispositivo</span>
          <select id="health-code"></select>
          <button id="health-degraded">Reportar DEGRADED</button>
          <button id="health-online">Reportar ONLINE</button>
          <span class="mono muted" id="degraded-list"></span>
        </div>
      </div>
    </section>
  </div>

  <div class="stack">
    <section>
      <h2>Conectividad</h2>
      <div class="body stack">
        <div class="row">
          <label class="muted">Internet OFF durante <input type="number" id="net-secs" min="1" max="3600" value="60" /> s</label>
          <button class="danger" id="net-off">Cortar</button>
          <button id="net-on">Restablecer</button>
        </div>
      </div>
    </section>
    <section>
      <h2>Store-and-forward (SQLite)</h2>
      <div class="body">
        <dl class="kv" id="outbox"></dl>
      </div>
    </section>
    <section>
      <h2>Bitácora del simulador</h2>
      <div class="body log" id="log"></div>
    </section>
  </div>
</main>
<script>
(function () {
  var BASE = location.pathname.replace(/\\/control\\/?$/, '');
  var CAMERAS = ['CAM-001','CAM-002','CAM-003','CAM-004'];
  var TYPES = ['WATER_ACCUMULATION','DRAIN_OBSTRUCTION','ACCIDENT','OBSTACLE','INFRASTRUCTURE_FAILURE','ACCESSIBILITY_BLOCK'];
  var DEVICES = CAMERAS.concat(['DRAIN-001','DRAIN-002','DRAIN-003','DRAIN-004','TL-001','TL-002','GW-001']);
  var $ = function (id) { return document.getElementById(id); };
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'})[c]; }); }
  function fill(sel, items) { sel.innerHTML = items.map(function (v) { return '<option>' + v + '</option>'; }).join(''); }
  fill($('cam-code'), CAMERAS); fill($('cam-type'), TYPES); fill($('health-code'), DEVICES);

  function post(path, body) {
    return fetch(BASE + path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body || {}) })
      .then(function (r) { if (!r.ok) return r.json().then(function (e) { alert(e.message || 'Error'); }); })
      .then(refresh);
  }
  function hhmmss(iso) { return iso ? new Date(iso).toLocaleTimeString('es-MX', { hour12: false }) : '—'; }
  function levelClass(v) { return v > 90 ? 'critical' : v > 80 ? 'alert' : v >= 50 ? 'caution' : ''; }
  function chip(el, cls, text) { el.className = 'chip ' + cls; el.innerHTML = '<i></i>' + esc(text); }

  var scenariosRendered = false;
  function renderScenarios(list, current) {
    if (!scenariosRendered) {
      $('scenarios').innerHTML = list.map(function (s) {
        return '<div class="scn"><div class="row"><span class="title">' + s.id + '. ' + esc(s.name) + '</span>' +
          '<span style="flex:1"></span><button class="primary" data-scn="' + s.id + '">Ejecutar</button></div>' +
          '<div class="muted">' + esc(s.description) + '</div><ul class="steps" id="steps-' + s.id + '"></ul></div>';
      }).join('');
      scenariosRendered = true;
    }
    list.forEach(function (s) {
      var ul = $('steps-' + s.id);
      if (!current || current.id !== s.id) { ul.innerHTML = ''; return; }
      ul.innerHTML = current.steps.map(function (st) {
        return '<li class="' + (st.done ? 'done' : '') + '">t+' + st.at + ' s · ' + esc(st.label) + ' · ' + (st.done ? 'hecho' : 'pendiente') + '</li>';
      }).join('');
    });
  }

  function render(s) {
    chip($('chip-api'), s.api_reachable ? 'ok' : 'bad', s.api_reachable ? 'API en línea' : 'API no disponible');
    chip($('chip-net'), s.internet.online ? 'ok' : 'bad', s.internet.online ? 'Internet ON' : 'Internet OFF ' + s.internet.offline_remaining_s + ' s');
    chip($('chip-outbox'), s.outbox.pending > 0 ? 'warn' : 'ok', 'Pendientes ' + s.outbox.pending);

    var banner = $('offline-banner');
    if (!s.internet.online) { banner.style.display = 'block'; banner.textContent = 'Sin Internet: el gateway guarda cada lectura en SQLite. Se sincronizará al volver la conexión (' + s.internet.offline_remaining_s + ' s).'; }
    else if (!s.api_reachable) { banner.style.display = 'block'; banner.textContent = 'Servidor no disponible: las lecturas se guardan localmente y se reintenta con backoff exponencial.'; }
    else banner.style.display = 'none';

    $('drains').innerHTML = s.drains.map(function (d) {
      return '<tr><td class="mono">' + d.code + '</td><td class="mono">' + d.level + ' %' + (d.forced ? ' <span class="muted">(forzada)</span>' : '') + '</td>' +
        '<td><div class="bar ' + levelClass(d.level) + '"><span style="width:' + d.level + '%"></span></div></td>' +
        '<td class="mono muted">' + d.base + ' %</td>' +
        '<td class="row"><input type="number" min="0" max="100" id="lvl-' + d.code + '" placeholder="%" />' +
        '<button data-drain-set="' + d.code + '">Fijar</button><button data-drain-free="' + d.code + '">Soltar</button></td></tr>';
    }).join('');

    var w = s.weather;
    $('rain-state').textContent = w.raining ? 'lloviendo ' + (w.zone || 'en toda la ciudad') + ' · ' + w.intensityMmH + ' mm/h' : 'sin lluvia';
    $('degraded-list').textContent = s.degraded.length ? 'degradados: ' + s.degraded.join(', ') : '';

    var sy = s.sync, ob = s.outbox;
    $('outbox').innerHTML =
      '<dt>Pendientes</dt><dd>' + ob.pending + '</dd>' +
      '<dt>Sincronizados</dt><dd>' + ob.synced + '</dd>' +
      '<dt>Rechazados (dead letter)</dt><dd>' + ob.dead + '</dd>' +
      '<dt>Pendiente más antiguo</dt><dd>' + hhmmss(ob.oldestPendingAt) + '</dd>' +
      '<dt>Fallas consecutivas</dt><dd>' + sy.consecutiveFailures + '</dd>' +
      '<dt>Próximo intento</dt><dd>' + (sy.nextRunInMs / 1000).toFixed(1) + ' s</dd>' +
      '<dt>Último envío OK</dt><dd>' + hhmmss(sy.lastSuccessAt) + '</dd>' +
      '<dt>Último error</dt><dd>' + esc(sy.lastError || ob.lastError || '—') + '</dd>';

    var MODES = [['auto','Automático'],['free','Libre'],['moderate','Moderado'],['heavy','Denso'],['stopped','Detenido']];
    $('traffic').innerHTML = (s.traffic || []).map(function (z) {
      return '<tr><td>' + esc(z.name) + ' <span class="mono muted">' + z.code + '</span></td><td class="mono">' + z.segments + '</td>' +
        '<td><input type="checkbox" data-traffic-on="' + z.code + '"' + (z.enabled ? ' checked' : '') + ' /></td>' +
        '<td><select data-traffic-mode="' + z.code + '">' + MODES.map(function (m) {
          return '<option value="' + m[0] + '"' + (m[0] === z.mode ? ' selected' : '') + '>' + m[1] + '</option>';
        }).join('') + '</select></td></tr>';
    }).join('');

    $('log').innerHTML = s.log.map(function (l) { return '<div><time>' + hhmmss(l.at) + '</time>' + esc(l.message) + '</div>'; }).join('');
    renderScenarios(s.scenarios, s.scenario);
  }

  function refresh() {
    return fetch(BASE + '/control/state').then(function (r) { return r.json(); }).then(render)
      .catch(function () { chip($('chip-api'), 'bad', 'Simulador sin respuesta'); });
  }

  document.addEventListener('change', function (e) {
    var t = e.target; if (!(t instanceof HTMLElement)) return;
    var d = t.dataset;
    if (d.trafficOn) return post('/control/traffic', { zone: d.trafficOn, enabled: t.checked });
    if (d.trafficMode) return post('/control/traffic', { zone: d.trafficMode, mode: t.value });
  });

  document.addEventListener('click', function (e) {
    var t = e.target; if (!(t instanceof HTMLElement)) return;
    var d = t.dataset;
    if (d.scn) return post('/control/scenario/' + d.scn);
    if (d.drainSet) { var v = $('lvl-' + d.drainSet).value; if (v !== '') post('/control/drain', { code: d.drainSet, level: Number(v) }); return; }
    if (d.drainFree) return post('/control/drain', { code: d.drainFree, level: null });
    switch (d.act) {
      case 'net-off-60': return post('/control/internet', { online: false, seconds: 60 });
      case 'drain-88': return post('/control/drain', { code: 'DRAIN-001', level: 88 });
      case 'cam-water': return post('/control/camera', { code: 'CAM-001', event_type: 'WATER_ACCUMULATION', confidence: 0.92 });
      case 'cam-obstacle': return post('/control/camera', { code: 'CAM-001', event_type: 'OBSTACLE', confidence: 0.91 });
      case 'reset': return post('/control/reset');
    }
    switch (t.id) {
      case 'cam-send': return post('/control/camera', { code: $('cam-code').value, event_type: $('cam-type').value, confidence: Number($('cam-conf').value) });
      case 'rain-on': return post('/control/weather', { raining: true, zone: $('rain-zone').value || null, intensity_mm_h: Number($('rain-mm').value) });
      case 'rain-off': return post('/control/weather', { raining: false });
      case 'health-degraded': return post('/control/health', { code: $('health-code').value, status: 'degraded' });
      case 'health-online': return post('/control/health', { code: $('health-code').value, status: 'online' });
      case 'net-off': return post('/control/internet', { online: false, seconds: Number($('net-secs').value) });
      case 'net-on': return post('/control/internet', { online: true });
    }
  });

  refresh();
  setInterval(function () {
    // Do not re-render while the user is typing a level.
    var a = document.activeElement;
    if (a && (a.tagName === 'INPUT' && a.type !== 'checkbox' || a.tagName === 'SELECT')) return;
    refresh();
  }, 1000);
})();
</script>
</body>
</html>`;
