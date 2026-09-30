import * as THREE from 'three';
import type { BuiltModel } from './Viewer3D';
import { MAT, asHelper, box, canvasTexture, glowSprite, ledTexture, mesh, tube } from './parts';

/**
 * Semáforo adaptativo con cámara de IA integrada (unidades: metros).
 *
 *   - Poste cónico galvanizado de 6 m con ménsula de 4.4 m y tirante.
 *   - Cabeza vehicular de 3 lentes LED de 300 mm, viseras tipo túnel y placa de contraste
 *     con borde retrorreflejante.
 *   - Módulo de cámara integrado sobre la cabeza: lente con inclinación de 20°, anillo IR
 *     para visión nocturna, LED de estado y antena LTE.
 *   - Cabeza peatonal con cuenta regresiva y botón accesible (flecha táctil + audio).
 *   - Gabinete con controlador, cómputo de borde para la IA y respaldo UPS.
 */

export type Lamp = 'red' | 'yellow' | 'green';
export type PedState = 'walk' | 'flash' | 'dont';

export interface TrafficLightState {
  lamp: Lamp;
  ped: PedState;
  /** Segundos que le quedan a la fase peatonal (null = sin cuenta). */
  countdown: number | null;
  aiOnline: boolean;
  showFov: boolean;
}

const LAMP_COLOR: Record<Lamp, number> = { red: 0xff3b30, yellow: 0xffb300, green: 0x19e07a };
const LAMP_Y: Record<Lamp, number> = { red: 0.33, yellow: 0, green: -0.33 };

export const TRAFFIC_LIGHT_VIEWS = {
  conjunto: { camera: [8.8, 5.0, 11.6], target: [1.6, 3.25, 0] },
  cabeza: { camera: [5.3, 5.5, 2.4], target: [3.7, 4.95, 0] },
  base: { camera: [1.5, 1.6, 3.4], target: [-0.35, 1.0, 0] },
} as const satisfies Record<
  string,
  { camera: [number, number, number]; target: [number, number, number] }
>;

function vehicleHead(led: THREE.Texture) {
  const g = new THREE.Group();
  const housing = MAT.darkPoly();
  g.add(box(0.36, 1.02, 0.24, housing));
  // Placa de contraste con borde retrorreflejante (mejora la visibilidad con sol de frente).
  const plate = MAT.matteBlack();
  g.add(box(0.66, 1.32, 0.015, plate, [0, 0, -0.13]));
  const yellow = MAT.retroYellow();
  g.add(box(0.66, 0.05, 0.004, yellow, [0, 0.635, -0.121]));
  g.add(box(0.66, 0.05, 0.004, yellow, [0, -0.635, -0.121]));
  g.add(box(0.05, 1.32, 0.004, yellow, [0.305, 0, -0.121]));
  g.add(box(0.05, 1.32, 0.004, yellow, [-0.305, 0, -0.121]));

  const lenses = {} as Record<Lamp, THREE.MeshStandardMaterial>;
  const glows = {} as Record<Lamp, THREE.Sprite>;
  for (const lamp of ['red', 'yellow', 'green'] as const) {
    const y = LAMP_Y[lamp];
    const mat = new THREE.MeshStandardMaterial({
      color: 0x15171b,
      emissive: LAMP_COLOR[lamp],
      emissiveMap: led,
      emissiveIntensity: 0.05,
      roughness: 0.25,
    });
    lenses[lamp] = mat;
    g.add(
      mesh(
        new THREE.CylinderGeometry(0.13, 0.13, 0.02, 40),
        mat,
        [0, y, 0.122],
        [Math.PI / 2, 0, 0],
      ),
    );
    // Visera tipo túnel: cubre la parte superior para cortar el reflejo del sol.
    const visorLen = 0.22;
    const arc = Math.PI * 1.35;
    const visor = mesh(
      new THREE.CylinderGeometry(0.155, 0.155, visorLen, 32, 1, true, Math.PI - arc / 2, arc),
      housing,
      [0, y, 0.122 + visorLen / 2],
      [Math.PI / 2, 0, 0],
    );
    (visor.material as THREE.Material).side = THREE.DoubleSide;
    g.add(visor);
    const glow = glowSprite(LAMP_COLOR[lamp], 0.9);
    glow.position.set(0, y, 0.2);
    glow.visible = false;
    g.add(glow);
    glows[lamp] = glow;
  }
  return { group: g, lenses, glows };
}

function cameraModule() {
  const g = new THREE.Group();
  const shell = MAT.polymer(0xe7ebf0);
  // Cuerpo integrado a la cabeza, mismo ancho que la carcasa.
  g.add(box(0.36, 0.14, 0.3, shell, [0, 0.07, 0.02]));
  g.add(box(0.4, 0.02, 0.36, shell, [0, 0.15, 0.03]));
  // Óptica inclinada 20° hacia la calle.
  const optic = new THREE.Group();
  optic.position.set(0, 0.07, 0.17);
  optic.rotation.x = THREE.MathUtils.degToRad(20);
  optic.add(
    mesh(
      new THREE.CylinderGeometry(0.052, 0.058, 0.05, 32),
      MAT.darkPoly(),
      [0, 0, 0.02],
      [Math.PI / 2, 0, 0],
    ),
  );
  optic.add(
    mesh(
      new THREE.SphereGeometry(0.042, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2),
      MAT.glass(),
      [0, 0, 0.045],
      [Math.PI / 2, 0, 0],
    ),
  );
  const ir = new THREE.MeshStandardMaterial({
    color: 0x2a0b0b,
    emissive: 0x5a0000,
    emissiveIntensity: 0.6,
  });
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    optic.add(
      mesh(new THREE.SphereGeometry(0.007, 10, 8), ir, [
        Math.cos(a) * 0.07,
        Math.sin(a) * 0.07,
        0.035,
      ]),
    );
  }
  g.add(optic);
  const status = new THREE.MeshStandardMaterial({
    color: 0x062a2f,
    emissive: 0x22d3ee,
    emissiveIntensity: 2,
  });
  g.add(mesh(new THREE.SphereGeometry(0.012, 12, 10), status, [0.14, 0.07, 0.172]));
  // Antena LTE/5G de respaldo.
  g.add(
    mesh(
      new THREE.CylinderGeometry(0.012, 0.016, 0.16, 12),
      MAT.matteBlack(),
      [-0.13, 0.24, -0.06],
    ),
  );
  // Campo de visión (ayuda visual): cono desde la lente hacia la intersección.
  const h = 5.2;
  const coneGeo = new THREE.ConeGeometry(2.3, h, 40, 1, true);
  coneGeo.translate(0, -h / 2, 0);
  const fov = asHelper(mesh(coneGeo, MAT.helper(0x22d3ee, 0.06)));
  fov.position.set(0, 0.07, 0.2);
  fov.rotation.x = -THREE.MathUtils.degToRad(70);
  g.add(fov);
  return { group: g, status, fov };
}

function pedestrianHead() {
  const g = new THREE.Group();
  g.add(box(0.34, 0.36, 0.2, MAT.darkPoly()));
  const visor = mesh(
    new THREE.CylinderGeometry(0.19, 0.19, 0.14, 24, 1, true, Math.PI * 0.35, Math.PI * 1.3),
    MAT.darkPoly(),
    [0, 0, 0.17],
    [Math.PI / 2, 0, 0],
  );
  (visor.material as THREE.Material).side = THREE.DoubleSide;
  g.add(visor);
  const face = canvasTexture(256, 256, () => undefined);
  const faceMat = new THREE.MeshBasicMaterial({ map: face.texture, toneMapped: false });
  g.add(mesh(new THREE.PlaneGeometry(0.3, 0.3), faceMat, [0, 0, 0.101]));
  let last = '';
  const draw = (ped: PedState, countdown: number | null, blinkOn: boolean) => {
    const key = `${ped}|${countdown}|${blinkOn}`;
    if (key === last) return;
    last = key;
    face.redraw((ctx, w, h) => {
      ctx.fillStyle = '#0d0f12';
      ctx.fillRect(0, 0, w, h);
      const on = ped === 'walk' || (ped === 'flash' && blinkOn);
      ctx.save();
      ctx.translate(ped === 'walk' ? 60 : 64, 0);
      if (ped === 'walk') {
        // Figura caminando (blanco lunar).
        ctx.strokeStyle = on ? '#f4f7ff' : '#262a31';
        ctx.fillStyle = ctx.strokeStyle;
        ctx.lineWidth = 16;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.arc(20, 56, 17, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.moveTo(14, 88);
        ctx.lineTo(4, 150);
        ctx.moveTo(4, 150);
        ctx.lineTo(-22, 206);
        ctx.moveTo(4, 150);
        ctx.lineTo(34, 204);
        ctx.moveTo(12, 100);
        ctx.lineTo(-18, 138);
        ctx.moveTo(12, 100);
        ctx.lineTo(42, 130);
        ctx.stroke();
      } else {
        // Mano (naranja): "no cruzar".
        ctx.fillStyle = on || ped === 'dont' ? '#ff7a1a' : '#2a1d12';
        ctx.beginPath();
        ctx.roundRect(-30, 110, 88, 96, 24);
        ctx.fill();
        for (let i = 0; i < 4; i++) {
          ctx.beginPath();
          ctx.roundRect(-30 + i * 23, 40 + (i === 0 || i === 3 ? 18 : 0), 18, 90, 9);
          ctx.fill();
        }
        ctx.beginPath();
        ctx.roundRect(50, 120, 18, 60, 9);
        ctx.fill();
      }
      ctx.restore();
      if (countdown !== null) {
        ctx.fillStyle = ped === 'walk' ? '#f4f7ff' : '#ff7a1a';
        ctx.font = 'bold 92px monospace';
        ctx.textAlign = 'center';
        ctx.fillText(String(Math.max(0, countdown)).padStart(2, '0'), 190, 160);
      }
    });
  };
  return { group: g, draw };
}

function pushButton() {
  const g = new THREE.Group();
  g.add(box(0.13, 0.22, 0.07, MAT.retroYellow()));
  g.add(
    mesh(
      new THREE.CylinderGeometry(0.032, 0.032, 0.02, 28),
      MAT.galvanized(),
      [0, -0.02, 0.04],
      [Math.PI / 2, 0, 0],
    ),
  );
  // Flecha táctil que indica el sentido del cruce.
  g.add(box(0.06, 0.012, 0.012, MAT.matteBlack(), [0, 0.07, 0.04]));
  // Rejilla del altavoz (señal sonora para personas con discapacidad visual).
  for (let i = 0; i < 3; i++)
    g.add(box(0.07, 0.006, 0.005, MAT.matteBlack(), [0, -0.075 - i * 0.012, 0.037]));
  return g;
}

function cabinet() {
  const g = new THREE.Group();
  const body = MAT.cabinet();
  g.add(box(0.62, 1.15, 0.42, body, [0, 0.575, 0]));
  g.add(box(0.66, 0.04, 0.46, body, [0, 1.17, 0]));
  const seam = MAT.matteBlack();
  g.add(box(0.004, 1.05, 0.004, seam, [0.26, 0.575, 0.212]));
  g.add(box(0.54, 0.004, 0.004, seam, [-0.01, 1.1, 0.212]));
  g.add(box(0.54, 0.004, 0.004, seam, [-0.01, 0.05, 0.212]));
  g.add(box(0.03, 0.14, 0.03, MAT.galvanized(), [0.22, 0.6, 0.225]));
  for (let i = 0; i < 6; i++) g.add(box(0.3, 0.012, 0.01, seam, [-0.08, 0.2 + i * 0.03, 0.214]));
  // Placa de identificación.
  const label = canvasTexture(256, 128, (ctx, w, h) => {
    ctx.fillStyle = '#0c1d38';
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 34px sans-serif';
    ctx.fillText('ViaLia', 18, 48);
    ctx.font = '19px sans-serif';
    ctx.fillStyle = '#9fb3d1';
    ctx.fillText('Controlador · IA de borde', 18, 82);
    ctx.fillText('UPS 4 h · TL-001', 18, 108);
  });
  g.add(
    mesh(
      new THREE.PlaneGeometry(0.3, 0.15),
      new THREE.MeshBasicMaterial({ map: label.texture }),
      [-0.08, 0.92, 0.212],
    ),
  );
  return g;
}

function streetSign() {
  const tex = canvasTexture(512, 128, (ctx, w, h) => {
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#0f5132';
    ctx.fillRect(6, 6, w - 12, h - 12);
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 58px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('Av. Insurgentes Sur', w / 2, 84);
  });
  const g = new THREE.Group();
  g.add(box(1.3, 0.32, 0.02, MAT.galvanized()));
  g.add(
    mesh(
      new THREE.PlaneGeometry(1.28, 0.3),
      new THREE.MeshStandardMaterial({ map: tex.texture, roughness: 0.4 }),
      [0, 0, 0.011],
    ),
  );
  return g;
}

export function buildTrafficLight(getState: () => TrafficLightState): BuiltModel {
  const root = new THREE.Group();
  const galv = MAT.galvanized();
  const led = ledTexture();

  // Cimentación y placa base.
  root.add(box(1.9, 0.12, 1.3, MAT.concrete(), [-0.35, 0.06, 0]));
  root.add(box(0.42, 0.03, 0.42, galv, [0, 0.135, 0]));
  for (const [x, z] of [
    [-0.16, -0.16],
    [0.16, -0.16],
    [-0.16, 0.16],
    [0.16, 0.16],
  ] as const) {
    root.add(mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.05, 10), galv, [x, 0.165, z]));
  }
  // Poste cónico y remate.
  root.add(mesh(new THREE.CylinderGeometry(0.075, 0.11, 6.0, 32), galv, [0, 3.15, 0]));
  root.add(
    mesh(
      new THREE.SphereGeometry(0.08, 20, 12, 0, Math.PI * 2, 0, Math.PI / 2),
      galv,
      [0, 6.15, 0],
    ),
  );
  // Ménsula con tirante.
  const armY = 5.75;
  root.add(
    tube(new THREE.Vector3(0, armY, 0), new THREE.Vector3(4.4, armY, 0), 0.075, 0.045, galv),
  );
  root.add(
    tube(new THREE.Vector3(0, armY - 0.75, 0), new THREE.Vector3(1.6, armY, 0), 0.035, 0.03, galv),
  );
  root.add(mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.35, 24), galv, [0, armY, 0]));
  root.add(mesh(new THREE.SphereGeometry(0.047, 16, 10), galv, [4.4, armY, 0]));

  // Placa de calle.
  const sign = streetSign();
  sign.position.set(2.1, armY - 0.32, 0);
  root.add(sign);
  root.add(box(0.02, 0.14, 0.02, galv, [1.7, armY - 0.12, 0]));
  root.add(box(0.02, 0.14, 0.02, galv, [2.5, armY - 0.12, 0]));

  // Cabeza vehicular con cámara integrada, colgada de la ménsula.
  const head = vehicleHead(led);
  const headX = 3.7;
  const headY = 4.72;
  head.group.position.set(headX, headY, 0);
  root.add(head.group);
  const cam = cameraModule();
  cam.group.position.set(headX, headY + 0.51, 0);
  root.add(cam.group);
  root.add(
    mesh(new THREE.CylinderGeometry(0.03, 0.03, armY - (headY + 0.68), 16), galv, [
      headX,
      (armY + headY + 0.68) / 2,
      0,
    ]),
  );
  root.add(box(0.12, 0.05, 0.12, galv, [headX, armY - 0.05, 0]));

  // Cabeza peatonal, botón accesible y gabinete.
  const ped = pedestrianHead();
  ped.group.position.set(0, 2.75, 0.2);
  root.add(ped.group);
  root.add(box(0.06, 0.06, 0.12, galv, [0, 2.75, 0.07]));
  const button = pushButton();
  button.position.set(0, 1.08, 0.13);
  root.add(button);
  const cab = cabinet();
  cab.position.set(-0.95, 0.12, 0.05);
  root.add(cab);
  root.add(
    tube(
      new THREE.Vector3(-0.64, 0.3, 0.05),
      new THREE.Vector3(-0.1, 0.3, 0.05),
      0.025,
      0.025,
      MAT.darkPoly(),
    ),
  );

  return {
    root,
    update(t) {
      const s = getState();
      for (const lamp of ['red', 'yellow', 'green'] as const) {
        const on = lamp === s.lamp;
        head.lenses[lamp].emissiveIntensity = on ? 2.4 : 0.05;
        head.glows[lamp].visible = on;
      }
      cam.status.emissive.setHex(s.aiOnline ? 0x22d3ee : 0xf59e0b);
      cam.status.emissiveIntensity = (Math.sin(t * 4) > 0 ? 2.2 : 0.4) * (s.aiOnline ? 1 : 1.3);
      cam.fov.visible = s.showFov && s.aiOnline;
      ped.draw(s.ped, s.countdown, Math.sin(t * 7) > 0);
    },
    dispose() {
      led.dispose();
    },
  };
}
