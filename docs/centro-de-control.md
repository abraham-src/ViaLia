# Centro de control (`/centro`)

Sección nueva de la web con el diseño del maquetado (tema claro, barra lateral azul marino) que
ilustra el proyecto completo: percibir, entender, predecir, actuar y resolver. Convive con la
consola técnica oscura, que no cambia.

Entra con cualquier cuenta demo y abre **http://localhost:5173/centro**, o usa el primer ícono
de la barra de la consola técnica.

## Pantallas

| Ruta                              | Pantalla           | Qué muestra                                                                                                                                            |
| --------------------------------- | ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `/centro/apartado`                | Nuevo apartado     | Espacio reservado al inicio del menú para el siguiente módulo (contenido pendiente)                                                                    |
| `/centro`                         | Mapa general       | Incidencias agrupadas por cercanía, cámaras con cono de visión, coladeras con su nivel, semáforos, zonas de riesgo, cámara IA, alerta predictiva       |
| `/centro/incidencias/:id`         | Zoom de incidencia | Vista 3D del punto, radio de la regla (250 m), dirección calculada con las calles OSM del repo, cámara, coladera y semáforo más cercanos               |
| `/centro/incidencias/:id/detalle` | Vista de detalle   | Evidencia ilustrada con recuadro de detección, fusión de datos y regla aplicada, datos de la IA, flujo de atención por roles, bitácora, respuesta vial |
| `/centro/interseccion`            | Intersección       | Cruce real Insurgentes × Álvaro Obregón en 2D/3D: autos del modelo de colas, semáforos, peatones, reglas de seguridad, prueba 14.1                     |
| `/centro/prediccion`              | Predicción         | Índice de riesgo por zona con probabilidad, confianza, horizonte y factores; simulación de escenarios (lluvia, coladera, accidente, cierre)            |
| `/centro/proyecto`                | Cómo funciona      | Ciclo con datos en vivo, arquitectura con qué es real y qué es simulado, guion de los casos A–G                                                        |

## Qué es real y qué es simulado

| Pieza                                                        | Estado                                                                                   |
| ------------------------------------------------------------ | ---------------------------------------------------------------------------------------- |
| Dispositivos, incidencias, coladeras, clima, zonas, bitácora | Reales: vienen de la API y se actualizan por WebSocket (simulador de campo incluido)     |
| Acciones de atención (validar, asignar, iniciar, resolver)   | Reales: usan los mismos endpoints que la consola                                         |
| Semáforo TL-001                                              | Simulación en el navegador (`centro/sim/intersection.ts`); el backend aún no lo controla |
| Tráfico en tiempo real                                       | Simulado por el simulador de campo (`GET /traffic`) sobre tramos reales de OSM           |
| Restricción del semáforo por incidencias                     | Real en la entrada (incidencias activas a menos de 600 m), simulada en la respuesta      |
| Predicción                                                   | Índice explicable en el navegador (`centro/risk/model.ts`); pronóstico de lluvia manual  |
| Vista de cámara y evidencia                                  | Ilustraciones vectoriales; si la cámara tiene `stream_url`, se muestra el video real     |

La interfaz lo dice en pantalla ("Vista ilustrativa", "Simulado", notas al pie) para no
presentar como medición algo que es simulación, como pide la memoria técnica.

## Guion corto para la demo

1. **Mapa general.** Recorre la vista y abre la cámara CAM-001.
2. **Predicción.** Pulsa "Lluvia de 30 mm/h en 30 min" y elige DRAIN-001 en "Coladera
   obstruida": Roma Norte pasa a riesgo alto o crítico antes de que exista agua (momento wow).
3. **Simulador de campo → escenario 4.** La coladera sube a 88 %, llueve y la cámara detecta
   agua: aparece la incidencia crítica y el contador de la barra lateral cambia.
4. **Incidencias.** Zoom → "Ver detalle": evidencia, regla aplicada con cada dato y respuesta
   del semáforo (acceso Poniente con prioridad reducida).
5. **Intersección.** "Hora pico en Norte", 4×, y la prueba 14.1 con su porcentaje. Apaga "IA de
   conteo en línea" para mostrar el modo seguro.
6. **Detalle → Validar, Asignar, Resolver** para cerrar el ciclo con la cuadrilla.

## Cambiar el nombre del producto

Edita `apps/web/src/centro/brand.ts`. El nombre, el lema y la ciudad salen de ahí.

## Colores de la marca

Salen del logo (`docs/brand/vialia-logo.jpg`, símbolo en `apps/web/public/vialia-mark.svg`) y
viven como tokens en `apps/web/src/index.css`:

| Token                               | Color     | Uso                                                |
| ----------------------------------- | --------- | -------------------------------------------------- |
| `brand-navy` / `cx-navy` / `cx-ink` | `#143254` | Barra lateral, texto principal, botones sólidos    |
| `brand-blue` / `cx-blue`            | `#1f5fa6` | Íconos, enlaces y controles (mismo tono, más vivo) |
| `brand-steel` / `cx-steel`          | `#6a777f` | Etiquetas secundarias                              |
| `brand-silver` / `cx-silver`        | `#b8bbc0` | Acentos y estados neutros                          |

La consola técnica usa la versión oscura de la misma paleta (`base`, `surface`, `line`). Los
colores de estado (crítico, alto, medio, en línea) no cambian: comunican significado, no marca.

Todas las vistas del centro y el acceso se adaptan a celular: por debajo de 1024 px la barra
lateral se vuelve un menú deslizable y las columnas se apilan.

## Mapas: 2D, 3D y tráfico en tiempo real

Todos los mapas (centro de control y consola técnica, incluido el minimapa del zoom y el cruce
de la intersección) usan mosaicos reales de la CDMX y tienen botón **2D/3D** (en 3D los edificios
se extruyen con su altura) y botón de **tráfico**.

El tráfico lo genera el simulador de campo sobre 242 tramos reales de OSM, agrupados en zonas
(`apps/simulator/src/traffic-network.ts`, generado con `node scripts/build-traffic-network.mjs`).
La congestión combina la curva horaria de la ciudad, lluvia del simulador y variación por tramo.
La web lee `/simulator/traffic/network` una vez y `/simulator/traffic` cada 3 s.

Desde el panel del simulador (**Tráfico en tiempo real**) se enciende o apaga cada zona y se
puede forzar su nivel (libre, moderado, denso, detenido). Al arrancar están activas Roma Norte,
Centro Histórico, Condesa y los corredores; Coyoacán queda apagada. En la intersección, el
escenario **Tráfico en vivo** toma la demanda de cada acceso de esos tramos.

## Mapa base sin Internet

El mapa usa los mosaicos de OpenFreeMap con un estilo claro (`centro/map/cxStyle.ts`). Si no
cargan (sin red en el evento), dibuja automáticamente las calles de OpenStreetMap que ya trae el
repo, compactadas en `apps/web/public/cx/streets.geojson` (se generan desde
`database/gis/pedestrian-network.geojson`). Esas mismas calles dan la "dirección" de cada
incidencia.

## Conectar video real de una cámara

Guarda la URL del video (por ejemplo, un stream MJPEG de una webcam o de un teléfono) en
`cameras.stream_url`. El centro la muestra en lugar de la ilustración y cambia la etiqueta a
"En vivo". La API todavía no tiene un endpoint para editarla, así que por ahora es con SQL:

```bash
docker compose exec postgres psql -U simu -d simu -c \
  "UPDATE cameras SET stream_url = 'http://192.168.1.50:8080/video' \
   WHERE device_id = (SELECT id FROM devices WHERE device_code = 'CAM-001');"
```

## Pruebas

```bash
npm test -w @simu/web   # incluye centro/sim/intersection.test.ts y centro/risk/model.test.ts
```

Las pruebas verifican las reglas duras del semáforo (verde mínimo y máximo, amarillo, todo en
rojo, espera peatonal máxima, modo seguro sin IA), que el adaptativo gane con demanda desigual, la
traducción de incidencias a accesos restringidos y los niveles del índice de riesgo.

## Archivos

```text
apps/web/src/centro/
├── CxShell.tsx              barra lateral, simulación del semáforo y enlace con incidencias
├── brand.ts                 nombre del producto
├── centro.css               animaciones y ajustes de MapLibre
├── components/              tarjetas, botones, búsqueda, alertas, gráficas
├── data/                    datos compartidos (API) y contexto de una incidencia
├── illustrations/           cámara, evidencia, cruce animado, ciclo, minimapa
├── lib/                     geometría, calles OSM, colores y etiquetas
├── map/                     mapa claro, marcadores HTML, controles
├── pages/                   las seis pantallas
├── risk/                    índice de riesgo y escenarios
└── sim/                     modelo del semáforo y su simulación en vivo
```

También cambió: `app/router.tsx` (rutas), `components/shell/nav.ts` (acceso desde la
consola), `index.css` (tokens `cx-*`), `package.json` (fuente Plus Jakarta Sans y dependencia
explícita de `@simu/shared-utils`) y `docker/Dockerfile.web` (ver abajo).

## Corrección en Docker

`docker/Dockerfile.web` no instalaba ni compilaba `@simu/shared-utils`, que la web ya usaba
(`IncidentDetail`, `MaintenancePage`), así que `docker compose up --build` fallaba al construir
la web. Ahora lo instala y lo compila antes de la web.
