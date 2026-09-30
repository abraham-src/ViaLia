import type {
  AccessibilityPointType,
  AccessibilityStatus,
  RouteStatus,
  ZoneCode,
} from '@simu/shared-types';

export interface AccessibilityPointSeed {
  key: string;
  type: AccessibilityPointType;
  status: AccessibilityStatus;
  name: string;
  zone: ZoneCode;
  lat: number;
  lng: number;
  /** Only for ramps: slope (%) and width (m). */
  ramp?: { slope: number | null; widthM: number | null };
}

type P = Omit<AccessibilityPointSeed, 'zone'>;
const zone =
  (z: ZoneCode) =>
  (p: P): AccessibilityPointSeed => ({ ...p, zone: z });

/**
 * 30 accessibility points on real corners of Roma Norte, Centro Histórico, Condesa and
 * Coyoacán. Positions come from the OSM pedestrian network (database/gis) so ramps line
 * up with the corners the router crosses; statuses and dimensions are mock data.
 */
export const ACCESSIBILITY_POINTS: readonly AccessibilityPointSeed[] = [
  // ── Roma Norte (ZONE-001): scenario 5 ──
  ...(
    [
      {
        key: 'roma-ramp-obregon-orizaba-ne',
        type: 'ramp',
        status: 'available',
        name: 'Rampa Álvaro Obregón y Orizaba, esquina NE',
        lat: 19.41845,
        lng: -99.15972,
        ramp: { slope: 6.0, widthM: 1.2 },
      },
      {
        key: 'roma-ramp-obregon-orizaba-so',
        type: 'ramp',
        status: 'available',
        name: 'Rampa Álvaro Obregón y Orizaba, esquina SO',
        lat: 19.4183,
        lng: -99.1599,
        ramp: { slope: 7.5, widthM: 1.1 },
      },
      {
        key: 'roma-cross-obregon-orizaba',
        type: 'crosswalk',
        status: 'available',
        name: 'Cruce peatonal Álvaro Obregón / Orizaba',
        lat: 19.41838,
        lng: -99.15981,
      },
      {
        key: 'roma-ramp-orizaba-colima',
        type: 'ramp',
        status: 'damaged',
        name: 'Rampa Orizaba y Colima, esquina NE (fracturada)',
        lat: 19.41992,
        lng: -99.16012,
        ramp: { slope: 11.0, widthM: 0.9 },
      },
      {
        key: 'roma-sidewalk-orizaba',
        type: 'sidewalk',
        status: 'available',
        name: 'Banqueta Orizaba entre Colima y Tabasco (poniente)',
        lat: 19.4195,
        lng: -99.16005,
      },
      {
        key: 'roma-cross-obregon-cordoba',
        type: 'crosswalk',
        status: 'available',
        name: 'Cruce peatonal Álvaro Obregón / Córdoba',
        lat: 19.41842,
        lng: -99.15851,
      },
      {
        key: 'roma-ramp-obregon-cordoba-se',
        type: 'ramp',
        status: 'available',
        name: 'Rampa Álvaro Obregón y Córdoba, esquina SE',
        lat: 19.41835,
        lng: -99.15845,
        ramp: { slope: 5.5, widthM: 1.5 },
      },
      {
        key: 'roma-obstacle-obregon-works',
        type: 'obstacle',
        status: 'blocked',
        name: 'Obra en banqueta Álvaro Obregón entre Orizaba y Córdoba',
        lat: 19.4184,
        lng: -99.15916,
      },
      {
        key: 'roma-route-obregon-median',
        type: 'accessible_route',
        status: 'available',
        name: 'Camellón de Álvaro Obregón entre Córdoba y Mérida (ruta accesible)',
        lat: 19.41854,
        lng: -99.1579,
      },
    ] satisfies P[]
  ).map(zone('ZONE-001')),

  // ── Centro Histórico (ZONE-002) ──
  ...(
    [
      {
        key: 'centro-ramp-madero-eje',
        type: 'ramp',
        status: 'available',
        name: 'Rampa Madero y Eje Central, esquina SE',
        lat: 19.43408,
        lng: -99.1408,
        ramp: { slope: 6.5, widthM: 1.4 },
      },
      {
        key: 'centro-cross-eje-madero',
        type: 'crosswalk',
        status: 'available',
        name: 'Cruce peatonal Eje Central / Madero',
        lat: 19.43413,
        lng: -99.14087,
      },
      {
        key: 'centro-route-madero',
        type: 'accessible_route',
        status: 'available',
        name: 'Calle Madero peatonal (Eje Central → Zócalo)',
        lat: 19.43385,
        lng: -99.139,
      },
      {
        key: 'centro-ramp-madero-motolinia',
        type: 'ramp',
        status: 'available',
        name: 'Rampa Madero y Motolinía',
        lat: 19.43357,
        lng: -99.13722,
        ramp: { slope: 5.0, widthM: 1.6 },
      },
      {
        key: 'centro-sidewalk-5mayo',
        type: 'sidewalk',
        status: 'damaged',
        name: 'Banqueta 5 de Mayo norte entre Bolívar e Isabel la Católica',
        lat: 19.43443,
        lng: -99.1376,
      },
      {
        key: 'centro-cross-5mayo-montepiedad',
        type: 'crosswalk',
        status: 'available',
        name: 'Cruce peatonal 5 de Mayo / Monte de Piedad',
        lat: 19.43397,
        lng: -99.13402,
      },
      {
        key: 'centro-disabled-zocalo',
        type: 'temporarily_disabled',
        status: 'blocked',
        name: 'Rampa Plaza de la Constitución (cerrada por evento)',
        lat: 19.4328,
        lng: -99.1332,
      },
      {
        key: 'centro-ramp-pinosuarez',
        type: 'ramp',
        status: 'available',
        name: 'Rampa Pino Suárez y Venustiano Carranza',
        lat: 19.43074,
        lng: -99.1323,
        ramp: { slope: 7.0, widthM: 1.2 },
      },
    ] satisfies P[]
  ).map(zone('ZONE-002')),

  // ── Condesa (ZONE-003) ──
  ...(
    [
      {
        key: 'condesa-ramp-mexico-michoacan',
        type: 'ramp',
        status: 'available',
        name: 'Rampa Av. México y Michoacán, esquina NE',
        lat: 19.41113,
        lng: -99.1688,
        ramp: { slope: 6.0, widthM: 1.3 },
      },
      {
        key: 'condesa-cross-michoacan-mexico',
        type: 'crosswalk',
        status: 'available',
        name: 'Cruce peatonal Michoacán / Av. México',
        lat: 19.41107,
        lng: -99.16887,
      },
      {
        key: 'condesa-sidewalk-amsterdam',
        type: 'sidewalk',
        status: 'available',
        name: 'Banqueta Av. Amsterdam cerca de Sonora',
        lat: 19.4146,
        lng: -99.1694,
      },
      {
        key: 'condesa-obstacle-amsterdam-roots',
        type: 'obstacle',
        status: 'blocked',
        name: 'Raíces levantan banqueta en Av. Amsterdam',
        lat: 19.4122,
        lng: -99.1712,
      },
      {
        key: 'condesa-ramp-amsterdam-michoacan',
        type: 'ramp',
        status: 'unknown',
        name: 'Rampa Amsterdam y Michoacán',
        lat: 19.4116,
        lng: -99.17145,
        ramp: { slope: null, widthM: null },
      },
      {
        key: 'condesa-route-parque-mexico',
        type: 'accessible_route',
        status: 'available',
        name: 'Circuito interior Parque México',
        lat: 19.4121,
        lng: -99.1696,
      },
      {
        key: 'condesa-cross-sonora-mexico',
        type: 'crosswalk',
        status: 'available',
        name: 'Cruce peatonal Sonora / Av. México',
        lat: 19.41313,
        lng: -99.16799,
      },
    ] satisfies P[]
  ).map(zone('ZONE-003')),

  // ── Coyoacán (ZONE-004) ──
  ...(
    [
      {
        key: 'coyoacan-ramp-centenario',
        type: 'ramp',
        status: 'available',
        name: 'Rampa Jardín Centenario, acceso por Hidalgo',
        lat: 19.3496,
        lng: -99.1623,
        ramp: { slope: 6.0, widthM: 1.5 },
      },
      {
        key: 'coyoacan-cross-centenario-sosa',
        type: 'crosswalk',
        status: 'available',
        name: 'Cruce peatonal Centenario / Francisco Sosa',
        lat: 19.34922,
        lng: -99.16425,
      },
      {
        key: 'coyoacan-sidewalk-sosa',
        type: 'sidewalk',
        status: 'damaged',
        name: 'Banqueta Francisco Sosa (adoquín irregular)',
        lat: 19.349,
        lng: -99.1652,
      },
      {
        key: 'coyoacan-disabled-hidalgo',
        type: 'temporarily_disabled',
        status: 'blocked',
        name: 'Rampa Plaza Hidalgo (tianguis dominical)',
        lat: 19.3496,
        lng: -99.16175,
      },
      {
        key: 'coyoacan-obstacle-allende',
        type: 'obstacle',
        status: 'blocked',
        name: 'Puesto semifijo sobre banqueta de Allende',
        lat: 19.3508,
        lng: -99.16185,
      },
      {
        key: 'coyoacan-ramp-allende-malintzin',
        type: 'ramp',
        status: 'available',
        name: 'Rampa Allende y Malintzin',
        lat: 19.35216,
        lng: -99.16188,
        ramp: { slope: 8.0, widthM: 1.0 },
      },
    ] satisfies P[]
  ).map(zone('ZONE-004')),
];

export interface AccessibleRouteSeed {
  key: string;
  name: string;
  status: RouteStatus;
  /** [lng, lat] vertices; first = origin, last = destination. */
  path: ReadonlyArray<readonly [number, number]>;
}

export const ACCESSIBLE_ROUTES: readonly AccessibleRouteSeed[] = [
  {
    // Goes around the works on Álvaro Obregón via Córdoba, using the SE ramp.
    key: 'route-roma-orizaba-cordoba',
    name: 'Orizaba y Colima → Álvaro Obregón y Mérida por Córdoba',
    status: 'active',
    path: [
      [-99.160194, 19.41985],
      [-99.158943, 19.420133],
      [-99.158747, 19.419391],
      [-99.158511, 19.418423],
      [-99.157323, 19.418656],
    ],
  },
  {
    key: 'route-centro-madero',
    name: 'Eje Central → Zócalo por Madero peatonal',
    status: 'active',
    path: [
      [-99.140869, 19.434132],
      [-99.139, 19.43385],
      [-99.137277, 19.43361],
      [-99.1348, 19.4334],
    ],
  },
];
