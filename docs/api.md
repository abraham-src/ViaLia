# API

Base URL:

- Directa: `http://localhost:3000`
- Vía web (nginx en Docker o Vite en desarrollo): `http://localhost:5173/api`

Los contratos de respuesta (DTO) están tipados en [`packages/shared-types/src/dto.ts`](../packages/shared-types/src/dto.ts).

## Convenciones

- JSON en `snake_case`. Fechas en ISO-8601 UTC.
- Listas simples: `{ "data": [...] }`. Listas paginadas: `{ "data": [...], "meta": { "page", "page_size", "total" } }`.
- `?format=geojson` en listados de puntos devuelve un `FeatureCollection` listo para MapLibre.
- Filtros múltiples separados por coma: `?status=pending,validated`.
- `bbox=minLng,minLat,maxLng,maxLat` en EPSG:4326.

### Errores

Todas las respuestas de error tienen la misma forma:

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Datos de entrada inválidos",
    "details": [{ "path": "email", "message": "correo inválido" }]
  }
}
```

| HTTP | `code`                            | Cuándo                                              |
| ---- | --------------------------------- | --------------------------------------------------- |
| 400  | `VALIDATION_ERROR`, `BAD_REQUEST` | Entrada inválida                                    |
| 401  | `UNAUTHORIZED`                    | Sin token, token inválido o expirado                |
| 403  | `FORBIDDEN`                       | El rol no puede hacer esa acción                    |
| 404  | `NOT_FOUND`                       | Recurso o ruta inexistente                          |
| 409  | `CONFLICT`                        | Transición de estado inválida o edición concurrente |
| 429  | `RATE_LIMITED`                    | Demasiados intentos de login                        |
| 501  | `NOT_IMPLEMENTED`                 | Funcionalidad de una fase futura                    |

## Autenticación

- **Usuarios:** `Authorization: Bearer <access_token>`. El token de acceso dura 15 min.
- **Refresh:** dura 7 días, rota en cada uso y se guarda como cookie `simu_rt` (httpOnly, SameSite=Strict). Si alguien reutiliza un refresh ya rotado, se revocan todas las sesiones de ese usuario.
- **Dispositivos:** gateway y simulador envían `x-device-key: <DEVICE_INGEST_KEY>`. Solo sirve para heartbeats y lecturas.

### Permisos por rol

| Recurso                                       | admin | operator |        maintenance         | citizen |
| --------------------------------------------- | :---: | :------: | :------------------------: | :-----: |
| Dispositivos, cámaras, coladeras (lectura)    |   ✔   |    ✔     |             ✔              |    ✘    |
| Cambiar estado de dispositivo                 |   ✔   |    ✔     |             ✔              |    ✘    |
| Heartbeat y lecturas (o `x-device-key`)       |   ✔   |    ✔     |             ✘              |    ✘    |
| Incidencias (lectura) y crear reporte         |   ✔   |    ✔     |             ✔              |    ✔    |
| Editar, validar, rechazar, asignar incidencia |   ✔   |    ✔     |             ✘              |    ✘    |
| Iniciar y resolver incidencia                 |   ✔   |    ✔     | solo si está asignada a él |    ✘    |
| Bitácora de incidencia                        |   ✔   |    ✔     |             ✔              |    ✘    |
| Accesibilidad                                 |   ✔   |    ✔     |             ✔              |    ✔    |
| Reglas: ver / editar                          | ✔ / ✔ |  ✔ / ✘   |             ✘              |    ✘    |

## Endpoints

### Salud

`GET /health`: estado de la API, la base y PostGIS. Es público. Responde 503 si la base no responde.

### Auth

| Método | Ruta            | Cuerpo                        | Respuesta                                                         |
| ------ | --------------- | ----------------------------- | ----------------------------------------------------------------- |
| POST   | `/auth/login`   | `{ email, password }`         | `TokenResponse` y cookie. Límite de 10 intentos por minuto por IP |
| POST   | `/auth/refresh` | `{ refresh_token? }` o cookie | `TokenResponse` nuevo y cookie rotada                             |
| POST   | `/auth/logout`  | `{ refresh_token? }` o cookie | 204. Revoca el refresh y borra la cookie                          |
| GET    | `/auth/me`      | —                             | `AuthUserDto`                                                     |

```bash
curl -s -X POST http://localhost:3000/auth/login \
  -H 'content-type: application/json' \
  -d '{"email":"operador@simu.local","password":"simu2026"}'
```

```json
{
  "access_token": "eyJhbGciOiJIUzI1NiJ9...",
  "token_type": "Bearer",
  "expires_in": 900,
  "refresh_token": "eyJhbGciOiJIUzI1NiJ9...",
  "user": {
    "id": "…",
    "name": "Operación Demo",
    "email": "operador@simu.local",
    "role": "operator",
    "status": "active"
  }
}
```

### Dispositivos

| Método | Ruta                                                   | Notas                                                                                             |
| ------ | ------------------------------------------------------ | ------------------------------------------------------------------------------------------------- |
| GET    | `/devices?type=&status=&format=`                       | `type` y `status` aceptan varios valores                                                          |
| GET    | `/devices/:code`                                       | `code` como `CAM-001`                                                                             |
| PATCH  | `/devices/:code/status`                                | `{ status, reason? }`. Emite `devices:status`                                                     |
| POST   | `/devices/:code/heartbeat`                             | `{ status?: "online" \| "degraded", health? }`. Emite `heartbeats` y, si cambia, `devices:status` |
| GET    | `/cameras`, `/cameras/:code`                           |                                                                                                   |
| GET    | `/drains`, `/drains/:code`                             |                                                                                                   |
| GET    | `/drains/:code/readings?from=&to=&limit=`              | Por defecto las últimas 24 h. Devuelve las `limit` más recientes, de la más vieja a la más nueva  |
| GET    | `/drains/:code/readings/series?hours=24&bucket_min=30` | Serie agregada en Postgres (`date_bin`): `{ t, avg, max, n }` por intervalo. Para sparklines      |
| POST   | `/drains/:code/readings`                               | Una lectura o un lote `{ readings: [...] }` de hasta 500                                          |

Un dispositivo en `maintenance` conserva ese estado aunque lleguen heartbeats. Es un bloqueo manual.

Lectura desde el gateway:

```bash
curl -s -X POST http://localhost:3000/drains/DRAIN-001/readings \
  -H 'content-type: application/json' -H 'x-device-key: dev-only-device-key-change-me' \
  -d '{"device_code":"DRAIN-001","value":78,"unit":"percent","recorded_at":"2026-09-29T15:30:00Z"}'
```

```json
{
  "device_code": "DRAIN-001",
  "received": 1,
  "inserted": 1,
  "duplicates": 0,
  "drain": {
    "obstruction_level": 78,
    "status": "caution",
    "last_reading_at": "2026-09-29T15:30:00.000Z"
  }
}
```

Reglas de ingesta:

- **Idempotente.** La misma lectura enviada dos veces se guarda una sola vez. La segunda responde 200 con `duplicates: 1`.
- **Orden temporal.** Un lote atrasado de store-and-forward se guarda con `synced: false`, pero no sobrescribe el nivel actual si ya hay una lectura más nueva.
- **Validación.** El valor en `percent` va de 0 a 100. `recorded_at` no puede estar más de 5 min en el futuro. `device_code` debe coincidir con la ruta.

### Incidencias

| Método | Ruta                      | Notas                                                                                                                                                                                                                                                              |
| ------ | ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| GET    | `/incidents`              | Filtros `status`, `priority`, `type`, `bbox`, `assigned_to=me\|<uuid>`, `device_code`, `q` (texto en la descripción, sin distinguir mayúsculas). Paginación `page` y `page_size` (máx. 200). `sort=-created_at\|created_at\|-priority\|priority`. `format=geojson` |
| GET    | `/incidents/:id`          |                                                                                                                                                                                                                                                                    |
| POST   | `/incidents`              | `CreateIncidentInput`. La ubicación debe estar en CDMX. Emite `incidents:created`                                                                                                                                                                                  |
| PATCH  | `/incidents/:id`          | `{ description?, priority?, type?, status?: "in_progress" \| "rejected", note? }`                                                                                                                                                                                  |
| POST   | `/incidents/:id/validate` | `{ note? }`                                                                                                                                                                                                                                                        |
| POST   | `/incidents/:id/assign`   | `{ user_id, note? }`. Solo a personal de mantenimiento activo                                                                                                                                                                                                      |
| POST   | `/incidents/:id/resolve`  | `{ note? }`                                                                                                                                                                                                                                                        |
| GET    | `/incidents/:id/events`   | Bitácora completa                                                                                                                                                                                                                                                  |

Una ciudadana o ciudadano no puede fijar prioridad ni confianza. Su reporte entra como `pending`, prioridad `medium` y `source: citizen_report`.

Flujo de estados:

```text
pending ─validate→ validated ─assign→ assigned ─start→ in_progress ─resolve→ resolved
pending ─assign→ assigned                    (valida automáticamente)
validated|assigned ─resolve→ resolved
pending|validated ─reject→ rejected
```

Para mantenimiento: PENDIENTE = `assigned`, EN ATENCIÓN = `in_progress`, RESUELTA = `resolved`. Una transición inválida devuelve 409 con `details.status` y `details.allowed_from`. Cada cambio escribe en la bitácora el id y el rol de quien lo hizo, nunca su nombre ni su correo, y emite `incidents:status_changed`.

### Accesibilidad

| Método | Ruta                                                                                    | Notas                                                                                                                                                                    |
| ------ | --------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| GET    | `/accessibility/points?type=&status=&bbox=&format=`                                     | Las rampas incluyen `ramp.slope` y `ramp.width_m`                                                                                                                        |
| GET    | `/accessibility/routes?origin=lng,lat&destination=lng,lat&accessible=true&radius_m=300` | `data`: rutas guardadas cuyos extremos están dentro de `radius_m` m. Con origen y destino agrega `computed` (`RouteComputation`): la mejor ruta por la red peatonal      |
| POST   | `/accessibility/routes/alternative`                                                     | `{ origin: [lng,lat], destination: [lng,lat], accessible?, avoid?: [{ lng, lat, radius_m? }] }`. Calcula evitando además esos puntos y guarda la ruta (201 + `saved_id`) |

#### Cálculo de rutas accesibles

La red peatonal (`database/gis/pedestrian-network.geojson`) proviene de OpenStreetMap: son 4 610 tramos de calle en Roma Norte, Condesa, Centro Histórico y Coyoacán. El algoritmo es A*.

| Regla                                                                                                       | Modo accesible | Modo normal |
| ----------------------------------------------------------------------------------------------------------- | -------------- | ----------- |
| Incidencia activa que obstruye (bloqueo de accesibilidad, obstáculo, accidente, falla, agua; radio 25–40 m) | bloquea        | bloquea     |
| Obstáculo o punto inhabilitado con estado `blocked` (radio 20 m)                                            | bloquea        | ignora      |
| Escaleras                                                                                                   | prohibidas     | permitidas  |
| Esquina con rampa disponible (a 25 m)                                                                       | sin costo      | —           |
| Esquina con rampa dañada                                                                                    | +250 m         | —           |
| Esquina sin información de rampa                                                                            | +35 m          | —           |
| Tramo junto a ruta accesible marcada                                                                        | ×0.85          | —           |
| Banqueta dañada                                                                                             | ×1.6           | —           |

La respuesta indica `status`:

- `active`: la ruta directa está libre.
- `alternative`: la ruta directa cruza un obstáculo. `baseline` trae la ruta directa y `avoided`, lo que se evitó.
- `none`: todo está bloqueado, o el punto queda a más de 300 m de la red.

Incluye además distancia, tiempo (0.9 m/s en modo accesible, 1.3 m/s en modo normal), rampas usadas e indicaciones calle por calle.

### Reglas

| Método | Ruta         | Notas                                                                                                                                                    |
| ------ | ------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| GET    | `/rules`     | Ordenadas por `sort_order`                                                                                                                               |
| PATCH  | `/rules/:id` | `{ name?, description?, enabled?, sort_order?, conditions?, action? }`. El DSL se valida, ver [modelo-datos.md](modelo-datos.md#dsl-del-motor-de-reglas) |

Los cambios aplican desde la siguiente evaluación. El motor lee las reglas en cada evaluación y no guarda caché.

### Motor de reglas

No tiene endpoint propio. Se ejecuta solo en tres momentos:

| Disparador                                                                      | Qué evalúa                                                    |
| ------------------------------------------------------------------------------- | ------------------------------------------------------------- |
| Lectura de coladera (`POST /drains/:code/readings` o `drain_reading` en ingest) | Esa coladera                                                  |
| Detección `WATER_ACCUMULATION` de una cámara                                    | Las coladeras dentro del radio de la regla, 250 m por defecto |
| Reporte de clima (`weather`)                                                    | Todas las coladeras                                           |

Hechos disponibles:

| Hecho                     | Valor                                                                                                                              |
| ------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `drain.obstruction_level` | Nivel actual de la coladera                                                                                                        |
| `weather.raining`         | Último reporte de clima de las últimas 3 h, de la zona de la coladera o sin zona. `false` si no hay                                |
| `camera.water_detected`   | Existe una detección de agua con confianza ≥ 0.6 dentro de `window.radius_m` y `window.seconds`. La distancia es real, con PostGIS |
| `camera.confidence`       | Confianza máxima de esas detecciones                                                                                               |

Aplicación de la regla ganadora, que es la más severa entre las que coinciden:

- **Sin incidencia activa del motor para esa coladera.** Se crea una. Emite `incidents:created` y `alerts:created`.
- **Hay una activa con menor prioridad.** Se escala la misma incidencia: prioridad, tipo y descripción. Emite `incidents:priority_raised` y `alerts:escalated`.
- **Hay una activa con igual o mayor prioridad.** No pasa nada. Así no se duplican incidencias ni se repiten alertas.
- **Nunca baja la prioridad sola.** Cerrar la incidencia es decisión de una persona. Después de resolverla, una nueva condición abre otra.

Cada creación o escalamiento queda en la bitácora con la regla, los hechos y el disparador.

### Capas GIS

| Método | Ruta                    | Roles | Notas                                                           |
| ------ | ----------------------- | ----- | --------------------------------------------------------------- |
| GET    | `/gis/flood-risk-zones` | todos | Zonas con riesgo de inundación (GeoJSON mock de `database/gis`) |
| GET    | `/gis/zones`            | todos | Zonas operativas ZONE-001 a ZONE-004                            |

Se cargan en memoria al arrancar. Si un archivo falta o es inválido, la API no arranca.

### Eventos, clima e IA

| Método | Ruta                                                  | Roles                           | Notas                                                              |
| ------ | ----------------------------------------------------- | ------------------------------- | ------------------------------------------------------------------ |
| POST   | `/events/ingest`                                      | `x-device-key`, admin, operator | Lote de hasta 500 eventos. Ver abajo                               |
| GET    | `/events?from=&to=&device_id=&type=&page=&page_size=` | staff                           | Detecciones de cámara y clima guardados. Por defecto, últimas 24 h |
| GET    | `/weather`                                            | todos                           | Último reporte de clima vigente, o `null`                          |
| POST   | `/ai/analyze`                                         | `x-device-key`, admin, operator | `{ device_id, location_id?, frame_ref?, hint?, ingest? }`          |

#### `POST /events/ingest`: store-and-forward del gateway

```json
{
  "events": [
    {
      "type": "drain_reading",
      "device_code": "DRAIN-001",
      "value": 78,
      "recorded_at": "2026-09-29T15:30:00Z"
    },
    {
      "type": "camera_event",
      "device_id": "CAM-001",
      "event_type": "WATER_ACCUMULATION",
      "confidence": 0.92,
      "location_id": "ZONE-001",
      "priority": "HIGH",
      "recorded_at": "2026-09-29T15:31:00Z"
    },
    {
      "type": "weather",
      "device_code": "GW-001",
      "raining": true,
      "intensity_mm_h": 22,
      "zone": "ZONE-001"
    },
    { "type": "heartbeat", "device_code": "GW-001", "status": "online" }
  ]
}
```

`camera_event` usa exactamente el payload del documento, con `device_id` como código de cámara. Respuesta:

```json
{
  "received": 4,
  "accepted": 4,
  "duplicates": 0,
  "stale": 0,
  "rejected": 0,
  "failed": 0,
  "results": [{ "index": 0, "type": "drain_reading", "status": "accepted" }, "…"]
}
```

Reglas de procesamiento:

- **Orden.** Los eventos se procesan en orden cronológico de `recorded_at`, no en el orden del arreglo.
- **Resultado por evento.** Uno inválido, por ejemplo un dispositivo inexistente, queda `rejected` sin bloquear a los demás, y el gateway lo manda a la cola de descartados. Si el error es del servidor (base de datos caída, un fallo inesperado), el evento queda `failed`: el gateway lo conserva y lo reintenta con backoff, así que no se pierde. Un payload mal formado responde 400 completo.
- **Idempotencia.** Reenviar el mismo lote no duplica nada: responde `duplicate`. Las lecturas se deduplican por dispositivo y `recorded_at`. Las detecciones y el clima, por dispositivo, tipo y `recorded_at`.
- **Datos atrasados.** Si no se envía `synced`, todo lo que llega con más de 60 s de retraso se guarda con `synced: false`.
- **Heartbeats viejos.** Si tienen más de 90 s, responden `stale`: no prueban que el dispositivo siga vivo.

#### Detecciones de cámara

- Una confianza menor a 0.6 se guarda, pero no crea incidencia.
- Una detección de más de 30 min, llegada por store-and-forward, se guarda pero no crea incidencia.
- Si la misma cámara repite el mismo tipo dentro de 15 min, se refresca la incidencia abierta. Sube la confianza, queda un evento `redetected` y no se crea otra.
- Las detecciones con prioridad alta o crítica emiten `alerts:created`.

#### `/ai/analyze`

Si `AI_SERVICE_URL` está definido, llama al servicio de Python. Si no está definido o no responde en 5 s, usa el mock interno. El campo `detection.backend` indica cuál respondió: `ai-service`, `mock` o `mock-fallback`. Con `ingest: true`, que es el valor por defecto, la detección se procesa como un evento de cámara. `hint` fuerza la clase para las demos. Solo existen clases de infraestructura: el sistema nunca detecta personas, rostros ni placas.

### Monitor de heartbeats

Cada 10 s, la API marca `offline` los dispositivos `online` o `degraded` sin heartbeat en 90 s. Emite `devices:status` con `reason: "heartbeat_timeout"`. No toca los dispositivos en `maintenance`. El siguiente heartbeat los regresa a `online`. Los tiempos se ajustan con `HEARTBEAT_TIMEOUT_S` y `HEARTBEAT_CHECK_INTERVAL_S`.

## WebSocket

```text
ws://localhost:3000/ws?token=<access_token>
ws://localhost:5173/ws?token=<access_token>     (vía proxy)
```

El token se valida **antes** del upgrade. Sin token válido la respuesta es HTTP 401 y no se abre la conexión. El token nunca aparece en los logs. Cuando expira el access token, el cliente debe reconectarse con uno nuevo.

Mensajes del cliente:

```json
{ "subscribe": "drain-readings" }
{ "unsubscribe": "drain-readings" }
{ "ping": true }
```

Mensajes de control del servidor. Siempre traen `type`:

```json
{ "type": "welcome", "allowed_channels": ["devices:status", "..."], "ts": "…" }
{ "type": "subscribed", "channel": "drain-readings", "ts": "…" }
{ "type": "error", "message": "Tu rol no puede suscribirse a devices:status", "ts": "…" }
```

Mensajes de datos. Siempre traen `event` y nunca `type`:

```json
{
  "channel": "drain-readings",
  "event": "reading",
  "data": {
    "device_code": "DRAIN-001",
    "value": 88,
    "obstruction_level": 88,
    "drain_status": "alert",
    "recorded_at": "…",
    "synced": true,
    "batch_size": 1
  },
  "ts": "2026-09-29T15:30:00.123Z"
}
```

| Canal            | Eventos                                                   | Datos                                                                                                   | Roles |
| ---------------- | --------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- | ----- |
| `devices:status` | `status_changed`                                          | `DeviceStatusEvent`                                                                                     | staff |
| `heartbeats`     | `received`                                                | `HeartbeatEvent`                                                                                        | staff |
| `drain-readings` | `reading`                                                 | `DrainReadingEvent`                                                                                     | staff |
| `incidents`      | `created`, `updated`, `status_changed`, `priority_raised` | `IncidentDto`. `status_changed` agrega `previous_status` y `priority_raised` agrega `previous_priority` | todos |
| `camera-events`  | `detected`                                                | `CameraEventMessage`                                                                                    | staff |
| `alerts`         | `created`, `escalated`                                    | `AlertEvent`, con `label`, `priority`, `message`, `rule_name` y `facts`                                 | todos |

"staff" es admin, operator y maintenance. El servidor envía un ping cada 30 s y cierra las conexiones que no responden.

### Usuarios

| Método | Ruta                      | Roles           | Notas                                                                                                  |
| ------ | ------------------------- | --------------- | ------------------------------------------------------------------------------------------------------ |
| GET    | `/users/assignees`        | admin, operator | Personal de mantenimiento activo al que se puede asignar una incidencia. Solo `id` y `name`            |
| GET    | `/users?q=&role=&status=` | admin           | `UserAdminDto[]`. Nunca expone el hash de contraseña                                                   |
| POST   | `/users`                  | admin           | `{ name, email, password (mín. 8), role }`. Correo duplicado → 409                                     |
| PATCH  | `/users/:id`              | admin           | `{ name?, role?, status?, password? }`. Cambiar rol o contraseña, o quitar acceso, revoca las sesiones |
| DELETE | `/users/:id`              | admin           | Baja lógica: `status = inactive` y revoca sesiones. El historial conserva sus referencias              |

Un administrador no puede quitarse el rol, suspenderse ni desactivarse a sí mismo. Si lo intenta, recibe 409.

### Mantenimiento y bitácora

| Método | Ruta                                                      | Roles                                       | Notas                                                                                   |
| ------ | --------------------------------------------------------- | ------------------------------------------- | --------------------------------------------------------------------------------------- |
| POST   | `/incidents/:id/accept`                                   | quien tiene asignada la incidencia, o admin | Paso **ACEPTADA** del flujo de mantenimiento, ver abajo                                 |
| GET    | `/incident-events?from=&to=&event_type=&page=&page_size=` | staff                                       | Bitácora de todas las incidencias, la más reciente primero. Por defecto, últimos 7 días |

El flujo de mantenimiento es PENDIENTE → ACEPTADA → EN ATENCIÓN → RESUELTA. El enum `incident_status` de la especificación no tiene un valor "aceptada". Por eso, aceptar una incidencia `assigned` registra el evento `accepted` y agrega `metadata.accepted_at`. Así el tablero distingue PENDIENTE (asignada sin aceptar) de ACEPTADA.

### Reglas: crear y eliminar

| Método | Ruta         | Roles | Notas                                                                                                            |
| ------ | ------------ | ----- | ---------------------------------------------------------------------------------------------------------------- |
| POST   | `/rules`     | admin | `{ name, description, enabled?, sort_order?, conditions, action }`. El DSL se valida y un nombre duplicado → 409 |
| DELETE | `/rules/:id` | admin | 204                                                                                                              |
