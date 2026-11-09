import * as THREE from 'three';
import { FIELD_CENTRE, FIELD_RADIUS, RING, ZONE_CENTRE } from '@/domain/wagon';

// The 3D ground: stripes, rope, boards, the 30 yard ring, zone borders, pitch and a complete two-tier bowl.
// Ported from mockups/wagon-pitch-options. Units are metres on a 65 m ground. +x is towards the right of the data frame
// and +z is towards the bowler's end (the bottom of the data frame).

export const BOUNDARY_M = 65;
export const PITCH_M = 20.12;
const KM = BOUNDARY_M / FIELD_RADIUS;

/** Data frame (363 by 363) to ground metres. */
export function toGround(x: number, y: number): [number, number] {
  return [(x - FIELD_CENTRE.x) * KM, (y - FIELD_CENTRE.y) * KM];
}

function seeded(seed: number): () => number {
  let a = seed | 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const canvasTexture = (canvas: HTMLCanvasElement): THREE.CanvasTexture => {
  const t = new THREE.CanvasTexture(canvas);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
};

export function groundDecal(text: string, width: number, height: number, x: number, z: number, color: string): THREE.Mesh {
  const cv = document.createElement('canvas');
  cv.width = 512; cv.height = Math.round((512 * height) / width);
  const c = cv.getContext('2d');
  if (c) { c.font = '500 50px Outfit, system-ui, sans-serif'; c.fillStyle = color; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(text, cv.width / 2, cv.height / 2); }
  const m = new THREE.Mesh(new THREE.PlaneGeometry(width, height), new THREE.MeshBasicMaterial({ map: canvasTexture(cv), transparent: true, depthWrite: false }));
  m.rotation.x = -Math.PI / 2; m.position.set(x, 0.06, z);
  return m;
}

export function addStadium(scene: THREE.Scene): void {
  scene.background = new THREE.Color(0x0b0e13);
  scene.fog = new THREE.Fog(0x0b0e13, 420, 900);
  scene.add(new THREE.HemisphereLight(0xcfd9ff, 0x16321f, 1.0));
  const sun = new THREE.DirectionalLight(0xffffff, 1.0); sun.position.set(40, 110, 70); scene.add(sun);

  const grass = document.createElement('canvas'); grass.width = grass.height = 2048;
  const g = grass.getContext('2d');
  if (g) {
    for (let i = 0; i < 22; i++) { g.fillStyle = i % 2 ? '#1c6a3f' : '#23784a'; g.fillRect(i * (2048 / 22), 0, 2048 / 22 + 1, 2048); }
    const vignette = g.createRadialGradient(1024, 1024, 500, 1024, 1024, 1024);
    vignette.addColorStop(0, 'rgba(0,0,0,0)'); vignette.addColorStop(1, 'rgba(0,0,0,.32)');
    g.fillStyle = vignette; g.fillRect(0, 0, 2048, 2048);
  }
  const grassTexture = canvasTexture(grass); grassTexture.anisotropy = 8;
  const ground = new THREE.Mesh(new THREE.CircleGeometry(BOUNDARY_M, 128), new THREE.MeshStandardMaterial({ map: grassTexture, roughness: 1 }));
  ground.rotation.x = -Math.PI / 2; scene.add(ground);
  const outer = new THREE.Mesh(new THREE.CircleGeometry(420, 48), new THREE.MeshBasicMaterial({ color: 0x10131a }));
  outer.rotation.x = -Math.PI / 2; outer.position.y = -0.2; scene.add(outer);
  const rope = new THREE.Mesh(new THREE.TorusGeometry(BOUNDARY_M, 0.32, 8, 180), new THREE.MeshBasicMaterial({ color: 0xffffff }));
  rope.rotation.x = Math.PI / 2; rope.position.y = 0.35; scene.add(rope);

  const boardCanvas = document.createElement('canvas'); boardCanvas.width = 1024; boardCanvas.height = 32;
  const b = boardCanvas.getContext('2d');
  if (b) for (let i = 0; i < 16; i++) { b.fillStyle = ['#2a3b55', '#3a2a4d', '#27483f', '#4d3a2a'][i % 4] ?? '#2a3b55'; b.fillRect(i * 64, 0, 64, 32); b.fillStyle = 'rgba(255,255,255,.18)'; b.fillRect(i * 64 + 4, 12, 56, 8); }
  const boardTexture = canvasTexture(boardCanvas); boardTexture.wrapS = THREE.RepeatWrapping; boardTexture.repeat.set(3, 1);
  const boards = new THREE.Mesh(new THREE.CylinderGeometry(BOUNDARY_M + 1.6, BOUNDARY_M + 1.6, 1.1, 160, 1, true), new THREE.MeshBasicMaterial({ map: boardTexture, side: THREE.DoubleSide }));
  boards.position.y = 0.55; scene.add(boards);

  // The ring is a stadium shape in the data, not a circle.
  const halfW = RING.halfWidth * KM, halfH = RING.halfHeight * KM, straight = halfH - halfW, ringY = (RING.centreY - FIELD_CENTRE.y) * KM;
  const ringPoints: THREE.Vector3[] = [];
  for (let i = 0; i <= 40; i++) { const a = (Math.PI * i) / 40; ringPoints.push(new THREE.Vector3(-halfW * Math.cos(a), 0.08, ringY - straight - halfW * Math.sin(a))); }
  for (let i = 0; i <= 40; i++) { const a = (Math.PI * i) / 40; ringPoints.push(new THREE.Vector3(halfW * Math.cos(a), 0.08, ringY + straight + halfW * Math.sin(a))); }
  const first = ringPoints[0]; if (first) ringPoints.push(first.clone());
  const ring = new THREE.Line(new THREE.BufferGeometry().setFromPoints(ringPoints), new THREE.LineDashedMaterial({ color: 0xffffff, dashSize: 1.5, gapSize: 1.4, transparent: true, opacity: 0.5 }));
  ring.computeLineDistances(); scene.add(ring);

  const [zoneU, zoneV] = toGround(ZONE_CENTRE.x, ZONE_CENTRE.y);
  for (let k = 0; k < 8; k++) {
    const a = (k * Math.PI) / 4;
    const pts = [new THREE.Vector3(zoneU, 0.07, zoneV), new THREE.Vector3(zoneU + BOUNDARY_M * 1.02 * Math.sin(a), 0.07, zoneV - BOUNDARY_M * 1.02 * Math.cos(a))];
    scene.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.13 })));
  }

  const pitch = new THREE.Mesh(new THREE.BoxGeometry(3.05, 0.06, PITCH_M), new THREE.MeshStandardMaterial({ color: 0xd8c48f, roughness: 1 }));
  pitch.position.y = 0.05; scene.add(pitch);
  for (const end of [-1, 1] as const) {
    for (const z of [end * (PITCH_M / 2 - 1.22), end * (PITCH_M / 2)]) {
      const crease = new THREE.Mesh(new THREE.BoxGeometry(3.6, 0.02, 0.08), new THREE.MeshBasicMaterial({ color: 0xffffff })); crease.position.set(0, 0.09, z); scene.add(crease);
    }
    for (const dx of [-0.11, 0, 0.11]) {
      const stump = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.71, 8), new THREE.MeshStandardMaterial({ color: 0xf4f4f4 })); stump.position.set(dx, 0.4, end * (PITCH_M / 2)); scene.add(stump);
    }
  }
  addBowl(scene);
}

/** Height of the far stand at a point on the ground, so a six can land in it. */
export function standHeight(u: number, v: number): number {
  const rho = Math.hypot(u, v), s = nearSideScale(Math.atan2(u, v));
  if (rho < BOUNDARY_M + 8) return 0.6;
  if (rho < 90) return 0.8 + ((rho - (BOUNDARY_M + 8)) / (90 - (BOUNDARY_M + 8))) * (11 * s - 0.8);
  if (rho < 93) return 11 * s + ((rho - 90) / 3) * 4 * s;
  if (rho < 118) return 15 * s + ((rho - 93) / 25) * 19 * s;
  return 34 * s;
}

/** The near side (behind the bowler) is lower so it never hides the ground. */
function nearSideScale(theta: number): number {
  const c = Math.cos(theta);
  return c > 0 ? 1 - 0.55 * Math.pow(c, 1.1) : 1;
}

function seatTexture(seed: number, colours: readonly string[]): THREE.CanvasTexture {
  const cv = document.createElement('canvas'); cv.width = 1024; cv.height = 256;
  const c = cv.getContext('2d'); const rand = seeded(seed);
  if (c) {
    c.fillStyle = '#262935'; c.fillRect(0, 0, 1024, 256);
    for (let i = 0; i < 9; i++) { c.fillStyle = colours[i % colours.length] ?? '#56B4E9'; c.globalAlpha = 0.3; c.fillRect(rand() * 1024, 0, 60 + rand() * 120, 256); }
    c.globalAlpha = 1;
    const shirts = ['#7d8190', '#a9743f', '#6a7d92', '#8f5a5a', '#c9c9c9', '#3d4a63', '#4f7d5c', '#d9d9d9'];
    const skin = ['#caa07a', '#8d6a4f', '#e6c19f', '#6b5240', '#d8b08c'];
    for (let y = 10; y < 256; y += 15) {
      c.fillStyle = 'rgba(0,0,0,.35)'; c.fillRect(0, y + 9, 1024, 2);
      for (let x = rand() * 7; x < 1024; x += 8.5) {
        if (rand() < 0.07) continue;
        c.fillStyle = skin[Math.floor(rand() * 5)] ?? '#caa07a'; c.beginPath(); c.arc(x, y + 3, 2.1, 0, 7); c.fill();
        c.fillStyle = shirts[Math.floor(rand() * 8)] ?? '#7d8190'; c.fillRect(x - 3, y + 5, 6, 5);
      }
    }
    for (let x = 0; x < 1024; x += 128) { c.fillStyle = 'rgba(10,12,18,.8)'; c.fillRect(x, 0, 6, 256); }
  }
  const t = canvasTexture(cv); t.wrapS = THREE.RepeatWrapping; t.anisotropy = 4;
  return t;
}

function ringBand(r0: number, y0: number, r1: number, y1: number, material: THREE.Material, repeat: number): THREE.Mesh {
  const segments = 180, positions: number[] = [], uvs: number[] = [], index: number[] = [];
  for (let i = 0; i <= segments; i++) {
    const th = (i / segments) * Math.PI * 2, s = nearSideScale(th), sn = Math.sin(th), cs = Math.cos(th);
    positions.push(r0 * sn, y0 * s, r0 * cs, r1 * sn, y1 * s, r1 * cs);
    uvs.push((i / segments) * repeat, 0, (i / segments) * repeat, 1);
    if (i < segments) { const a = i * 2; index.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(index); geo.computeVertexNormals();
  return new THREE.Mesh(geo, material);
}

function addBowl(scene: THREE.Scene): void {
  const lower = new THREE.MeshStandardMaterial({ map: seatTexture(4, ['#56B4E9', '#EBC862', '#c24a55']), side: THREE.DoubleSide, roughness: 1 });
  const upper = new THREE.MeshStandardMaterial({ map: seatTexture(9, ['#EBC862', '#56B4E9', '#4f7d5c']), side: THREE.DoubleSide, roughness: 1 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x2e313c, side: THREE.DoubleSide, roughness: 1 });
  const trim = new THREE.MeshBasicMaterial({ color: 0x8b94b4, side: THREE.DoubleSide });
  const inner = BOUNDARY_M + 8;
  scene.add(ringBand(inner, 0.8, 90, 11, lower, 7));
  scene.add(ringBand(90, 11, 90, 15, dark, 1));
  scene.add(ringBand(90, 15, 93, 15, dark, 1));
  scene.add(ringBand(93, 15, 118, 34, upper, 9));
  scene.add(ringBand(118, 0, 118, 34, dark, 1));
  scene.add(ringBand(118.2, 34, 118.2, 35.2, trim, 1));
  scene.add(ringBand(inner - 0.2, 0, inner - 0.2, 0.9, dark, 1));
  for (let k = 0; k < 6; k++) {
    const a = (k * Math.PI) / 3 + 0.52, x = 134 * Math.sin(a), z = 134 * Math.cos(a);
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 1.4, 70, 8), new THREE.MeshStandardMaterial({ color: 0x555b66 })); pole.position.set(x, 35, z); scene.add(pole);
    const head = new THREE.Mesh(new THREE.BoxGeometry(16, 8, 1.6), new THREE.MeshBasicMaterial({ color: 0xfdfdf0 })); head.position.set(x, 72, z); head.lookAt(0, 40, 0); scene.add(head);
  }
}
