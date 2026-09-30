# Desarrollo

## Opción A: todo en Docker

```bash
cp .env.example .env
docker compose up --build
```

Después de cambiar código, reconstruye el servicio afectado:

```bash
docker compose up --build api
```

## Opción B: base de datos en Docker, apps en local (recarga en caliente)

Requiere Node.js 20.11 o superior.

```bash
cp .env.example .env
npm install
docker compose up -d postgres

npm run build:packages                 # shared-types y shared-utils
npm run prisma:generate -w @simu/api
npm run db:deploy                      # aplica migraciones
npm run db:seed                        # seeds idempotentes

npm run dev:api                        # http://localhost:3000
npm run dev:web                        # http://localhost:5173 (proxy /api y /ws)
npm run dev:simulator                  # http://localhost:4000
```

Si ya tienes un Postgres local ocupando el 5432, cambia `POSTGRES_PORT` y `DATABASE_URL` en `.env`.

## Opción C: Windows sin Docker

Probado en Windows 11 con Node 24 LTS, PostgreSQL 16.15 y PostGIS 3.6.2.

1. Instala Node y PostgreSQL. `superpassword` es la contraseña del usuario `postgres` y solo aplica a tu máquina:
   ```powershell
   winget install --id OpenJS.NodeJS.LTS --exact
   winget install --id PostgreSQL.PostgreSQL.16 --exact --override "--mode unattended --unattendedmodeui none --superpassword <tu-clave> --serverport 5432 --disable-components stackbuilder"
   ```
2. Instala PostGIS. Descarga `postgis-bundle-pg16-*x64.zip` de https://download.osgeo.org/postgis/windows/pg16/ y copia sus carpetas `bin`, `lib`, `share` y `gdal-data` dentro de `C:\Program Files\PostgreSQL\16`. Si algunas DLL están en uso, se pueden omitir porque PostgreSQL ya trae las suyas.
3. Crea el usuario, la base y la extensión como `postgres`:
   ```sql
   CREATE USER simu WITH PASSWORD 'simu_dev_password';
   CREATE DATABASE simu OWNER simu;
   \c simu
   CREATE EXTENSION postgis;
   ```
4. Sigue los pasos de la Opción B desde `npm install`, sin el comando de Docker.

`package.json` incluye `allowScripts` para Prisma y esbuild. npm 11 o superior no ejecuta scripts de instalación sin esa aprobación, y sin ellos Prisma no descarga su motor.

## Calidad

```bash
npm run typecheck   # TypeScript estricto en todos los workspaces + seeds
npm run lint        # ESLint (flat config compartida en la raíz)
npm run format      # Prettier
npm test            # Vitest (shared-utils, api, simulator, web)
npm run test:e2e    # Playwright: los 6 escenarios de demo en Chromium
```

### Pruebas de integración

Las pruebas de la API corren contra una base PostgreSQL real, `simu_test`. Antes de cada corrida se aplican las migraciones, se vacían las tablas y se ejecuta el seed. Se crea una sola vez, como `postgres`:

```sql
CREATE DATABASE simu_test OWNER simu;
\c simu_test
CREATE EXTENSION postgis;
```

Y en `.env`:

```bash
TEST_DATABASE_URL=postgresql://simu:simu_dev_password@localhost:5432/simu_test?schema=public
```

Si `TEST_DATABASE_URL` no está definido, las pruebas de integración se omiten y solo corren las unitarias. La configuración rechaza que `TEST_DATABASE_URL` sea igual a `DATABASE_URL`, para no vaciar la base de desarrollo por accidente.

### Pruebas E2E (Playwright)

`e2e/` contiene las pruebas de punta a punta. `access.spec.ts` cubre login, roles y sesión. `scenarios.spec.ts` cubre los 6 escenarios de [escenarios-demo.md](escenarios-demo.md).

Playwright levanta su propio stack aislado. No usa los servidores de desarrollo ni sus datos:

| Pieza     | Puerto | Datos                                                          |
| --------- | ------ | -------------------------------------------------------------- |
| API       | 3100   | Base `simu_e2e`, heartbeat timeout de 20 s                     |
| Simulador | 4100   | `apps/simulator/data/simu-gateway-e2e.db`, se borra al iniciar |
| Web       | 5174   | Vite con el proxy apuntando a 3100 y 4100                      |

Antes de la corrida se aplican las migraciones a `simu_e2e`. Antes de cada prueba se vacían las tablas, se recarga el seed y se reinicia el simulador. El simulador corre sin detecciones aleatorias de cámara, así que toda incidencia viene del escenario.

Preparación, una sola vez:

```sql
-- como postgres
CREATE DATABASE simu_e2e OWNER simu;
\c simu_e2e
CREATE EXTENSION postgis;
```

```bash
npx playwright install chromium   # navegador de Playwright
npm run test:e2e                  # ~4 min; el escenario 6 espera la caída real de 100 s
npm run test:e2e -- -g "Riesgo"   # una sola prueba por nombre
npm run test:e2e:report           # reporte HTML; las fallas incluyen traza y captura
```

La URL de la base se cambia con `E2E_DATABASE_URL`. Los secretos (JWT, llave de dispositivos, contraseña demo) se leen del `.env` de la raíz, igual que en desarrollo. El mapa se dibuja con WebGL por software (SwiftShader), así que no hace falta GPU.

Reglas:

- Sin `any`. Si es inevitable, se justifica con un comentario en la misma línea.
- Toda entrada HTTP se valida con Zod.
- Acceso a datos con Prisma. SQL crudo solo para PostGIS y siempre parametrizado con `$queryRaw` o `$executeRaw` como _tagged template_. Nunca uses `$queryRawUnsafe` con datos de usuario.
- Sin secretos en el código: todo por `.env`.
- Nunca registres correos, nombres, tokens ni contraseñas en logs.

## Migraciones

El esquema usa columnas PostGIS generadas e índices GIST que Prisma no representa. Por eso **no** uses `prisma migrate dev` directamente.

1. Edita `database/schema.prisma`.
2. Genera la migración sin aplicarla:
   ```bash
   npm run db:migrate -w @simu/api -- --name add_something
   ```
3. Revisa el SQL en `database/migrations/<fecha>_add_something/`. Elimina cualquier `DROP` de columnas `geom`, de índices `*_geom_idx` o de la tabla `spatial_ref_sys` de PostGIS que Prisma haya propuesto por no reconocerlos.
4. Aplica con `npm run db:deploy` y haz commit del SQL.
5. Verifica que no quedó deriva:
   ```bash
   cd apps/api
   npx dotenv -e ../../.env -- prisma migrate diff --from-url "$DATABASE_URL" --to-schema-datamodel ../../database/schema.prisma --script
   ```
   La salida esperada contiene solo `DROP INDEX "*_geom_idx"` y `ALTER COLUMN "geom" DROP DEFAULT`. Son los índices GIST y las columnas generadas que Prisma no modela. Cualquier otra línea indica que el SQL y el schema no coinciden.

Si agregas un valor a un enum, actualiza también `packages/shared-types/src/enums.ts`. La prueba de paridad fallará si no lo haces.

## Git

- Rama principal: `main`. Trabaja en ramas `feat/…`, `fix/…`, `chore/…`.
- Commits convencionales: `feat(api): …`, `fix(web): …`, `chore: …`, `docs: …`, `test: …`.
- Antes de abrir un PR: `npm run typecheck && npm run lint && npm test`.
- El PR describe qué cambia, cómo se probó y si requiere `docker compose down -v`, por ejemplo cuando cambian los seeds.

## Reiniciar datos

```bash
docker compose down -v && docker compose up --build
```
