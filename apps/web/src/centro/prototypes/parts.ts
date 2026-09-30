import * as THREE from 'three';

/** Piezas y materiales compartidos por los modelos de prototipo (unidades: metros). */

export const MAT = {
  galvanized: () =>
    new THREE.MeshStandardMaterial({ color: 0x9ea7b1, metalness: 0.85, roughness: 0.38 }),
  darkPoly: () =>
    new THREE.MeshStandardMaterial({ color: 0x1c2026, metalness: 0.05, roughness: 0.55 }),
  matteBlack: () =>
    new THREE.MeshStandardMaterial({ color: 0x0f1115, metalness: 0, roughness: 0.85 }),
  retroYellow: () =>
    new THREE.MeshStandardMaterial({ color: 0xf2c400, metalness: 0.1, roughness: 0.35 }),
  cabinet: () =>
    new THREE.MeshStandardMaterial({ color: 0xc9d0d8, metalness: 0.55, roughness: 0.45 }),
  concrete: () =>
    new THREE.MeshStandardMaterial({ color: 0xb9b4ab, metalness: 0, roughness: 0.95 }),
  asphalt: () => new THREE.MeshStandardMaterial({ color: 0x3b3f45, metalness: 0, roughness: 0.92 }),
  ductileIron: () =>
    new THREE.MeshStandardMaterial({ color: 0x3d4148, metalness: 0.75, roughness: 0.5 }),
  polymer: (color = 0x2a3140) =>
    new THREE.MeshStandardMaterial({ color, metalness: 0.05, roughness: 0.4 }),
  glass: () =>
    new THREE.MeshPhysicalMaterial({
      color: 0x0b1422,
      metalness: 0,
      roughness: 0.05,
      clearcoat: 1,
      clearcoatRoughness: 0.03,
    }),
  pcb: () => new THREE.MeshStandardMaterial({ color: 0x1f7a4a, metalness: 0.2, roughness: 0.5 }),
  helper: (color: number, opacity: number) =>
    new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity,
      depthWrite: false,
      side: THREE.DoubleSide,
    }),
};

export function mesh(
  geometry: THREE.BufferGeometry,
  material: THREE.Material,
  pos: [number, number, number] = [0, 0, 0],
  rot: [number, number, number] = [0, 0, 0],
): THREE.Mesh {
  const m = new THREE.Mesh(geometry, material);
  m.position.set(...pos);
  m.rotation.set(...rot);
  return m;
}

export const box = (
  w: number,
  h: number,
  d: number,
  material: THREE.Material,
  pos: [number, number, number] = [0, 0, 0],
  rot: [number, number, number] = [0, 0, 0],
) => mesh(new THREE.BoxGeometry(w, h, d), material, pos, rot);

/** Cilindro entre dos puntos (tubos, tirantes, conduit). */
export function tube(
  a: THREE.Vector3,
  b: THREE.Vector3,
  r0: number,
  r1: number,
  material: THREE.Material,
  segments = 20,
): THREE.Mesh {
  const dir = new THREE.Vector3().subVectors(b, a);
  const len = dir.length();
  const m = new THREE.Mesh(new THREE.CylinderGeometry(r1, r0, len, segments), material);
  m.position.copy(a).addScaledVector(dir, 0.5);
  m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
  return m;
}

export function canvasTexture(
  w: number,
  h: number,
  draw: (ctx: CanvasRenderingContext2D, w: number, h: number) => void,
): { texture: THREE.CanvasTexture; redraw: (d?: typeof draw) => void } {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  const redraw = (d = draw) => {
    ctx.clearRect(0, 0, w, h);
    d(ctx, w, h);
    texture.needsUpdate = true;
  };
  redraw();
  return { texture, redraw };
}

/** Matriz de LEDs para las lentes: puntos en rejilla hexagonal. */
export function ledTexture(): THREE.CanvasTexture {
  return canvasTexture(256, 256, (ctx, w, h) => {
    ctx.fillStyle = '#1a1a1a';
    ctx.fillRect(0, 0, w, h);
    const step = 17;
    for (let y = step / 2, row = 0; y < h; y += step * 0.87, row++) {
      for (let x = (row % 2 ? step : step / 2) - 2; x < w; x += step) {
        ctx.beginPath();
        ctx.arc(x, y, 5.2, 0, Math.PI * 2);
        ctx.fillStyle = '#ffffff';
        ctx.fill();
      }
    }
  }).texture;
}

/** Halo aditivo para simular el brillo de una lámpara encendida. */
export function glowSprite(color: number, size: number): THREE.Sprite {
  const { texture } = canvasTexture(128, 128, (ctx, w, h) => {
    const g = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
    g.addColorStop(0, 'rgba(255,255,255,0.9)');
    g.addColorStop(0.25, 'rgba(255,255,255,0.35)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
  });
  const s = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: texture,
      color,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      transparent: true,
    }),
  );
  s.scale.set(size, size, 1);
  s.userData.helper = true;
  return s;
}

/** Marca un objeto (y sus hijos) como ayuda visual: no se exporta a STL ni proyecta sombra. */
export function asHelper<T extends THREE.Object3D>(o: T): T {
  o.userData.helper = true;
  return o;
}
