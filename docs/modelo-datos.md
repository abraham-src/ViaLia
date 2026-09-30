# Modelo de datos

PostgreSQL 16 + PostGIS 3.4. Fuente de verdad: [`database/schema.prisma`](../database/schema.prisma) y la migración [`20260929000000_init`](../database/migrations/20260929000000_init/migration.sql).

## Convenciones

- Tablas y columnas en `snake_case`; modelos Prisma en `PascalCase` con `@@map`.
- Claves primarias `uuid` (`gen_random_uuid()`), salvo tablas de alto volumen (`bigserial`) y `roles` (`serial`).
- Timestamps `timestamptz(3)` en UTC. La interfaz convierte a `America/Mexico_City`.
- Geometrías en SRID 4326. Las columnas `geom` de tipo punto son **generadas** desde `longitude`/`latitude`.
- Todas las columnas geométricas tienen índice GIST.
- `metadata`/`payload` son `jsonb NOT NULL DEFAULT '{}'`.

## Enums

| Tipo Postgres              | Valores                                                                                                            |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| `role_name`                | admin, operator, maintenance, citizen                                                                              |
| `user_status`              | active, inactive, suspended                                                                                        |
| `device_type`              | camera, drain, traffic_light, sensor, gateway                                                                      |
| `device_status`            | online, offline, degraded, maintenance                                                                             |
| `drain_status`             | normal, caution, alert, critical                                                                                   |
| `incident_type`            | water_accumulation, drain_obstruction, accident, obstacle, infrastructure_failure, accessibility_block, flood_risk |
| `incident_priority`        | low, medium, high, critical                                                                                        |
| `incident_status`          | pending, validated, assigned, in_progress, resolved, rejected                                                      |
| `accessibility_point_type` | ramp, sidewalk, crosswalk, accessible_route, obstacle, temporarily_disabled                                        |
| `accessibility_status`     | available, blocked, damaged, unknown                                                                               |
| `route_status`             | active, blocked, alternative                                                                                       |

Estos valores se duplican en `packages/shared-types`. La prueba `apps/api/test/enums.test.ts` falla si divergen.

## Tablas

### roles

| Columna     | Tipo      | Notas |
| ----------- | --------- | ----- |
| id          | serial PK |       |
| name        | role_name | único |
| description | text      |       |

### users

| Columna                | Tipo           | Notas            |
| ---------------------- | -------------- | ---------------- |
| id                     | uuid PK        |                  |
| name                   | text           |                  |
| email                  | text           | único            |
| password_hash          | text           | bcrypt, costo 10 |
| role_id                | int FK → roles | RESTRICT         |
| status                 | user_status    | default `active` |
| created_at, updated_at | timestamptz    |                  |

### refresh_tokens

Agregada en la Fase 2, migración `20260929120000_auth_refresh_tokens`.

| Columna     | Tipo            | Notas                                          |
| ----------- | --------------- | ---------------------------------------------- |
| id          | uuid PK         | es el `jti` del JWT de refresco                |
| user_id     | uuid FK → users | CASCADE                                        |
| expires_at  | timestamptz     |                                                |
| revoked_at  | timestamptz     | nullable; se llena al rotar o al cerrar sesión |
| replaced_by | uuid            | nullable; id del token que lo reemplazó        |
| created_at  | timestamptz     |                                                |

No guarda el token, solo su id. El JWT va firmado, así que la fila sirve para revocarlo y para detectar reutilización.

### devices

Tabla padre de cámaras, coladeras, semáforos, sensores y gateways.

| Columna                | Tipo                 | Notas                                |
| ---------------------- | -------------------- | ------------------------------------ |
| id                     | uuid PK              |                                      |
| device_code            | text                 | único, p. ej. `CAM-001`, `DRAIN-001` |
| type                   | device_type          |                                      |
| name                   | text                 |                                      |
| latitude, longitude    | double precision     | CHECK de rango                       |
| geom                   | geometry(Point,4326) | generada, GIST                       |
| status                 | device_status        | default `offline`                    |
| last_heartbeat         | timestamptz          | nullable                             |
| metadata               | jsonb                | `zone`, `zone_name`, datos técnicos  |
| created_at, updated_at | timestamptz          |                                      |

### cameras

| Columna              | Tipo              | Notas          |
| -------------------- | ----------------- | -------------- |
| id                   | uuid PK           |                |
| device_id            | uuid FK → devices | único, CASCADE |
| model                | text              |                |
| location_description | text              |                |
| stream_url           | text              | nullable       |
| status               | device_status     |                |

### drains

| Columna             | Tipo                 | Notas                             |
| ------------------- | -------------------- | --------------------------------- |
| id                  | uuid PK              |                                   |
| device_id           | uuid FK → devices    | único, CASCADE                    |
| latitude, longitude | double precision     |                                   |
| geom                | geometry(Point,4326) | generada, GIST                    |
| obstruction_level   | int                  | CHECK 0–100                       |
| status              | drain_status         | derivado del nivel (ver umbrales) |
| last_reading_at     | timestamptz          |                                   |

Umbrales (`packages/shared-utils/src/drain.ts`): `normal` < 50, `caution` 50–80, `alert` > 80, `critical` > 90.

### sensor_readings

| Columna     | Tipo              | Notas                                  |
| ----------- | ----------------- | -------------------------------------- |
| id          | bigserial PK      |                                        |
| device_id   | uuid FK → devices | CASCADE                                |
| value       | numeric(12,4)     |                                        |
| unit        | text              | `percent` para coladeras               |
| recorded_at | timestamptz       | cuándo midió el sensor                 |
| received_at | timestamptz       | cuándo llegó al servidor               |
| synced      | boolean           | `false` si llegó por store-and-forward |
| metadata    | jsonb             |                                        |

Índice **único** `(device_id, recorded_at)`: hace idempotentes los reintentos del gateway.

### device_events

Agregada en la Fase 3, migración `20260929180000_device_events`. Guarda las detecciones de cámara y los reportes de clima. Alimenta `GET /events` y los hechos del motor de reglas.

| Columna     | Tipo              | Notas                                                                         |
| ----------- | ----------------- | ----------------------------------------------------------------------------- |
| id          | bigserial PK      |                                                                               |
| device_id   | uuid FK → devices | CASCADE                                                                       |
| event_type  | text              | `WATER_ACCUMULATION`, `OBSTACLE`, … o `WEATHER`                               |
| confidence  | numeric(4,3)      | CHECK 0–1. Solo en detecciones                                                |
| payload     | jsonb             | cámara: `location_id`, `priority`. Clima: `raining`, `intensity_mm_h`, `zone` |
| recorded_at | timestamptz       | cuándo ocurrió                                                                |
| received_at | timestamptz       | cuándo llegó                                                                  |
| synced      | boolean           | `false` si llegó tarde por store-and-forward                                  |

El índice **único** `(device_id, event_type, recorded_at)` hace idempotentes los reenvíos. También hay índices por `recorded_at DESC` y por `(event_type, recorded_at DESC)`, que usa la búsqueda de "agua detectada en la ventana".

### heartbeats

| Columna     | Tipo              | Notas                                  |
| ----------- | ----------------- | -------------------------------------- |
| id          | bigserial PK      |                                        |
| device_id   | uuid FK → devices | CASCADE                                |
| received_at | timestamptz       | índice `(device_id, received_at DESC)` |
| status      | device_status     | estado reportado                       |

### incidents

| Columna                   | Tipo                 | Notas                                             |
| ------------------------- | -------------------- | ------------------------------------------------- |
| id                        | uuid PK              |                                                   |
| device_id                 | uuid FK → devices    | nullable, SET NULL                                |
| type                      | incident_type        |                                                   |
| description               | text                 |                                                   |
| priority                  | incident_priority    | default `medium`                                  |
| confidence                | numeric(4,3)         | CHECK 0–1; reportes manuales = 1                  |
| status                    | incident_status      | default `pending`                                 |
| latitude, longitude       | double precision     |                                                   |
| geom                      | geometry(Point,4326) | generada, GIST                                    |
| created_at, updated_at    | timestamptz          |                                                   |
| validated_at, resolved_at | timestamptz          | nullable                                          |
| assigned_to               | uuid FK → users      | nullable, SET NULL                                |
| metadata                  | jsonb                | `zone`, `source`, datos de la regla que la generó |

### incident_events (bitácora)

| Columna     | Tipo                | Notas                                                              |
| ----------- | ------------------- | ------------------------------------------------------------------ |
| id          | bigserial PK        |                                                                    |
| incident_id | uuid FK → incidents | CASCADE                                                            |
| event_type  | text                | `created`, `validated`, `assigned`, `priority_raised`, `resolved`… |
| payload     | jsonb               |                                                                    |
| created_at  | timestamptz         |                                                                    |

### accessibility_points

| Columna             | Tipo                     | Notas                                          |
| ------------------- | ------------------------ | ---------------------------------------------- |
| id                  | uuid PK                  |                                                |
| type                | accessibility_point_type |                                                |
| latitude, longitude | double precision         |                                                |
| geom                | geometry(Point,4326)     | generada, GIST                                 |
| status              | accessibility_status     |                                                |
| source              | text                     | `seed_mock`, `official_cdmx`, `citizen_report` |
| metadata            | jsonb                    | `key`, `name`, `zone`                          |

### ramps

| Columna                | Tipo                           | Notas                |
| ---------------------- | ------------------------------ | -------------------- |
| id                     | uuid PK                        |                      |
| accessibility_point_id | uuid FK → accessibility_points | nullable, SET NULL   |
| latitude, longitude    | double precision               |                      |
| geom                   | geometry(Point,4326)           | generada, GIST       |
| status                 | accessibility_status           |                      |
| slope                  | numeric(5,2)                   | porcentaje, nullable |
| width_m                | numeric(5,2)                   | nullable             |

### accessible_routes

| Columna     | Tipo                      | Notas |
| ----------- | ------------------------- | ----- |
| id          | uuid PK                   |       |
| origin      | geometry(Point,4326)      | GIST  |
| destination | geometry(Point,4326)      | GIST  |
| path        | geometry(LineString,4326) | GIST  |
| status      | route_status              |       |
| created_at  | timestamptz               |       |
| metadata    | jsonb                     |       |

Prisma no puede escribir geometrías. Esta tabla se inserta con SQL parametrizado (`ST_GeomFromText`).

### rules

| Columna                | Tipo        | Notas                          |
| ---------------------- | ----------- | ------------------------------ |
| id                     | uuid PK     |                                |
| name                   | text        | único                          |
| description            | text        |                                |
| conditions             | jsonb       | DSL, ver abajo                 |
| action                 | jsonb       |                                |
| enabled                | boolean     |                                |
| sort_order             | int         | orden de evaluación ascendente |
| created_at, updated_at | timestamptz |                                |

## DSL del motor de reglas

```json
{
  "all": [
    { "fact": "drain.obstruction_level", "op": "gt", "value": 80 },
    { "fact": "weather.raining", "op": "eq", "value": true },
    {
      "fact": "camera.water_detected",
      "op": "eq",
      "value": true,
      "window": { "radius_m": 250, "seconds": 900 }
    }
  ]
}
```

- `op`: `gt`, `gte`, `lt`, `lte`, `eq`, `neq`.
- `window` aplica a hechos de cámara: se busca un evento `WATER_ACCUMULATION` dentro del radio y del intervalo respecto a la coladera.
- `action`: `{ "incident_type": "flood_risk", "set_priority": "critical", "emit_alert": true, "label": "RIESGO CRÍTICO" }`.

Reglas sembradas:

| sort_order | Nombre                                       | Condición             | Acción                               |
| ---------- | -------------------------------------------- | --------------------- | ------------------------------------ |
| 10         | Coladera sobre 80 %                          | coladera > 80         | drain_obstruction, medium, ALERTA    |
| 20         | Coladera sobre 80 % con lluvia               | + lluvia              | flood_risk, high, RIESGO ALTO        |
| 30         | Coladera sobre 80 %, lluvia y agua detectada | + cámara detecta agua | flood_risk, critical, RIESGO CRÍTICO |

## Datos semilla

| Entidad              | Cantidad | Detalle                                                                        |
| -------------------- | -------- | ------------------------------------------------------------------------------ |
| roles                | 4        | admin, operator, maintenance, citizen                                          |
| users                | 4        | uno por rol                                                                    |
| devices              | 11       | CAM-001…004, DRAIN-001…004, TL-001…002, GW-001                                 |
| sensor_readings      | 192      | 24 h cada 30 min por coladera                                                  |
| accessibility_points | 30       | Roma Norte 9, Centro 8, Condesa 7, Coyoacán 6                                  |
| ramps                | 11       | una por punto tipo `ramp`                                                      |
| accessible_routes    | 2        | Roma Norte y Madero                                                            |
| incidents            | 5        | water_accumulation, drain_obstruction, accident, obstacle, accessibility_block |
| rules                | 3        | las del documento                                                              |

CAM-001 y DRAIN-001 están en la misma esquina, Álvaro Obregón y Orizaba. Así el escenario de riesgo combinado es coherente espacialmente.

## Desviaciones respecto a la especificación

| Cambio                                                | Motivo                                                                                                                           |
| ----------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| Se sembraron 11 dispositivos en lugar de 8            | La especificación dice "8" pero enumera 4 + 4 + 2 + 1 = 11. Se siguió la enumeración.                                            |
| `rules.sort_order`, `rules.created_at/updated_at`     | "Evaluar en orden" requiere un orden explícito.                                                                                  |
| `incidents.updated_at`                                | Necesario para `PATCH` y para ordenar por última actividad.                                                                      |
| Único `(device_id, recorded_at)` en `sensor_readings` | Idempotencia de store-and-forward.                                                                                               |
| `incidents.confidence` con default 1                  | Los reportes manuales no tienen confianza de IA.                                                                                 |
| Tabla `refresh_tokens`                                | Revocar sesiones al cerrar sesión y detectar tokens robados.                                                                     |
| Tabla `device_events`                                 | La especificación pide `GET /events` y la regla "cámara detecta agua", pero no define dónde guardar las detecciones ni el clima. |
