import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { LineSegments2 } from 'three/examples/jsm/lines/LineSegments2.js';
import { LineSegmentsGeometry } from 'three/examples/jsm/lines/LineSegmentsGeometry.js';
import { LineMaterial } from 'three/examples/jsm/lines/LineMaterial.js';
import { BATTER, boundaryFraction, insideRing, ZONE_CENTRE, zoneName, zoneOf, type Hand } from '@/domain/wagon';
import { zoneTotals, type Shot } from '@/domain/shots';
import { addStadium, BOUNDARY_M, groundDecal, standHeight, toGround } from './stadium';
import { PHONE_QUERY } from '@/components/usePhone';

// The wagon wheel scene: a 3D ground with one line per scoring shot, drawn from the raw tracking coordinates.
// Ported from mockups/wagon-pitch-options. Many shots are drawn as two batched line objects, so a player with
// fifteen thousand shots stays smooth. Lines are straight because the data has only the start and the end of a shot.

export interface HoverInfo { shot: Shot; zone: number; fraction: number; ring: boolean; x: number; y: number }
interface Options { preset: PresetName; reducedMotion: boolean; onHover: (info: HoverInfo | null) => void }

const COLOURS = { run: new THREE.Color(0x9aa7b8), out: new THREE.Color(0xffffff) };
const ARC_SEGMENTS = 20;
/** How long one shot takes to travel from the batter to its end. */
const TRAVEL_SECONDS = 0.9;
const CHECKPOINTS = 200;
interface Pose { position: THREE.Vector3; target: THREE.Vector3 }
interface Preset { fov: number; broadcast: Pose; overhead: Pose }
const pose = (p: [number, number, number], t: [number, number, number]): Pose => ({ position: new THREE.Vector3(...p), target: new THREE.Vector3(...t) });

/** The wagon wheel shows the whole ground. */
export const PRESETS = {
  wagon: { fov: 27, broadcast: pose([0, 106, 172], [0, -5, -6]), overhead: pose([0.01, 322, 16], [0, 0, 0]) },
} as const satisfies Record<string, Preset>;
export type PresetName = keyof typeof PRESETS;
const BASE_ASPECT = 581 / 320;

const ease = (t: number): number => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);
const clamp = (v: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, v));
const lineWidth = (n: number): number => (n <= 100 ? 3 : n <= 500 ? 2 : n <= 3000 ? 1.4 : 1);

export type View = 'broadcast' | 'over';

export class WagonScene {
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(27, BASE_ASPECT, 0.5, 900);
  private readonly controls: OrbitControls;
  private readonly shotsGroup = new THREE.Group();
  private readonly zoneGroup = new THREE.Group();
  private readonly nameGroup = new THREE.Group();
  private readonly hoverRing = new THREE.Mesh(new THREE.RingGeometry(1.1, 1.5, 28), new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide, transparent: true, depthTest: false }));
  private readonly resizeObserver: ResizeObserver;
  private readonly visibility: IntersectionObserver;
  private readonly materials: LineMaterial[] = [];
  private readonly polar0: number;
  private readonly preset: Preset;

  private shots: Shot[] = [];
  private hand: Hand | 'N' = 'R';
  private plain: LineSegments2 | null = null;
  private sixes: LineSegments2 | null = null;
  private fours: THREE.InstancedMesh | null = null;
  private rings: THREE.InstancedMesh | null = null;
  private runDots: THREE.InstancedMesh | null = null;
  private outDiscs: THREE.InstancedMesh | null = null;
  /** Segments of every arc (sixes and catches), which the draw-on shows together because each segment hides itself until its shot is reached. */
  private arcSegments = 0;
  private prefix = { plain: new Int32Array(1), four: new Int32Array(1), six: new Int32Array(1), run: new Int32Array(1), out: new Int32Array(1) };
  private ends: Array<[number, number]> = [];
  private grid = new Map<number, number[]>();
  private checkpoints: ReturnType<typeof zoneTotals>[] = [];
  private zoneMax = 1;
  private wedges: THREE.Mesh[] = [];
  private cards: Array<{ draw: (value: number) => void; last: number }> = [];
  private t0 = performance.now();
  private raf = 0;
  private visible = true;
  private overlay = 0;
  private overlayTarget = 0;
  private tween: { t0: number; fromP: THREE.Vector3; fromT: THREE.Vector3; to: Pose } | null = null;
  private drawn = 0;
  private lastCheckpoint = -1;
  /** False until the tile is on screen: the shots are loaded and kept ready, and nothing is drawn yet. */
  private revealed = false;
  /** How many shots of the draw-on a line takes to grow from the batter to its end. */
  private growWindow = 40;
  /** The whole draw-on, from the first line leaving the batter to the last one arriving. */
  private drawSeconds = 2;
  /** Replay mode (the Match page): every shot of the innings is built once, and `setPlayhead` says how many have happened. */
  private live = false;
  private liveCount = 0;
  private liveT0 = 0;
  private liveTravel = 900;

  private shotColours = { four: new THREE.Color(0xebc862), six: new THREE.Color(0x56b4e9) };

  constructor(private readonly host: HTMLElement, private readonly options: Options) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    // On a phone the browser pans the canvas both ways, so a sideways swipe on the stage moves the tile row.
    this.renderer.domElement.style.cssText = `display:block;width:100%;height:100%;touch-action:${window.matchMedia(PHONE_QUERY).matches ? 'pan-x pan-y' : 'pan-y'}`;
    host.appendChild(this.renderer.domElement);
    addStadium(this.scene);
    this.scene.add(this.shotsGroup, this.zoneGroup, this.nameGroup, this.hoverRing);
    this.hoverRing.rotation.x = -Math.PI / 2; this.hoverRing.visible = false; this.hoverRing.renderOrder = 10;

    this.preset = PRESETS[options.preset];
    this.camera.fov = this.preset.fov;
    this.camera.position.copy(this.preset.broadcast.position);
    this.polar0 = Math.atan2(Math.hypot(this.preset.broadcast.position.x - this.preset.broadcast.target.x, this.preset.broadcast.position.z - this.preset.broadcast.target.z), this.preset.broadcast.position.y - this.preset.broadcast.target.y);
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true; this.controls.enableZoom = false; this.controls.enablePan = false;
    // On a phone a finger dragging sideways on the stage swipes to the next tile (Ari, 2026-10-26), so one finger no longer rotates the view; the view buttons still change it.
    // OrbitControls sets touch-action to none on its element, so the phone's setting comes after it.
    if (window.matchMedia(PHONE_QUERY).matches) { this.controls.touches.ONE = -1 as unknown as THREE.TOUCH; this.renderer.domElement.style.touchAction = 'pan-x pan-y'; }
    this.controls.target.copy(this.preset.broadcast.target);
    this.limits('broadcast');
    this.controls.update();

    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(host);
    this.visibility = new IntersectionObserver((entries) => { this.visible = entries.some((e) => e.isIntersecting); });
    this.visibility.observe(host);
    this.renderer.domElement.addEventListener('pointermove', this.onPointerMove);
    this.renderer.domElement.addEventListener('pointerleave', this.onPointerLeave);
    this.resize();
    this.raf = requestAnimationFrame(this.frame);
  }

  /** Fours and sixes take the team colours. Call before setShots, which draws with them. */
  setColours(four: string, six: string): void { this.shotColours = { four: new THREE.Color(four), six: new THREE.Color(six) }; }

  /** `hand` N is a mix of right and left-handers: the ground is the same, and the zones are numbered and not named for off and leg. */
  setShots(shots: readonly Shot[], hand: Hand | 'N'): void {
    this.shots = [...shots];
    this.hand = hand;
    this.build();
    this.hide();
  }

  /**
   * Replay: builds every shot of the innings and draws none until `setPlayhead` is called. The newest shot grows out of the batter over `travelMs`, the earlier ones stay as they are, and a jump
   * (the scrubber) shows its shots at once.
   */
  setLive(shots: readonly Shot[], hand: Hand | 'N'): void {
    this.live = true;
    this.shots = [...shots];
    this.hand = hand;
    this.liveCount = 0;
    this.liveT0 = performance.now() - 1e9;
    this.build();
    this.revealed = true;
  }

  setPlayhead(count: number, travelMs: number): void {
    if (count === this.liveCount) return;
    const next = count === this.liveCount + 1;
    this.liveCount = Math.max(0, Math.min(this.shots.length, count));
    this.liveTravel = travelMs;
    this.liveT0 = next ? performance.now() : performance.now() - 1e9;
  }

  /** Keeps the shots ready and draws none of them until `replay` is called. */
  hide(): void { this.revealed = false; this.lastCheckpoint = -1; }
  /** Starts the draw-on. Called when the tile comes into view and by the Replay button. */
  replay(): void { this.revealed = true; this.t0 = performance.now(); this.lastCheckpoint = -1; }
  /** Shows every shot at once, for a state that was already drawn on before. */
  settle(): void { this.revealed = true; this.t0 = performance.now() - 1e6; this.lastCheckpoint = -1; }

  setView(view: View): void {
    this.limits('tween');
    const to = view === 'over' ? this.preset.overhead : this.preset.broadcast;
    this.tween = { t0: performance.now(), fromP: this.camera.position.clone(), fromT: this.controls.target.clone(), to };
    this.finalView = view;
  }
  private finalView: View = 'broadcast';

  /** Shows the eight zones as wedges with their running totals. */
  setTotals(on: boolean): void { this.overlayTarget = on ? 1 : 0; }

  dispose(): void {
    cancelAnimationFrame(this.raf);
    this.resizeObserver.disconnect(); this.visibility.disconnect();
    this.renderer.domElement.removeEventListener('pointermove', this.onPointerMove);
    this.renderer.domElement.removeEventListener('pointerleave', this.onPointerLeave);
    this.controls.dispose();
    this.scene.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (mesh.geometry) mesh.geometry.dispose();
      const mat = mesh.material as THREE.Material | THREE.Material[] | undefined;
      for (const m of Array.isArray(mat) ? mat : mat ? [mat] : []) { (m as THREE.MeshBasicMaterial).map?.dispose(); m.dispose(); }
    });
    this.renderer.dispose();
    // Frees the WebGL context now, so a scene made later does not pile up contexts (browsers keep about 16).
    this.renderer.forceContextLoss();
    this.renderer.domElement.remove();
  }

  private limits(mode: 'broadcast' | 'tween'): void {
    const c = this.controls;
    if (mode === 'tween') { c.minPolarAngle = 0; c.maxPolarAngle = 1.5; c.minAzimuthAngle = -Infinity; c.maxAzimuthAngle = Infinity; return; }
    c.minPolarAngle = 0.05; c.maxPolarAngle = this.polar0 + 0.16; c.minAzimuthAngle = -1.05; c.maxAzimuthAngle = 1.05;
  }

  private resize(): void {
    const w = this.host.clientWidth, h = this.host.clientHeight;
    if (!w || !h) return;
    const size = this.renderer.getSize(new THREE.Vector2());
    if (size.x === w && size.y === h) return;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    // Narrower than the design shape: widen the view so the whole ground still fits across.
    this.camera.fov = (2 * Math.atan(Math.tan((this.preset.fov * Math.PI) / 360) * Math.max(1, BASE_ASPECT / this.camera.aspect)) * 180) / Math.PI;
    this.camera.updateProjectionMatrix();
    for (const m of this.materials) m.resolution.set(w, h);
    // Resizing clears a WebGL canvas, and the next frame can be a while off (or skipped while the tile is off screen), which showed as a black box mid scroll.
    this.renderer.render(this.scene, this.camera);
  }

  /** Keeps the whole ground in frame while the viewer tilts: the camera pulls back as it looks down. */
  private fit(): void {
    const offset = this.camera.position.clone().sub(this.controls.target);
    const dist = offset.length();
    const polar = Math.acos(clamp(offset.y / dist, -1, 1));
    const k = clamp((polar - 0.1) / Math.max(0.1, this.polar0 - 0.1), 0, 1);
    const broadcastDist = this.preset.broadcast.position.distanceTo(this.preset.broadcast.target);
    const overheadDist = this.preset.overhead.position.distanceTo(this.preset.overhead.target);
    const want = overheadDist + (broadcastDist - overheadDist) * ease(k);
    if (Math.abs(want - dist) > 0.05) { offset.setLength(dist + (want - dist) * 0.25); this.camera.position.copy(this.controls.target).add(offset); }
  }

  private clearGroup(group: THREE.Group): void {
    for (const child of [...group.children]) {
      group.remove(child);
      const mesh = child as THREE.Mesh;
      mesh.geometry?.dispose();
      const mat = mesh.material as THREE.Material | undefined;
      (mat as THREE.MeshBasicMaterial | undefined)?.map?.dispose();
      mat?.dispose();
    }
  }

  private build(): void {
    this.clearGroup(this.shotsGroup); this.clearGroup(this.zoneGroup); this.clearGroup(this.nameGroup);
    this.materials.length = 0; this.wedges = []; this.cards = [];
    const n = this.shots.length;
    const [batterU, batterV] = toGround(BATTER.x, BATTER.y);
    const plainPos: number[] = [], plainCol: number[] = [], sixPos: number[] = [], sixCol: number[] = [], plainGrow: number[] = [], sixGrow: number[] = [];
    const fourAt: Array<[number, number]> = [], sixAt: Array<[number, number, number]> = [], runAt: Array<[number, number]> = [], outAt: Array<[number, number]> = [];
    const prefixPlain = new Int32Array(n + 1), prefixFour = new Int32Array(n + 1), prefixSix = new Int32Array(n + 1), prefixRun = new Int32Array(n + 1), prefixOut = new Int32Array(n + 1);
    this.ends = [];
    this.grid = new Map();
    this.shots.forEach((s, i) => {
      const [u, v] = toGround(s.x, s.y);
      this.ends.push([u, v]);
      const cell = this.cellOf(u, v);
      const bucket = this.grid.get(cell); if (bucket) bucket.push(i); else this.grid.set(cell, [i]);
      let plainCount = prefixPlain[i] ?? 0, fourCount = prefixFour[i] ?? 0, sixCount = prefixSix[i] ?? 0, runCount = prefixRun[i] ?? 0, outCount = prefixOut[i] ?? 0;
      if ((s.runs >= 6 && !s.out) || (s.out && s.caught)) {
        const f = boundaryFraction(s.x, s.y);
        // A catch comes down at the fielder's hands, so it lands at ground level (a six lands in the stands) and flies lower, scaled by how far it went.
        const catchOut = s.out && s.caught;
        const landing = catchOut ? 0.5 : standHeight(u, v), peak = catchOut ? 3 + Math.min(1, f) * 6 : 9 + Math.max(0, f - 1) * 28;
        for (let k = 0; k < ARC_SEGMENTS; k++) {
          const a = k / ARC_SEGMENTS, b = (k + 1) / ARC_SEGMENTS;
          const at = (t: number): number[] => [batterU + (u - batterU) * t, 0.5 + peak * 4 * t * (1 - t) + (landing - 0.5) * t, batterV + (v - batterV) * t];
          sixGrow.push(i, k);
          const c = catchOut ? COLOURS.out : this.shotColours.six;
          sixPos.push(...at(a), ...at(b)); sixCol.push(c.r, c.g, c.b, c.r, c.g, c.b);
        }
        if (catchOut) { outAt.push([u, v]); outCount++; } else { sixAt.push([u, landing + 0.7, v]); sixCount++; }
      } else {
        const colour = s.out ? COLOURS.out : s.runs === 4 ? this.shotColours.four : COLOURS.run;
        plainGrow.push(i, 0);
        plainPos.push(batterU, 0.3, batterV, u, 0.3, v); plainCol.push(colour.r, colour.g, colour.b, colour.r, colour.g, colour.b);
        if (s.out) { outAt.push([u, v]); outCount++; }
        else if (s.runs === 4) { fourAt.push([u, v]); fourCount++; }
        else { runAt.push([u, v]); runCount++; }
        plainCount++;
      }
      prefixPlain[i + 1] = plainCount; prefixFour[i + 1] = fourCount; prefixSix[i + 1] = sixCount; prefixRun[i + 1] = runCount; prefixOut[i + 1] = outCount;
    });
    this.arcSegments = sixGrow.length / 2;
    this.prefix = { plain: prefixPlain, four: prefixFour, six: prefixSix, run: prefixRun, out: prefixOut };

    const width = lineWidth(n), opacity = n <= 500 ? 0.95 : n <= 3000 ? 0.6 : 0.28;
    // Each line grows out of the batter to its end as the draw-on passes it (a six climbs its arc), so the shots shoot out from the middle of the pitch. `instanceGrow`
    // holds the shot's number and, for an arc, the segment's number. A shot's line takes `growWindow` shots of the draw-on to reach its end.
    // Every line takes the same time to travel from the batter (TRAVEL_SECONDS). The lines start one after another over a spread that grows with the number of shots, so
    // a handful of fours or sixes leave the middle one by one and take their time, and thousands of shots still fill the ground in a few seconds.
    const spread = clamp(0.6 + n * 0.0006, 0.6, 2.5);
    this.growWindow = (n * TRAVEL_SECONDS) / spread;
    this.drawSeconds = spread + TRAVEL_SECONDS;
    // Replay: a shot takes one step of the playhead to grow.
    if (this.live) { this.growWindow = 1; this.drawSeconds = 1; }
    const make = (pos: number[], col: number[], w: number, o: number, grow: number[], arc: number): LineSegments2 | null => {
      if (pos.length === 0) return null;
      const geometry = new LineSegmentsGeometry(); geometry.setPositions(pos); geometry.setColors(col);
      geometry.setAttribute('instanceGrow', new THREE.InstancedBufferAttribute(new Float32Array(grow), 2));
      const material = new LineMaterial({ vertexColors: true, linewidth: w, transparent: true, opacity: o, depthWrite: false });
      material.uniforms.uShots = { value: 0 }; material.uniforms.uWindow = { value: this.growWindow }; material.uniforms.uArc = { value: arc };
      material.vertexShader = material.vertexShader
        .replace('attribute vec3 instanceEnd;', 'attribute vec3 instanceEnd;\n\t\tattribute vec2 instanceGrow;\n\t\tuniform float uShots;\n\t\tuniform float uWindow;\n\t\tuniform float uArc;')
        .replace('vec4 start = modelViewMatrix * vec4( instanceStart, 1.0 );', 'float grown = clamp( ( ( uShots - instanceGrow.x ) / uWindow ) * uArc - instanceGrow.y, 0.0, 1.0 );\n\t\t\tif ( grown <= 0.0 ) { gl_Position = vec4( 0.0, 0.0, 2.0, 1.0 ); return; }\n\t\t\tvec4 start = modelViewMatrix * vec4( instanceStart, 1.0 );')
        .replace('vec4 end = modelViewMatrix * vec4( instanceEnd, 1.0 );', 'vec4 end = modelViewMatrix * vec4( instanceStart + ( instanceEnd - instanceStart ) * grown, 1.0 );');
      material.needsUpdate = true;
      material.resolution.set(this.host.clientWidth || 1, this.host.clientHeight || 1);
      this.materials.push(material);
      const lines = new LineSegments2(geometry, material); lines.frustumCulled = false;
      lines.userData.baseOpacity = o;
      this.shotsGroup.add(lines);
      return lines;
    };
    this.plain = make(plainPos, plainCol, width, opacity, plainGrow, 1);
    this.sixes = make(sixPos, sixCol, Math.max(width, 1.4), Math.min(1, opacity + 0.12), sixGrow, ARC_SEGMENTS);

    const size = n <= 500 ? 1.7 : 1.1;
    this.fours = fourAt.length ? this.markers(new THREE.BoxGeometry(size, size, size), this.shotColours.four, fourAt.map(([u, v]) => [u, 0.5, v])) : null;
    this.runDots = runAt.length ? this.markers(new THREE.SphereGeometry(size * 0.38, 8, 8), COLOURS.run, runAt.map(([u, v]) => [u, 0.45, v])) : null;
    this.outDiscs = outAt.length ? this.markers(new THREE.CircleGeometry(size * 0.95, 20).rotateX(-Math.PI / 2), COLOURS.out, outAt.map(([u, v]) => [u, 0.5, v])) : null;
    this.rings = sixAt.length ? this.markers(new THREE.TorusGeometry(size, size * 0.2, 6, 20).rotateX(Math.PI / 2), this.shotColours.six, sixAt) : null;

    const names = this.nameGroup;
    const [zoneU, zoneV] = toGround(ZONE_CENTRE.x, ZONE_CENTRE.y);
    for (let z = 1; z <= 8; z++) {
      const a = (z - 0.5) * Math.PI / 4, r = BOUNDARY_M * 0.66;
      if (this.hand !== 'N') names.add(groundDecal(zoneName(z, this.hand), 30, 7.5, zoneU + r * Math.sin(a), zoneV - r * Math.cos(a), 'rgba(255,255,255,.55)'));
    }
    this.buildZones();
    this.drawn = 0;
  }

  private markers(geometry: THREE.BufferGeometry, colour: THREE.Color, at: ReadonlyArray<readonly number[]>): THREE.InstancedMesh {
    const mesh = new THREE.InstancedMesh(geometry, new THREE.MeshBasicMaterial({ color: colour, transparent: true }), at.length);
    const m = new THREE.Matrix4();
    at.forEach((p, i) => { m.setPosition(p[0] ?? 0, p[1] ?? 0, p[2] ?? 0); mesh.setMatrixAt(i, m); });
    mesh.instanceMatrix.needsUpdate = true; mesh.count = 0; mesh.frustumCulled = false;
    this.shotsGroup.add(mesh);
    return mesh;
  }

  private buildZones(): void {
    const n = this.shots.length;
    this.checkpoints = Array.from({ length: CHECKPOINTS + 1 }, (_, i) => zoneTotals(this.shots, Math.floor((n * i) / CHECKPOINTS)));
    const final = this.checkpoints[CHECKPOINTS] ?? [];
    this.zoneMax = Math.max(1, ...final.map((z) => z.runs));
    const [zoneU, zoneV] = toGround(ZONE_CENTRE.x, ZONE_CENTRE.y);
    for (let k = 1; k <= 8; k++) {
      const wedge = new THREE.Mesh(wedgeGeometry(k, zoneU, zoneV), new THREE.MeshBasicMaterial({ color: 0x2c4a3a, transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false }));
      wedge.rotation.x = -Math.PI / 2; wedge.position.y = 0.05;
      this.zoneGroup.add(wedge); this.wedges.push(wedge);
      const card = zoneCard(this.hand === 'N' ? `Zone ${k}` : zoneName(k, this.hand), () => 'runs');
      const a = (k - 0.5) * Math.PI / 4, r = BOUNDARY_M * 0.6;
      card.mesh.position.set(zoneU + r * Math.sin(a), 0.12, zoneV - r * Math.cos(a));
      this.zoneGroup.add(card.mesh); this.cards.push({ draw: card.draw, last: -1 });
    }
  }

  private cellOf(u: number, v: number): number { return (Math.floor(u / 3) + 60) * 200 + Math.floor(v / 3) + 60; }

  private onPointerMove = (event: PointerEvent): void => {
    if (this.shots.length === 0) return;
    const rect = this.renderer.domElement.getBoundingClientRect();
    const ndc = new THREE.Vector2(((event.clientX - rect.left) / rect.width) * 2 - 1, -((event.clientY - rect.top) / rect.height) * 2 + 1);
    const ray = new THREE.Raycaster(); ray.setFromCamera(ndc, this.camera);
    const { origin, direction } = ray.ray;
    const t = -origin.y / direction.y;
    if (!Number.isFinite(t) || t < 0) return this.onPointerLeave();
    const u = origin.x + direction.x * t, v = origin.z + direction.z * t;
    const reach = clamp((this.camera.position.distanceTo(this.controls.target) / 172) * 2.6, 1.4, 7);
    let best = -1, bestD = reach;
    const cu = Math.floor(u / 3), cv = Math.floor(v / 3);
    for (let du = -2; du <= 2; du++) for (let dv = -2; dv <= 2; dv++) {
      for (const i of this.grid.get((cu + du + 60) * 200 + cv + dv + 60) ?? []) {
        if (i >= this.drawn) continue;
        const end = this.ends[i]; if (!end) continue;
        const d = Math.hypot(end[0] - u, end[1] - v);
        if (d < bestD) { bestD = d; best = i; }
      }
    }
    const shot = this.shots[best];
    const end = this.ends[best];
    if (!shot || !end) return this.onPointerLeave();
    this.hoverRing.position.set(end[0], 0.4, end[1]); this.hoverRing.visible = true;
    this.options.onHover({ shot, zone: zoneOf(shot.x, shot.y), fraction: boundaryFraction(shot.x, shot.y), ring: insideRing(shot.x, shot.y), x: event.clientX, y: event.clientY });
  };

  private onPointerLeave = (): void => { this.hoverRing.visible = false; this.options.onHover(null); };

  private frame = (now: number): void => {
    this.raf = requestAnimationFrame(this.frame);
    // A view that is kept in the page but not shown is only hidden (.held), so its scenes must not keep drawing.
    if (!this.visible || this.host.closest('.held')) return;
    const n = this.shots.length;
    let p: number, front: number, cut: number;
    if (this.live) {
      const travel = this.options.reducedMotion ? 0 : this.liveTravel;
      const k = this.liveCount;
      p = travel === 0 ? 1 : clamp((now - this.liveT0) / travel, 0, 1);
      front = k === 0 ? -1 : k - 1 + p;
      cut = p >= 1 ? k : Math.max(0, k - 1);
    } else {
      const duration = this.options.reducedMotion ? 0 : this.drawSeconds * 1000;
      // Linear in time, so every line really does take TRAVEL_SECONDS to grow.
      p = !this.revealed ? 0 : duration === 0 ? 1 : clamp((now - this.t0) / duration, 0, 1);
      // The draw-on runs over the shots plus one window, so the last line has grown to its end when p reaches 1. A marker (a four, a six ring, a wicket) appears when its line is done.
      front = p * (n + this.growWindow);
      cut = Math.min(n, Math.max(0, Math.floor(front - this.growWindow)));
    }
    for (const lines of [this.plain, this.sixes]) if (lines) (lines.material as LineMaterial).uniforms.uShots!.value = front;
    this.drawn = cut;
    if (this.plain) this.plain.geometry.instanceCount = this.prefix.plain[n] ?? 0;
    if (this.sixes) this.sixes.geometry.instanceCount = this.arcSegments;
    if (this.fours) this.fours.count = this.prefix.four[cut] ?? 0;
    if (this.rings) this.rings.count = this.prefix.six[cut] ?? 0;
    if (this.runDots) this.runDots.count = this.prefix.run[cut] ?? 0;
    if (this.outDiscs) this.outDiscs.count = this.prefix.out[cut] ?? 0;

    if (!this.live) {
      const cp = Math.min(CHECKPOINTS, Math.floor(p * CHECKPOINTS));
      if (cp !== this.lastCheckpoint) { this.lastCheckpoint = cp; this.paintZones(cp); }
    }

    if (this.tween) {
      const k = ease(clamp((now - this.tween.t0) / 1000, 0, 1));
      this.camera.position.lerpVectors(this.tween.fromP, this.tween.to.position, k);
      this.controls.target.lerpVectors(this.tween.fromT, this.tween.to.target, k);
      if (k >= 1) { this.tween = null; if (this.finalView === 'broadcast') this.limits('broadcast'); }
    } else this.fit();
    this.overlay += (this.overlayTarget - this.overlay) * 0.12;
    if (Math.abs(this.overlayTarget - this.overlay) < 0.003) this.overlay = this.overlayTarget;
    this.applyOverlay();
    this.controls.update();
    this.renderer.render(this.scene, this.camera);
  };

  private paintZones(checkpoint: number): void {
    const totals = this.checkpoints[checkpoint];
    if (!totals) return;
    for (let k = 1; k <= 8; k++) {
      const runs = totals[k]?.runs ?? 0;
      const card = this.cards[k - 1], wedge = this.wedges[k - 1];
      if (card && card.last !== runs) { card.last = runs; card.draw(runs); }
      if (wedge) (wedge.material as THREE.MeshBasicMaterial).color.setRGB(...ramp(Math.pow(runs / this.zoneMax, 0.8)));
    }
  }

  private applyOverlay(): void {
    const o = this.overlay;
    for (const lines of [this.plain, this.sixes]) if (lines) (lines.material as LineMaterial).opacity = (lines.userData.baseOpacity as number) * (1 - 0.7 * o);
    for (const m of [this.fours, this.rings, this.runDots, this.outDiscs]) if (m) (m.material as THREE.MeshBasicMaterial).opacity = 1 - 0.5 * o;
    for (const wedge of this.wedges) (wedge.material as THREE.MeshBasicMaterial).opacity = 0.8 * o;
    for (const child of this.zoneGroup.children) if (!(this.wedges as THREE.Object3D[]).includes(child)) ((child as THREE.Mesh).material as THREE.MeshBasicMaterial).opacity = o;
    for (const child of this.nameGroup.children) ((child as THREE.Mesh).material as THREE.MeshBasicMaterial).opacity = 1 - o;
  }
}

/** Dark green to gold, by share of the busiest zone. */
function ramp(t: number): [number, number, number] {
  const a = [44, 74, 58], b = [235, 200, 98];
  return [0, 1, 2].map((i) => ((a[i] ?? 0) + ((b[i] ?? 0) - (a[i] ?? 0)) * clamp(t, 0, 1)) / 255) as [number, number, number];
}

function wedgeGeometry(zone: number, zoneU: number, zoneV: number): THREE.ShapeGeometry {
  const a0 = ((zone - 1) * Math.PI) / 4, a1 = (zone * Math.PI) / 4;
  const points = [new THREE.Vector2(zoneU, -zoneV)];
  for (let i = 0; i <= 12; i++) {
    const a = a0 + ((a1 - a0) * i) / 12, dx = Math.sin(a), dz = -Math.cos(a);
    const b = zoneU * dx + zoneV * dz, c = zoneU * zoneU + zoneV * zoneV - (BOUNDARY_M - 0.6) ** 2;
    const t = -b + Math.sqrt(b * b - c);
    points.push(new THREE.Vector2(zoneU + t * dx, -(zoneV + t * dz)));
  }
  return new THREE.ShapeGeometry(new THREE.Shape(points));
}

function zoneCard(name: string, unit: (value: number) => string): { mesh: THREE.Mesh; draw: (value: number) => void } {
  const cv = document.createElement('canvas'); cv.width = 512; cv.height = 256;
  const c = cv.getContext('2d');
  const texture = new THREE.CanvasTexture(cv); texture.colorSpace = THREE.SRGBColorSpace;
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(46, 23), new THREE.MeshBasicMaterial({ map: texture, transparent: true, opacity: 0, depthWrite: false, depthTest: false }));
  mesh.rotation.x = -Math.PI / 2; mesh.renderOrder = 30;
  const draw = (value: number): void => {
    if (!c) return;
    c.clearRect(0, 0, 512, 256); c.textAlign = 'center'; c.lineJoin = 'round';
    const text = (s: string, y: number, font: string): void => { c.font = font; c.lineWidth = 10; c.strokeStyle = 'rgba(0,0,0,.55)'; c.strokeText(s, 256, y); c.fillStyle = '#fff'; c.fillText(s, 256, y); };
    text(name, 40, '600 44px Outfit, system-ui, sans-serif'); text(String(value), 178, '700 112px Outfit, system-ui, sans-serif'); text(unit(value), 240, '400 40px Outfit, system-ui, sans-serif');
    texture.needsUpdate = true;
  };
  draw(0);
  return { mesh, draw };
}
