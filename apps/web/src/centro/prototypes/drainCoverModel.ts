import * as THREE from 'three';
import type { BuiltModel } from './Viewer3D';
import { MAT, asHelper, box, canvasTexture, mesh } from './parts';

/**
 * Coladera pluvial inteligente (unidades: metros), en corte para ver el interior.
 *
 *   - Marco y rejilla de hierro dúctil clase D400 (EN 124: tránsito pesado), Ø 600 mm.
 *   - Núcleo central con ventana de polímero: el metal bloquea la radio, así que la antena
 *     LoRaWAN/NB-IoT queda bajo esa ventana. LED de estado e ID grabado.
 *   - Módulo IP68 atornillado bajo la rejilla: sensor ultrasónico impermeable (versión de
 *     campo del HC-SR04 del prototipo), microcontrolador de bajo consumo con acelerómetro
 *     (detecta rejilla movida o robada) y pila de litio de larga duración.
 *   - Canasta de sedimentos removible: retiene basura para que no tape el drenaje.
 */

export interface DrainState {
  /** Nivel reportado 0–100 % (el mismo que llega a la plataforma). */
  level: number;
  exploded: boolean;
}

/** Cotas del corte (metros). */
export const DRAIN_DIMS = {
  street: 1.3,
  floor: 0.12,
  sensorBottom: 1.3 - 0.33,
  /** Zona muerta del ultrasónico: no mide a menos de 25 cm. */
  blanking: 0.25,
};

/** Altura del agua para un nivel dado (misma escala que usa el firmware). */
export function waterHeight(level: number): number {
  const top = DRAIN_DIMS.sensorBottom - DRAIN_DIMS.blanking;
  return DRAIN_DIMS.floor + (top - DRAIN_DIMS.floor) * Math.min(1, Math.max(0, level / 100));
}

/** Distancia que mide el sensor (cm) para un nivel dado. */
export function measuredCm(level: number): number {
  return Math.round((DRAIN_DIMS.sensorBottom - waterHeight(level)) * 100);
}

export const DRAIN_VIEWS = {
  conjunto: { camera: [2.9, 3.0, 3.4], target: [0, 0.85, 0] },
  modulo: { camera: [1.3, 1.1, 1.6], target: [0, 0.9, 0.05] },
  rejilla: { camera: [0.9, 2.6, 1.1], target: [0, 1.3, 0] },
} as const satisfies Record<
  string,
  { camera: [number, number, number]; target: [number, number, number] }
>;

function grate(): THREE.Group {
  const g = new THREE.Group();
  const R = 0.3;
  const hub = 0.095;
  const shape = new THREE.Shape();
  shape.absarc(0, 0, R, 0, Math.PI * 2, false);
  // Ranuras paralelas (sentido del flujo) que respetan el núcleo central.
  const w = 0.028;
  for (let x = -R + 0.05; x <= R - 0.05; x += 0.052) {
    const half = Math.sqrt(Math.max(0, (R - 0.035) ** 2 - x ** 2));
    const spans: Array<[number, number]> =
      Math.abs(x) < hub + 0.02
        ? [
            [-half, -Math.sqrt(Math.max(0, (hub + 0.03) ** 2 - x ** 2))],
            [Math.sqrt(Math.max(0, (hub + 0.03) ** 2 - x ** 2)), half],
          ]
        : [[-half, half]];
    for (const [a, b] of spans) {
      if (b - a < 0.04) continue;
      const hole = new THREE.Path();
      hole.moveTo(x - w / 2, a + w / 2);
      hole.lineTo(x - w / 2, b - w / 2);
      hole.absarc(x, b - w / 2, w / 2, Math.PI, 0, true);
      hole.lineTo(x + w / 2, a + w / 2);
      hole.absarc(x, a + w / 2, w / 2, 0, Math.PI, true);
      shape.holes.push(hole);
    }
  }
  const hubHole = new THREE.Path();
  hubHole.absarc(0, 0, hub, 0, Math.PI * 2, true);
  shape.holes.push(hubHole);
  const geo = new THREE.ExtrudeGeometry(shape, {
    depth: 0.06,
    bevelEnabled: true,
    bevelSize: 0.004,
    bevelThickness: 0.004,
    curveSegments: 18,
  });
  geo.rotateX(-Math.PI / 2);
  g.add(mesh(geo, MAT.ductileIron(), [0, -0.06, 0]));

  // Núcleo: aro de hierro + ventana de polímero (transparente a la radio).
  g.add(
    mesh(
      new THREE.CylinderGeometry(hub + 0.005, hub + 0.005, 0.06, 40, 1, true),
      MAT.ductileIron(),
      [0, -0.03, 0],
    ),
  );
  const top = canvasTexture(256, 256, (ctx, W, H) => {
    ctx.fillStyle = '#2b3445';
    ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = '#3b475c';
    ctx.lineWidth = 6;
    for (let r = 40; r < 128; r += 22) {
      ctx.beginPath();
      ctx.arc(W / 2, H / 2, r, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.fillStyle = '#c7d2e3';
    ctx.font = 'bold 36px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('ViaLia', W / 2, H / 2 - 12);
    ctx.font = '24px monospace';
    ctx.fillText('DRAIN-001', W / 2, H / 2 + 26);
  });
  const radome = new THREE.MeshStandardMaterial({ map: top.texture, roughness: 0.6, metalness: 0 });
  // Grupos del cilindro: 0 = costado, 1 = tapa superior (con el grabado), 2 = tapa inferior.
  const side = MAT.polymer(0x2b3445);
  const radomeMesh = new THREE.Mesh(new THREE.CylinderGeometry(hub, hub, 0.05, 40), [
    side,
    radome,
    side,
  ]);
  radomeMesh.position.y = -0.025;
  g.add(radomeMesh);
  // Ranura para gancho de izaje.
  g.add(box(0.05, 0.02, 0.012, MAT.matteBlack(), [0.23, 0.001, 0]));
  return g;
}

function frameAndStreet(): THREE.Group {
  const g = new THREE.Group();
  const S = DRAIN_DIMS.street;
  // Marco cuadrado de hierro con asiento circular.
  const shape = new THREE.Shape();
  shape.moveTo(-0.39, -0.39);
  shape.lineTo(0.39, -0.39);
  shape.lineTo(0.39, 0.39);
  shape.lineTo(-0.39, 0.39);
  shape.lineTo(-0.39, -0.39);
  const hole = new THREE.Path();
  hole.absarc(0, 0, 0.305, 0, Math.PI * 2, true);
  shape.holes.push(hole);
  const frame = new THREE.ExtrudeGeometry(shape, {
    depth: 0.1,
    bevelEnabled: false,
    curveSegments: 48,
  });
  frame.rotateX(-Math.PI / 2);
  g.add(mesh(frame, MAT.ductileIron(), [0, S - 0.1, 0]));

  // Carpeta asfáltica y banqueta (en corte: solo atrás y a la izquierda).
  const asphalt = MAT.asphalt();
  g.add(box(2.6, 0.22, 0.9, asphalt, [0, S - 0.11, -0.84]));
  g.add(box(0.9, 0.22, 0.78, asphalt, [-0.84, S - 0.11, 0]));
  g.add(box(2.6, 0.18, 0.5, MAT.concrete(), [0, S + 0.09, -1.5]));
  // Pozo de concreto en corte: piso, muro trasero y muro izquierdo.
  const concrete = MAT.concrete();
  g.add(box(1.1, 0.1, 1.1, concrete, [0, DRAIN_DIMS.floor - 0.05, 0]));
  g.add(
    box(1.1, S - DRAIN_DIMS.floor - 0.22, 0.1, concrete, [
      0,
      (S - 0.22 + DRAIN_DIMS.floor) / 2,
      -0.5,
    ]),
  );
  g.add(
    box(0.1, S - DRAIN_DIMS.floor - 0.22, 1.1, concrete, [
      -0.5,
      (S - 0.22 + DRAIN_DIMS.floor) / 2,
      0,
    ]),
  );
  // Tubo de descarga al colector.
  g.add(
    mesh(
      new THREE.CylinderGeometry(0.1, 0.1, 0.4, 28, 1, true),
      MAT.concrete(),
      [0, 0.32, -0.62],
      [Math.PI / 2, 0, 0],
    ),
  );
  return g;
}

function basket(): THREE.Mesh {
  const perforated = canvasTexture(256, 256, (ctx, W, H) => {
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = '#000000';
    for (let y = 8; y < H; y += 16) {
      for (let x = (y / 16) % 2 ? 16 : 8; x < W; x += 16) {
        ctx.beginPath();
        ctx.arc(x, y, 5, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  });
  perforated.texture.wrapS = perforated.texture.wrapT = THREE.RepeatWrapping;
  perforated.texture.repeat.set(6, 2);
  const mat = new THREE.MeshStandardMaterial({
    color: 0xaab3bd,
    metalness: 0.8,
    roughness: 0.4,
    alphaMap: perforated.texture,
    alphaTest: 0.5,
    side: THREE.DoubleSide,
  });
  return mesh(new THREE.CylinderGeometry(0.27, 0.25, 0.34, 48, 1, true), mat);
}

/** Módulo sensor: cada pieza tiene su posición armada y su posición en vista explosionada. */
function sensorModule() {
  const parts: Array<{ obj: THREE.Object3D; home: THREE.Vector3; out: THREE.Vector3 }> = [];
  const g = new THREE.Group();
  const add = (
    obj: THREE.Object3D,
    home: [number, number, number],
    out: [number, number, number],
  ) => {
    obj.position.set(...home);
    g.add(obj);
    parts.push({ obj, home: new THREE.Vector3(...home), out: new THREE.Vector3(...out) });
  };
  // Antena de parche bajo la ventana de polímero.
  add(
    mesh(new THREE.CylinderGeometry(0.075, 0.075, 0.006, 32), MAT.pcb()),
    [0, -0.07, 0],
    [0, 0.1, 0],
  );
  // Carcasa IP68 (se vuelve translúcida en la vista explosionada).
  const shellMat = MAT.polymer(0x3a4252);
  shellMat.transparent = true;
  add(
    mesh(new THREE.CylinderGeometry(0.085, 0.085, 0.17, 40), shellMat),
    [0, -0.165, 0],
    [0, -0.22, 0],
  );
  // Pila de litio (Li-SOCl₂, 19 Ah: 5+ años con una lectura cada 5 min).
  const battery = new THREE.Group();
  battery.add(
    mesh(
      new THREE.CylinderGeometry(0.017, 0.017, 0.062, 24),
      new THREE.MeshStandardMaterial({ color: 0x1d4ed8, roughness: 0.35 }),
    ),
  );
  battery.add(
    mesh(
      new THREE.CylinderGeometry(0.017, 0.017, 0.062, 24),
      new THREE.MeshStandardMaterial({ color: 0x1d4ed8, roughness: 0.35 }),
      [0.036, 0, 0],
    ),
  );
  add(battery, [-0.018, -0.15, 0.02], [-0.22, -0.36, 0.14]);
  // Tarjeta: MCU de bajo consumo, radio LoRaWAN/NB-IoT y acelerómetro.
  const board = new THREE.Group();
  board.add(box(0.12, 0.006, 0.09, MAT.pcb()));
  board.add(box(0.03, 0.006, 0.03, MAT.matteBlack(), [-0.02, 0.006, 0]));
  board.add(box(0.022, 0.005, 0.016, MAT.galvanized(), [0.03, 0.006, 0.02]));
  add(board, [0, -0.2, 0], [0.22, -0.36, 0.1]);
  // Transductor ultrasónico impermeable apuntando al fondo.
  const sensor = new THREE.Group();
  sensor.add(mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.02, 32), MAT.matteBlack()));
  sensor.add(
    mesh(
      new THREE.CylinderGeometry(0.021, 0.021, 0.035, 32),
      MAT.polymer(0x111317),
      [0, -0.025, 0],
    ),
  );
  sensor.add(
    mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.002, 32), MAT.galvanized(), [0, -0.043, 0]),
  );
  add(sensor, [0, -0.26, 0], [0, -0.56, 0.04]);
  // Soportes al núcleo.
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2;
    const leg = box(0.012, 0.05, 0.012, MAT.galvanized());
    add(
      leg,
      [Math.cos(a) * 0.08, -0.07, Math.sin(a) * 0.08],
      [Math.cos(a) * 0.08, 0.05, Math.sin(a) * 0.08],
    );
  }
  return { group: g, parts, shellMat };
}

export function buildDrainCover(getState: () => DrainState): BuiltModel {
  const root = new THREE.Group();
  const S = DRAIN_DIMS.street;
  root.add(frameAndStreet());
  const cover = grate();
  cover.position.y = S;
  root.add(cover);

  // Canasta con su aro de apoyo. En la vista explosionada se "saca" hacia un lado, como en
  // el mantenimiento, para dejar ver el módulo sensor.
  const bsk = new THREE.Group();
  bsk.add(basket());
  bsk.add(
    mesh(
      new THREE.TorusGeometry(0.27, 0.01, 8, 48),
      MAT.galvanized(),
      [0, 0.17, 0],
      [Math.PI / 2, 0, 0],
    ),
  );
  const basketHome = new THREE.Vector3(0, S - 0.3, 0);
  const basketOut = new THREE.Vector3(0.95, S + 0.3, 0.35);
  bsk.position.copy(basketHome);
  root.add(bsk);

  const module = sensorModule();
  module.group.position.y = S;
  root.add(module.group);

  // LED de estado en la ventana (se ve desde la calle).
  const led = new THREE.MeshStandardMaterial({
    color: 0x052e16,
    emissive: 0x22c55e,
    emissiveIntensity: 1.5,
  });
  root.add(mesh(new THREE.SphereGeometry(0.008, 12, 8), led, [0.055, S + 0.002, 0.055]));

  // Agua del pozo y pulsos del ultrasónico (ayudas visuales).
  const waterMat = new THREE.MeshPhysicalMaterial({
    color: 0x2f7fbf,
    transparent: true,
    opacity: 0.55,
    roughness: 0.1,
    metalness: 0,
    depthWrite: false,
  });
  const water = asHelper(mesh(new THREE.BoxGeometry(0.9, 1, 0.9), waterMat));
  root.add(water);
  const pings = Array.from({ length: 3 }, () => {
    const m = asHelper(
      mesh(
        new THREE.TorusGeometry(1, 0.004, 6, 48),
        MAT.helper(0x22d3ee, 0.8),
        [0, 0, 0],
        [Math.PI / 2, 0, 0],
      ),
    );
    root.add(m);
    return m;
  });

  let level = getState().level;
  return {
    root,
    update(t) {
      const s = getState();
      // El agua se mueve con suavidad hacia el nivel reportado.
      level += (s.level - level) * 0.04;
      const top = waterHeight(level);
      const h = Math.max(0.01, top - DRAIN_DIMS.floor);
      water.scale.y = h;
      water.position.y = DRAIN_DIMS.floor + h / 2;
      const color =
        s.level > 90 ? 0xdc2626 : s.level > 80 ? 0xea580c : s.level >= 50 ? 0xd97706 : 0x22c55e;
      led.emissive.setHex(color);
      led.emissiveIntensity = s.level > 80 ? (Math.sin(t * 6) > 0 ? 2.5 : 0.3) : 1.5;

      for (const p of module.parts) p.obj.position.lerp(s.exploded ? p.out : p.home, 0.08);
      bsk.position.lerp(s.exploded ? basketOut : basketHome, 0.06);
      module.shellMat.opacity += ((s.exploded ? 0.28 : 1) - module.shellMat.opacity) * 0.1;
      module.shellMat.depthWrite = module.shellMat.opacity > 0.95;

      // Pulso: del sensor a la superficie del agua.
      const from = S - 0.33;
      pings.forEach((p, i) => {
        const k = (t * 0.8 + i / pings.length) % 1;
        p.visible = !s.exploded;
        p.position.y = from - (from - top) * k;
        const r = 0.03 + k * 0.22;
        p.scale.set(r, r, 1);
        (p.material as THREE.MeshBasicMaterial).opacity = 0.8 * (1 - k);
      });
    },
  };
}
