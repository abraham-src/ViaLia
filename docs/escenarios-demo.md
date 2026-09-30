# Escenarios de demo

Guion para presentar SIMU con los seis escenarios del documento del proyecto. Todo corre con datos simulados: no hace falta hardware.

Cada escenario tiene una prueba E2E en [`e2e/tests/scenarios.spec.ts`](../e2e/tests/scenarios.spec.ts) que lo ejecuta de punta a punta en Chromium. Si la prueba pasa, el escenario funciona en la demo.

## Antes de empezar

1. Levanta todo: `docker compose up --build`, o sin Docker `npm run dev:api`, `npm run dev:web` y `npm run dev:simulator` (ver [desarrollo.md](desarrollo.md)).
2. Abre dos pestañas:
   - **Centro de control:** http://localhost:5173, con la sesión de `operador@simu.local`.
   - **Panel del simulador:** http://localhost:5173/simulator/control.
3. Entre escenarios, pulsa **Reiniciar estado** en el panel. Eso deja los niveles normales, apaga la lluvia y restablece Internet. Las incidencias creadas se quedan; para empezar de cero, recarga el seed (ver [desarrollo.md](desarrollo.md#reiniciar-datos)).

La contraseña de todas las cuentas demo es `simu2026` (`SEED_DEMO_PASSWORD`). En la pantalla de login, el botón **Usar** llena el correo de cada cuenta.

Consejo: abre el timeline de eventos con **Eventos**, abajo a la izquierda. Ahí se ven llegar en vivo las alertas, las detecciones y los cambios de estado.

## 1 · Operación normal

**Objetivo:** mostrar la línea base.

1. En el panel, ejecuta el escenario **1**.
2. En el **Dashboard**:
   - La barra superior indica `11 en línea · 0 degradados · 0 fuera de línea`.
   - La tabla de coladeras muestra niveles normales, con sparklines de las últimas 24 h.
3. En **Mapa**, activa y desactiva capas: cámaras, semáforos, coladeras, zonas de riesgo y rampas. Inclina la vista para ver los edificios en 3D.

**Resultado esperado:** los 11 dispositivos en línea y ninguna incidencia nueva.

## 2 · Coladera obstruyéndose

**Objetivo:** el motor de reglas convierte una lectura en alerta.

1. Quédate en el **Dashboard** y ejecuta el escenario **2**.
2. DRAIN-001 (Álvaro Obregón y Orizaba) cambia en vivo:
   - 42 % al instante.
   - 71 % a los 10 s: estado Precaución.
   - 88 % a los 20 s: estado Alerta.
3. En el timeline aparece `ALERTA · …`. En **Incidencias** aparece una nueva, "Coladera obstruida", con prioridad media.

**Regla aplicada:** `SI coladera > 80 % ENTONCES ALERTA`.

## 3 · Cámara detecta una incidencia

**Objetivo:** una detección de visión artificial llega como incidencia sin recargar.

1. Abre **Incidencias** y ejecuta el escenario **3**.
2. CAM-001 reporta `OBSTACLE` con confianza 0.91. Está por encima del umbral de 0.6, así que se crea la incidencia.
3. La fila nueva aparece en la tabla con un destello breve. El timeline muestra `Detecta OBSTACLE · confianza 0.91 · incidencia`.
4. Opcional, para mostrar el flujo completo:
   - Como operador: **Validar** y luego **Asignar** a Mantenimiento Demo.
   - Como `mantenimiento@simu.local`, en **Mantenimiento**: **Aceptar**, **Iniciar atención** y **Resolver**.
   - La bitácora de la incidencia registra cada paso con el rol que lo hizo.

## 4 · Riesgo combinado

**Objetivo:** tres fuentes (coladera, clima y cámara) escalan la misma incidencia.

1. Ejecuta el escenario **4** con el timeline abierto.
2. Qué pasa:

   | Tiempo | Evento                               | Resultado                      |
   | ------ | ------------------------------------ | ------------------------------ |
   | 0 s    | DRAIN-001 = 88 %                     | `ALERTA` (prioridad media)     |
   | 8 s    | Lluvia en Roma Norte (22 mm/h)       | `RIESGO ALTO` (prioridad alta) |
   | 16 s   | CAM-001 detecta `WATER_ACCUMULATION` | `RIESGO CRÍTICO` (crítica)     |

3. En **Incidencias** hay **una sola** incidencia para DRAIN-001. Se actualiza a "Riesgo de inundación" y prioridad crítica, en lugar de crear tres.

**Detalle técnico:** la regla crítica exige que la cámara esté a menos de 250 m de la coladera y que la detección tenga menos de 15 min. PostGIS lo verifica con `ST_DWithin`.

## 5 · Accesibilidad: ruta alternativa con rampa

**Objetivo:** la ruta accesible reacciona sola a un bloqueo nuevo.

1. Entra como `ciudadano@simu.local` y abre **Accesibilidad**.
2. Deja el origen en **Orizaba y Colima** y el destino en **Álvaro Obregón y Mérida**. Pulsa **Calcular ruta**.
3. El seed ya trae una obra en la banqueta sur de Álvaro Obregón, entre Orizaba y Córdoba. Por eso la ruta sale como **Ruta alternativa**:
   - Sube por Tabasco, baja por Córdoba y cruza por la rampa de Álvaro Obregón y Córdoba.
   - La ruta directa aparece como línea roja punteada.
4. Ejecuta el escenario **5** sin tocar nada más. CAM-001 detecta un bloqueo de accesibilidad en Álvaro Obregón y Orizaba.
5. En segundos, sin recargar, la lista **Obstáculos evitados** suma el bloqueo nuevo. La ruta se recalcula y sigue usando la rampa de Córdoba.

Para comparar, desmarca **Ruta accesible** y vuelve a calcular. Sale la ruta más corta, que ignora rampas y obstáculos.

## 6 · Pérdida de conectividad y recuperación

**Objetivo:** el gateway no pierde datos aunque se caiga Internet.

1. Abre **Dispositivos** y deja visible el panel del simulador. Ejecuta el escenario **6**.
2. Internet se corta durante 100 s. En el panel:
   - La cuenta de **pendientes en SQLite** sube.
   - Aparecen las fallas consecutivas y el próximo reintento, con backoff exponencial.
3. Mientras tanto, DRAIN-001 sube a 55 %, 70 % y 84 %. Esas lecturas solo existen en `simu-gateway.db`.
4. A los 90 s sin heartbeats, el monitor de la API marca los dispositivos **Fuera de línea**. Se ve en la barra superior y en la tabla.
5. A los 100 s vuelve Internet:
   - El worker vacía la cola en orden y los dispositivos regresan a **En línea**.
   - Las lecturas atrasadas entran con `synced: false` y con su hora real de medición. La sparkline de DRAIN-001 en el **Dashboard** rellena el hueco. Si en ese lapso hubo detecciones de cámara, **Logs / Eventos** las marca como "tarde".

**Resultado esperado:** pendientes en 0, nada en la cola de descartados y las lecturas de 55, 70 y 84 % guardadas en la API.

## Qué más mostrar si hay tiempo

- **Sin conexión en el navegador:** apaga la red de la laptop. Aparece el banner "Sin conexión — mostrando últimos datos · actualizados hace …" y la vista conserva los últimos datos.
- **API caída:** detén la API. Aparece el banner "Servidor no disponible". Al levantarla, todo se recarga solo.
- **Reglas:** como `admin@simu.local`, abre **Reglas** y edita el umbral de 80 %. El cambio aplica a la siguiente lectura.
- **Usuarios:** alta, cambio de rol y desactivación. Un cambio de rol cierra las sesiones de esa persona.

## Correr las pruebas de los escenarios

```bash
npm run test:e2e          # ~4 min; el escenario 6 incluye la caída real de 100 s
npm run test:e2e:report   # abre el reporte HTML con trazas de las fallas
```

Las pruebas levantan su propia API, simulador y web en los puertos 3100, 4100 y 5174, contra la base `simu_e2e`. No tocan los datos de desarrollo. Los detalles están en [desarrollo.md](desarrollo.md#pruebas-e2e-playwright).
