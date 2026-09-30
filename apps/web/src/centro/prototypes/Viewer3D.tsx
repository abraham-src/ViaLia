import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { STLExporter } from 'three/examples/jsm/exporters/STLExporter.js';

/**
 * Visor 3D de un prototipo. El modelo sigue al cursor: al pasar por encima se inclina y
 * gira hacia donde apunta el mouse y se desplaza un poco con él; al salir vuelve a su
 * giro lento. Sin controles de órbita: la interacción es solo con el puntero.
 */

export interface ModelView {
  /** Posición de la cámara y punto al que mira (metros). */
  camera: [number, number, number];
  target: [number, number, number];
}

export interface BuiltModel {
  root: THREE.Group;
  /** Se llama en cada cuadro con el tiempo en segundos. */
  update?: (t: number) => void;
  dispose?: () => void;
}

export interface Viewer3DHandle {
  /** STL binario en milímetros, sin elementos de ayuda (conos, agua, anillos). */
  exportStl(): Blob | null;
}

interface Props {
  build: () => BuiltModel;
  view: ModelView;
  className?: string;
  ariaLabel: string;
}

const MAX_YAW = 0.75;
const MAX_PITCH = 0.22;
const SHIFT = 0.06;

export const Viewer3D = forwardRef<Viewer3DHandle, Props>(function Viewer3D(
  { build, view, className = '', ariaLabel },
  ref,
) {
  const host = useRef<HTMLDivElement>(null);
  const modelRef = useRef<BuiltModel | null>(null);
  const viewRef = useRef(view);
  viewRef.current = view;
  const [failed, setFailed] = useState(false);

  useImperativeHandle(ref, () => ({
    exportStl() {
      const model = modelRef.current;
      if (!model) return null;
      const { root } = model;
      root.updateMatrixWorld(true);
      const inv = root.matrixWorld.clone().invert();
      const mm = new THREE.Matrix4().makeScale(1000, 1000, 1000);
      const out = new THREE.Group();
      root.traverse((o) => {
        if (!(o instanceof THREE.Mesh) || isHelper(o)) return;
        const m = new THREE.Mesh(o.geometry);
        m.matrixAutoUpdate = false;
        m.matrix.copy(mm).multiply(inv).multiply(o.matrixWorld);
        out.add(m);
      });
      out.updateMatrixWorld(true);
      const data = new STLExporter().parse(out, { binary: true }) as DataView;
      return new Blob([data.buffer as ArrayBuffer], { type: 'model/stl' });
    },
  }));

  useEffect(() => {
    const el = host.current;
    if (!el) return;
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    } catch {
      setFailed(true);
      return;
    }
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;
    el.appendChild(renderer.domElement);
    renderer.domElement.style.display = 'block';

    const scene = new THREE.Scene();
    const pmrem = new THREE.PMREMGenerator(renderer);
    const envTex = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    scene.environment = envTex;

    const sun = new THREE.DirectionalLight(0xffffff, 1.6);
    sun.position.set(4, 9, 6);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.camera.left = -6;
    sun.shadow.camera.right = 6;
    sun.shadow.camera.top = 8;
    sun.shadow.camera.bottom = -4;
    sun.shadow.bias = -0.0004;
    scene.add(sun, new THREE.HemisphereLight(0xdfe8f5, 0x8a94a6, 0.5));

    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(40, 40),
      new THREE.ShadowMaterial({ opacity: 0.16 }),
    );
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    ground.userData.helper = true;
    scene.add(ground);

    const model = build();
    modelRef.current = model;
    const pivot = new THREE.Group();
    pivot.add(model.root);
    scene.add(pivot);
    model.root.traverse((o) => {
      if (o instanceof THREE.Mesh && !isHelper(o)) {
        o.castShadow = true;
        o.receiveShadow = true;
      }
    });

    const camera = new THREE.PerspectiveCamera(32, 1, 0.05, 200);
    const camPos = new THREE.Vector3(...viewRef.current.camera);
    const camTarget = new THREE.Vector3(...viewRef.current.target);
    camera.position.copy(camPos);
    camera.lookAt(camTarget);

    const resize = () => {
      const w = el.clientWidth;
      const h = el.clientHeight;
      if (!w || !h) return;
      renderer.setSize(w, h, false);
      renderer.domElement.style.width = '100%';
      renderer.domElement.style.height = '100%';
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    };
    const ro = new ResizeObserver(resize);
    ro.observe(el);
    resize();

    // Seguimiento del cursor.
    const pointer = { x: 0, y: 0, inside: false };
    const onMove = (e: PointerEvent) => {
      const r = el.getBoundingClientRect();
      pointer.x = ((e.clientX - r.left) / r.width) * 2 - 1;
      pointer.y = ((e.clientY - r.top) / r.height) * 2 - 1;
      pointer.inside = true;
    };
    const onLeave = () => {
      pointer.inside = false;
    };
    el.addEventListener('pointermove', onMove);
    el.addEventListener('pointerleave', onLeave);

    // Solo se anima cuando el visor está en pantalla.
    let visible = true;
    const io = new IntersectionObserver(([entry]) => {
      visible = entry?.isIntersecting ?? true;
    });
    io.observe(el);

    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const clock = new THREE.Clock();
    const goalPos = new THREE.Vector3();
    const goalTarget = new THREE.Vector3();
    const shift = { x: 0, y: 0 };
    let idle = 0;
    let raf = 0;
    const loop = () => {
      raf = requestAnimationFrame(loop);
      if (!visible) return;
      const dt = Math.min(0.05, clock.getDelta());
      const t = clock.elapsedTime;
      if (!pointer.inside && !reduced) idle += dt * 0.25;

      const yaw = pointer.inside ? pointer.x * MAX_YAW : Math.sin(idle) * 0.45;
      const pitch = pointer.inside ? pointer.y * MAX_PITCH : 0;
      const k = 1 - Math.pow(0.001, dt); // suavizado independiente de los FPS
      pivot.rotation.y += (yaw - pivot.rotation.y) * k;
      pivot.rotation.x += (pitch - pivot.rotation.x) * k;
      camPos.lerp(goalPos.set(...viewRef.current.camera), k * 0.6);
      camTarget.lerp(goalTarget.set(...viewRef.current.target), k * 0.6);
      camera.position.copy(camPos);
      camera.lookAt(camTarget);

      // Se gira alrededor del punto que se está viendo (no del origen) y el modelo se
      // desplaza un poco hacia el cursor.
      const span = camPos.distanceTo(camTarget);
      const sx = pointer.inside ? pointer.x * SHIFT * span * 0.25 : 0;
      const sy = pointer.inside ? -pointer.y * SHIFT * span * 0.15 : 0;
      shift.x += (sx - shift.x) * k;
      shift.y += (sy - shift.y) * k;
      pivot.position.set(camTarget.x + shift.x, camTarget.y + shift.y, camTarget.z);
      model.root.position.copy(camTarget).negate();

      model.update?.(t);
      renderer.render(scene, camera);
    };
    loop();

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      io.disconnect();
      el.removeEventListener('pointermove', onMove);
      el.removeEventListener('pointerleave', onLeave);
      model.dispose?.();
      scene.traverse((o) => {
        if (o instanceof THREE.Mesh) {
          o.geometry.dispose();
          const mats = Array.isArray(o.material) ? o.material : [o.material];
          for (const m of mats) {
            for (const v of Object.values(m)) if (v instanceof THREE.Texture) v.dispose();
            m.dispose();
          }
        }
      });
      envTex.dispose();
      pmrem.dispose();
      renderer.dispose();
      renderer.domElement.remove();
      modelRef.current = null;
    };
  }, [build]);

  return (
    <div
      ref={host}
      className={`relative cursor-grab touch-none ${className}`}
      role="img"
      aria-label={ariaLabel}
    >
      {failed && (
        <div className="absolute inset-0 grid place-items-center text-[13px] text-cx-ink3">
          Este navegador no tiene WebGL: no se puede mostrar el modelo 3D.
        </div>
      )}
    </div>
  );
});

function isHelper(o: THREE.Object3D): boolean {
  for (let p: THREE.Object3D | null = o; p; p = p.parent) if (p.userData.helper) return true;
  return false;
}
