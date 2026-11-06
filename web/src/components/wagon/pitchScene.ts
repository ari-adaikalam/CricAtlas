import * as THREE from 'three';
import { LineSegments2 } from 'three/examples/jsm/lines/LineSegments2.js';
import { LineSegmentsGeometry } from 'three/examples/jsm/lines/LineSegmentsGeometry.js';
import { LineMaterial } from 'three/examples/jsm/lines/LineMaterial.js';
import { BANDS, LANES, batchPlan, type Cell } from '@/domain/pitch';
import { PHONE_QUERY } from '@/components/usePhone';

// The pitch map scene: balls leave the bowler's hand, bounce in their length band and run on to the stumps (side-on view),
// then the camera swings over the pitch to show a cell for every length and line (overhead view).
// The paths are illustrative. The data has the band, not the bounce point, so each bounce is placed inside its band.

export type PitchView = 'side' | 'over';
export interface CellHover { cell: Cell | null; band: number; x: number; y: number }
interface Options {
  reducedMotion: boolean;
  onHover: (info: CellHover | null) => void;
  onView: (view: PitchView) => void;
  /** The redesigned map (Ari, 2026-10-24): bigger, darker numbers and brighter labels, balls drawn in batches whose size follows the number of balls, an overhead view that stops a little past the Short band, and a ground that
   * reaches the bottom of the side view. Off for the maps that have not been moved to it yet. */
  refined?: boolean;
}

const PL = 20.12;
const LS = 3.3;
const PW = 3.05 * LS;
const WL = PW / 5;
const VX = 1.8;
const QUARTER = Math.PI / 2;
/** Where the refined overhead view ends: a little past the Short band, in metres from the batter's stumps. */
const OVER_END = 14.6;
const COLOURS = { wicket: 0xffffff, six: 0x56b4e9, four: 0xebc862, run: 0x9aa7b8, dot: 0x6f7b8d } as const;
type Outcome = keyof typeof COLOURS;
// Height above the base of the stumps where a ball arrives, by band: full toss, yorker, full, good, short of good, short.
const REACH = [0.55, 0.13, 0.46, 0.8, 1.15, 1.75];
const ARC_POINTS = 40;
const MAX_ARCS = 420;

const clamp = (v: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, v));
const ease = (t: number): number => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);

/** A small seeded generator, so the illustrative paths are the same on every visit. */
function seeded(seed: number): () => number {
  let a = seed | 0;
  return () => { a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

function label(text: string, w: number, h: number, colour: string, weight = 500, start = 54, outline = false): THREE.Sprite {
  const cv = document.createElement('canvas'); cv.width = 320; cv.height = Math.round((320 * h) / w);
  const c = cv.getContext('2d');
  if (c) {
    let px = Math.min(start, cv.height * 0.85);
    c.font = `${weight} ${px}px Outfit, system-ui, sans-serif`;
    while (c.measureText(text).width > cv.width - 16 && px > 14) { px -= 2; c.font = `${weight} ${px}px Outfit, system-ui, sans-serif`; }
    c.textAlign = 'center'; c.textBaseline = 'middle';
    // A dark edge keeps white numbers readable on the pale pitch and on the light cells.
    if (outline) { c.lineJoin = 'round'; c.lineWidth = Math.max(4, px * 0.18); c.strokeStyle = 'rgba(8,14,22,.85)'; c.strokeText(text, cv.width / 2, cv.height / 2); }
    c.fillStyle = colour; c.fillText(text, cv.width / 2, cv.height / 2);
  }
  const texture = new THREE.CanvasTexture(cv); texture.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, transparent: true, depthTest: false }));
  sprite.scale.set(w, h, 1);
  return sprite;
}

type Dots = { mesh: THREE.InstancedMesh | null; data: number[]; owner: number[] };

export class PitchScene {
  private palette: Record<Outcome, number> = { ...COLOURS };
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.OrthographicCamera(-10, 10, 10, -10, -200, 400);
  private readonly resizeObserver: ResizeObserver;
  private readonly visibility: IntersectionObserver;
  private readonly content = new THREE.Group();
  private readonly materials: LineMaterial[] = [];

  private cells: Cell[] = [];
  private plates: Array<{ mesh: THREE.Mesh; cell: Cell; alpha: number; x: number; z: number; depth: number }> = [];
  private counts: THREE.Sprite[] = [];
  private sideLabels: Array<THREE.Sprite | THREE.Mesh> = [];
  private planLabels: THREE.Sprite[] = [];
  private blocks: THREE.Mesh[] = [];
  private filled: Dots = { mesh: null, data: [], owner: [] };
  private hollow: Dots = { mesh: null, data: [], owner: [] };
  private paths: LineSegments2 | null = null;
  private segments = 0;
  /** How long the paths take to draw, which follows the number of batches on the refined map. */
  private drawSeconds = 3.2;
  private theta = 0;
  private mode: 'auto' | 'manual' = 'auto';
  private tween: { t0: number; from: number; to: number } | null = null;
  private t0 = performance.now();
  private raf = 0;
  private visible = true;
  private highlightBand = -1;
  private hoveredCell = -1;
  private shownCell = -2;
  private lastView: PitchView = 'side';
  /** A tall, narrow panel (the Replay): the labels sit closer to the pitch, so the pitch can be drawn larger and is still in the middle. */
  private narrow = false;
  /** False until the tile is on screen: the cells are built and kept ready, and nothing plays yet. */
  private revealed = false;

  constructor(private readonly host: HTMLElement, private readonly options: Options) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    // On a phone the browser pans the canvas both ways, so a sideways swipe on the pitch moves the tile row.
    this.renderer.domElement.style.cssText = `display:block;width:100%;height:100%;touch-action:${window.matchMedia(PHONE_QUERY).matches ? 'pan-x pan-y' : 'pan-y'}`;
    host.appendChild(this.renderer.domElement);
    this.scene.background = new THREE.Color(0x101214);
    this.scene.add(this.content);
    this.addPitch();
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(host);
    this.visibility = new IntersectionObserver((entries) => { this.visible = entries.some((e) => e.isIntersecting); });
    this.visibility.observe(host);
    this.renderer.domElement.addEventListener('pointermove', this.onMove);
    this.renderer.domElement.addEventListener('pointerleave', this.onLeave);
    this.resize();
    this.raf = requestAnimationFrame(this.frame);
  }

  /** Lines are as the batter sees them, so the map is always drawn for a right-hander, off side on the left. */
  /** Fours and sixes take the team colours. Call before setCells, which draws with them. */
  setColours(four: string, six: string): void { this.palette = { ...this.palette, four: parseInt(four.slice(1), 16), six: parseInt(six.slice(1), 16) }; }

  setCells(cells: readonly Cell[]): void {
    this.cells = [...cells];
    this.build();
    this.hide();
  }

  hide(): void { this.revealed = false; this.mode = 'auto'; this.tween = null; this.theta = 0; }
  replay(): void { this.revealed = true; this.t0 = performance.now(); this.mode = 'auto'; this.tween = null; this.theta = 0; }
  /** Shows the finished map at once, for a state that was already drawn on before. */
  settle(): void { this.revealed = true; this.t0 = performance.now() - 1e6; this.mode = 'auto'; this.tween = null; this.theta = 0; }
  setView(view: PitchView): void { this.mode = 'manual'; this.tween = { t0: performance.now(), from: this.theta, to: view === 'over' ? QUARTER : 0 }; }
  highlight(band: number): void { this.highlightBand = band; }

  dispose(): void {
    cancelAnimationFrame(this.raf);
    this.resizeObserver.disconnect(); this.visibility.disconnect();
    this.renderer.domElement.removeEventListener('pointermove', this.onMove);
    this.renderer.domElement.removeEventListener('pointerleave', this.onLeave);
    this.scene.traverse((o) => {
      const mesh = o as THREE.Mesh;
      mesh.geometry?.dispose();
      const mat = mesh.material as THREE.Material | THREE.Material[] | undefined;
      for (const m of Array.isArray(mat) ? mat : mat ? [mat] : []) { (m as THREE.MeshBasicMaterial).map?.dispose(); m.dispose(); }
    });
    this.renderer.dispose();
    // Frees the WebGL context now, so a scene made later does not pile up contexts (browsers keep about 16).
    this.renderer.forceContextLoss();
    this.renderer.domElement.remove();
  }

  private mesh(geometry: THREE.BufferGeometry, colour: number, opacity = 1): THREE.Mesh {
    // Only a see-through mesh joins the sorted, blended pass. The ground, the pitch and the stumps are opaque: sorted with the cells they were sometimes drawn after them, and the cells then blended over the green
    // instead of the pitch (the dark cells during the swing to the overhead view).
    return new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ color: colour, transparent: opacity < 1, opacity }));
  }

  /** Everything that does not depend on the data: the ground, the pitch, creases and stumps. */
  private addPitch(): void {
    // The refined map's ground is deep enough to fill the bottom of the side view, so no black shows under it.
    const depth = this.options.refined ? 14 : 3;
    const slab = this.mesh(new THREE.BoxGeometry(80, depth, 90), 0x17321f); slab.position.set(0, -depth / 2, PL / 2); this.scene.add(slab);
    const pitch = this.mesh(new THREE.BoxGeometry(PW + 0.6, 0.14, PL + 1.2), 0xc7b98e); pitch.position.set(0, 0.07, PL / 2); this.scene.add(pitch);
    [1.22, PL - 1.22, 0, PL].forEach((z, i) => {
      const crease = this.mesh(new THREE.BoxGeometry(PW + 1.4, 0.02, 0.1), 0xffffff, i < 2 ? 1 : 0.5); crease.position.set(0, 0.15, z); this.scene.add(crease);
    });
    for (const z of [0, PL]) for (const dx of [-0.11 * LS, 0, 0.11 * LS]) {
      const stump = this.mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.71 * VX, 8), 0xf4f4f4); stump.position.set(dx, 0.14 + 0.355 * VX, z); this.scene.add(stump);
    }
    BANDS.slice(1).forEach((b) => { const line = this.mesh(new THREE.BoxGeometry(PW, 0.02, 0.06), 0xffffff, 0.35); line.position.set(0, 0.16, b.from); this.scene.add(line); });
  }

  private clearContent(): void {
    for (const child of [...this.content.children]) {
      this.content.remove(child);
      const m = child as THREE.Mesh;
      m.geometry?.dispose();
      const mat = m.material as THREE.Material | undefined;
      (mat as THREE.SpriteMaterial | undefined)?.map?.dispose();
      mat?.dispose();
    }
    this.materials.length = 0; this.plates = []; this.counts = []; this.sideLabels = []; this.planLabels = []; this.blocks = [];
    this.filled = { mesh: null, data: [], owner: [] }; this.hollow = { mesh: null, data: [], owner: [] };
    this.paths = null; this.segments = 0; this.shownCell = -2;
  }

  private build(): void {
    this.clearContent();
    const add = <T extends THREE.Object3D>(o: T): T => { this.content.add(o); return o; };
    const maxN = Math.max(1, ...this.cells.map((c) => c.balls));

    BANDS.forEach((b, i) => {
      const zc = (b.from + b.to) / 2, length = b.to - b.from, shade = i % 2 ? 0.06 : 0.12;
      const block = this.mesh(new THREE.PlaneGeometry(length, 1.9), 0xffffff, shade); block.rotation.y = Math.PI / 2; block.position.set(PW / 2 + 1, -1.15, zc); block.userData.base = shade;
      add(block); this.sideLabels.push(block); this.blocks.push(block);
      const name = add(label(b.label, Math.min(4.6, length * 0.95), 0.9, '#e6e6e6')); name.position.set(PW / 2 + 1.2, -0.75, zc); this.sideLabels.push(name);
      const metres = add(label(`${b.from} to ${b.to} m`, Math.min(4.2, length * 0.9), 0.7, this.options.refined ? '#d4d4d4' : '#9a9a9a', 400)); metres.position.set(PW / 2 + 1.2, -1.5, zc); this.sideLabels.push(metres);
      const plan = add(label(b.label, this.narrow ? 4.6 : 5.4, this.narrow ? 0.95 : 1.1, this.options.refined ? '#ffffff' : '#d0d0d0', this.options.refined ? 600 : 500)); plan.position.set(-PW / 2 - (this.narrow ? 2.9 : 3.6), 0.3, zc); this.planLabels.push(plan);
      const dist = add(label(`${b.from} to ${b.to} m`, this.narrow ? 3.3 : 3.8, this.narrow ? 0.7 : 0.8, this.options.refined ? '#dcdcdc' : '#8e8e8e', 400)); dist.position.set(PW / 2 + (this.narrow ? 2.7 : 3.4), 0.3, zc); this.planLabels.push(dist);
    });
    // The refined overhead view stops a little past the Short band, so the line names sit above the batter's stumps, clear of the controls at the bottom.
    const laneZ = this.options.refined ? -1.0 : PL + 1.6;
    LANES.forEach((lane, l) => { const s = add(label(lane.short, this.options.refined ? WL * 1.04 : WL, this.options.refined ? 1.1 : 0.9, this.options.refined ? '#ffffff' : '#cfcfcf', this.options.refined ? 600 : 500, this.options.refined ? 66 : 54)); s.position.set((l - 2) * WL, 0.3, laneZ); this.planLabels.push(s); });
    const release = add(label('Release', 3, 0.8, '#9a9a9a', 400)); release.position.set(0, 2.25 * VX + 0.9, PL - 1); this.sideLabels.push(release);

    // A shaded plate and a count for every length and line with balls, and one dot for every ball packed inside it.
    const filledColours: number[] = [];
    this.cells.forEach((c, ci) => {
      const band = BANDS[c.band]; if (!band) return;
      const t = Math.pow(c.balls / maxN, 0.7);
      // Refined: every cell is dark enough for white numbers, the busiest darkest.
      const colour = this.options.refined ? new THREE.Color().setRGB((70 - 56 * t) / 255, (86 - 58 * t) / 255, (110 - 66 * t) / 255, THREE.SRGBColorSpace) : new THREE.Color().setRGB((96 - 76 * t) / 255, (110 - 76 * t) / 255, (130 - 76 * t) / 255, THREE.SRGBColorSpace);
      const depth = band.to - band.from, x = (c.lane - 2) * WL, z = (band.from + band.to) / 2;
      const plate = new THREE.Mesh(new THREE.PlaneGeometry(WL - 0.08, depth - 0.08), new THREE.MeshBasicMaterial({ color: colour, transparent: true, opacity: 0 }));
      plate.rotation.x = -Math.PI / 2; plate.position.set(x, 0.2, z);
      add(plate); this.plates.push({ mesh: plate, cell: c, alpha: this.options.refined ? 0.62 + 0.3 * t : 0.3 + 0.55 * t, x, z, depth });
      const count = this.options.refined
        ? add(label(String(c.balls), WL * 0.92, Math.min(WL * 0.46, depth * 0.8), '#ffffff', 700, 120, true))
        : add(label(String(c.balls), WL * 0.86, WL * 0.46, '#ffffff', 700));
      count.position.set(x, 0.5, this.options.refined ? band.from + Math.min(0.62, depth / 2) : band.from + 0.62); (count.material as THREE.SpriteMaterial).opacity = 0; this.counts.push(count);

      const w = WL - 0.3, h = Math.max(0.2, depth - 0.3 - 0.55);
      const cols = Math.max(1, Math.ceil(Math.sqrt((c.balls * w) / h))), rows = Math.ceil(c.balls / cols);
      const step = Math.min(w / cols, h / rows), rad = Math.min(0.2, step * 0.4);
      const x0 = x - ((cols - 1) * step) / 2, z0 = band.from + 0.3 + 0.55 + rad;
      const classes: Outcome[] = [];
      const push = (k: Outcome, n: number): void => { for (let i = 0; i < n; i++) classes.push(k); };
      push('wicket', c.wickets); push('six', c.sixes); push('four', c.fours); push('run', c.scoring); push('dot', c.dots);
      classes.forEach((k, j) => {
        const target = k === 'dot' ? this.hollow : this.filled;
        target.data.push(x0 + (j % cols) * step, z0 + Math.floor(j / cols) * step, rad); target.owner.push(ci);
        if (k !== 'dot') filledColours.push(...new THREE.Color(this.palette[k]).toArray());
      });
    });
    this.filled.mesh = this.dotMesh(this.filled, new THREE.CircleGeometry(1, 14), null, filledColours);
    this.hollow.mesh = this.dotMesh(this.hollow, new THREE.RingGeometry(0.5, 1, 16), this.palette.dot);
    this.buildPaths();
    this.applyFades(0);
  }

  private dotMesh(dots: Dots, geometry: THREE.BufferGeometry, colour: number | null, colours?: number[]): THREE.InstancedMesh | null {
    const count = dots.owner.length; if (count === 0) return null;
    const mesh = new THREE.InstancedMesh(geometry, new THREE.MeshBasicMaterial({ color: colour ?? 0xffffff, transparent: true, opacity: 0.95, depthWrite: false }), count);
    mesh.rotation.x = -Math.PI / 2; mesh.position.y = 0.28; mesh.frustumCulled = false;
    if (colours) { const c = new THREE.Color(); for (let i = 0; i < count; i++) mesh.setColorAt(i, c.setRGB(colours[i * 3] ?? 1, colours[i * 3 + 1] ?? 1, colours[i * 3 + 2] ?? 1)); }
    this.content.add(mesh);
    this.placeDots(dots, mesh, -1);
    return mesh;
  }

  /** Shows the dots of one cell (or none, with -1), so the overhead view stays clean until a cell is hovered. */
  private placeDots(dots: Dots, mesh: THREE.InstancedMesh, cell: number): void {
    const m = new THREE.Matrix4(), q = new THREE.Quaternion();
    dots.owner.forEach((owner, i) => {
      const s = owner === cell ? (dots.data[i * 3 + 2] ?? 0) : 0;
      m.compose(new THREE.Vector3(dots.data[i * 3] ?? 0, -(dots.data[i * 3 + 1] ?? 0), 0), q, new THREE.Vector3(s, s, 1));
      mesh.setMatrixAt(i, m);
    });
    mesh.instanceMatrix.needsUpdate = true;
  }

  private showDotsOf(cell: number): void {
    if (cell === this.shownCell) return;
    this.shownCell = cell;
    if (this.filled.mesh) this.placeDots(this.filled, this.filled.mesh, cell);
    if (this.hollow.mesh) this.placeDots(this.hollow, this.hollow.mesh, cell);
  }

  /** Paths from the release point, through a bounce in the ball's band, to the stumps. One batch, so thousands of balls stay smooth. */
  private buildPaths(): void {
    const rand = seeded(11);
    const total = this.cells.reduce((a, c) => a + c.balls, 0);
    const refined = this.options.refined === true;
    // Refined: with few balls every ball has its own path, and with many a path stands for several, never more than MAX_ARCS paths in all.
    const perArc = refined ? (total <= 150 ? 1 : Math.ceil(total / MAX_ARCS)) : Math.max(9, Math.ceil(total / MAX_ARCS));
    const pos: number[] = [], col: number[] = [];
    const arcs: Array<{ pos: number[]; col: number[] }> = [];
    const colour = new THREE.Color();
    for (const c of this.cells) {
      const band = BANDS[c.band]; if (!band || (!refined && c.balls <= 3)) continue;
      const k = Math.max(1, Math.round(c.balls / perArc));
      for (let j = 0; j < k; j++) {
        const o = rand();
        const wk = c.wickets / c.balls, dot = c.dots / c.balls, run = c.scoring / c.balls, four = c.fours / c.balls;
        const out: Outcome = c.wickets > 0 && o < wk ? 'wicket' : o < wk + dot ? 'dot' : o < wk + dot + run ? 'run' : o < wk + dot + run + four ? 'four' : 'six';
        const bounceZ = band.from + (band.to - band.from) * (0.25 + 0.5 * rand());
        const x = (c.lane - 2) * WL + (rand() - 0.5) * WL * 0.7;
        const reach = (REACH[c.band] ?? 0.5) * (0.8 + 0.4 * o) * VX;
        const release = new THREE.Vector3((rand() - 0.5) * 0.5, 2.25 * VX, PL - 1);
        const bounce = new THREE.Vector3(x, 0.16, bounceZ);
        const end = new THREE.Vector3(x + (rand() - 0.5) * 0.4, reach + 0.16, 0);
        const half = ARC_POINTS / 2, lift = reach * 0.35 + (c.band + 1) * 0.35 * VX;
        const points: THREE.Vector3[] = [];
        for (let i = 0; i <= half; i++) { const t = i / half; points.push(new THREE.Vector3(release.x + (bounce.x - release.x) * t, release.y * (1 - t) * (1 - t) + release.y * 0.25 * 2 * t * (1 - t) + bounce.y * t * t, release.z + (bounce.z - release.z) * t)); }
        for (let i = 1; i <= half; i++) { const t = i / half; points.push(new THREE.Vector3(bounce.x + (end.x - bounce.x) * t, bounce.y * (1 - t) * (1 - t) + lift * 2 * t * (1 - t) + end.y * t * t, bounce.z + (end.z - bounce.z) * t)); }
        colour.set(this.palette[out]);
        const arc = { pos: [] as number[], col: [] as number[] };
        for (let i = 0; i < points.length - 1; i++) {
          const a = points[i], b = points[i + 1]; if (!a || !b) continue;
          arc.pos.push(a.x, a.y, a.z, b.x, b.y, b.z); arc.col.push(colour.r, colour.g, colour.b, colour.r, colour.g, colour.b);
        }
        arcs.push(arc);
      }
    }
    if (refined) {
      // The paths are shuffled so a batch is a mix of lengths and lines, and each batch is stored step by step across its paths: showing the segments in order then draws every path of the batch together.
      for (let i = arcs.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [arcs[i], arcs[j]] = [arcs[j]!, arcs[i]!]; }
      const { batch, seconds } = batchPlan(arcs.length);
      this.drawSeconds = seconds;
      for (let from = 0; from < arcs.length; from += batch) {
        const group = arcs.slice(from, from + batch);
        for (let step = 0; step < ARC_POINTS; step++) for (const arc of group) { pos.push(...arc.pos.slice(step * 6, step * 6 + 6)); col.push(...arc.col.slice(step * 6, step * 6 + 6)); }
      }
    } else for (const arc of arcs) { pos.push(...arc.pos); col.push(...arc.col); }
    if (pos.length === 0) return;
    const geometry = new LineSegmentsGeometry(); geometry.setPositions(pos); geometry.setColors(col);
    const material = new LineMaterial({ vertexColors: true, linewidth: 1.6, transparent: true, opacity: 0.85, depthWrite: false });
    material.resolution.set(this.host.clientWidth || 1, this.host.clientHeight || 1);
    this.materials.push(material);
    this.paths = new LineSegments2(geometry, material); this.paths.frustumCulled = false;
    this.segments = pos.length / 6;
    this.content.add(this.paths);
  }

  private resize(): void {
    const w = this.host.clientWidth, h = this.host.clientHeight; if (!w || !h) return;
    const size = this.renderer.getSize(new THREE.Vector2());
    if (size.x === w && size.y === h) return;
    this.renderer.setSize(w, h, false);
    for (const m of this.materials) m.resolution.set(w, h);
    this.setCamera();
    // Resizing clears a WebGL canvas: draw at once so a black box never shows mid scroll.
    this.renderer.render(this.scene, this.camera);
  }

  private setCamera(): void {
    const aspect = this.host.clientWidth / Math.max(1, this.host.clientHeight), k = this.theta / QUARTER;
    const refined = this.options.refined === true;
    const narrowNow = refined && aspect < 1.3;
    if (narrowNow !== this.narrow) { this.narrow = narrowNow; if (this.cells.length > 0) this.build(); }
    // Refined overhead: only as much pitch as the bands need (batter's stumps to a little past Short). The block starts at the top of the view and any spare height is left under it, where the legend sits.
    // The pitch is always in the middle (Ari, 2026-10-24); the labels on both sides set the width needed: the names on the left reach 11.3 m, the distances on the right 10.3 m, and a narrow panel drops the distances.
    const need = this.narrow ? 10.6 : 11.8;
    // The Player page on a phone sets --inset-top and --inset-bottom (px) on the stage: room kept free for the controls above the pitch and the legend below it, filled by the scene itself (green above, the pitch running on below)
    // and not by a strip of the page. The pitch is framed in what is left, and the view ends just past the Short band. Both are zero everywhere else, and they fade in with the swing to the overhead view.
    const css = getComputedStyle(this.host);
    const it = (parseFloat(css.getPropertyValue('--inset-top')) || 0) * k, ib = (parseFloat(css.getPropertyValue('--inset-bottom')) || 0) * k;
    const H = Math.max(1, this.host.clientHeight), inner = Math.max(40, H - it - ib), aspectIn = this.host.clientWidth / inner;
    const end = it + ib > 0 ? 12.9 : OVER_END;
    const side = Math.max(7.6, 13.6 / aspect), top = refined ? Math.max((end + 1.8) / 2, need / aspectIn) : Math.max(11.4, 11.9 / aspectIn), base = side + (top - side) * Math.pow(k, 0.8);
    const half = base * (H / inner), shift = ((it - ib) * half) / H;
    this.camera.left = -half * aspect; this.camera.right = half * aspect; this.camera.top = half + shift; this.camera.bottom = -half + shift; this.camera.updateProjectionMatrix();
    const overZ = refined ? -1.9 + top : PL / 2;
    const target = new THREE.Vector3(0, 0.9 * (1 - k), PL / 2 + (overZ - PL / 2) * k);
    this.camera.position.set(target.x + 60 * Math.cos(this.theta), target.y + 60 * Math.sin(this.theta), target.z);
    this.camera.up.set(0, Math.cos(this.theta), -Math.sin(this.theta));
    this.camera.lookAt(target);
  }

  private applyFades(pan: number): void {
    // Refined: the paths are gone before the numbers appear, so nothing runs behind a number.
    if (this.paths) (this.paths.material as LineMaterial).opacity = this.options.refined ? 0.85 * clamp(1 - pan / 0.28, 0, 1) : 0.85 * (1 - 0.95 * pan);
    if (this.paths && this.options.refined) this.paths.visible = (this.paths.material as LineMaterial).opacity > 0.01;
    this.plates.forEach(({ mesh, cell, alpha }, i) => {
      // Refined: every cell fades in together and is fully dark before any number shows, so a number is never white on a light, half-faded cell.
      const k = this.options.refined ? clamp((pan - 0.2) / 0.38, 0, 1) : clamp((pan - 0.25 - i * 0.012) / 0.4, 0, 1), lit = this.highlightBand === cell.band ? 0.28 : 0;
      (mesh.material as THREE.MeshBasicMaterial).opacity = Math.min(1, alpha * k + lit * k);
    });
    const countOpacity = this.options.refined ? clamp((pan - 0.62) / 0.3, 0, 1) : clamp((pan - 0.6) / 0.35, 0, 1);
    for (const s of this.counts) (s.material as THREE.SpriteMaterial).opacity = countOpacity;
    const plan = clamp((pan - 0.4) / 0.35, 0, 1);
    for (const s of this.planLabels) (s.material as THREE.SpriteMaterial).opacity = plan;
    const side = clamp(1 - pan * 3, 0, 1);
    for (const s of this.sideLabels) { const mat = s.material as THREE.SpriteMaterial | THREE.MeshBasicMaterial; mat.opacity = ((s.userData.base as number | undefined) ?? 1) * side; }
    this.blocks.forEach((b, i) => { (b.material as THREE.MeshBasicMaterial).opacity = (b.userData.base as number) * side * (this.highlightBand === i ? 3 : 1); });
  }

  private frame = (now: number): void => {
    this.raf = requestAnimationFrame(this.frame);
    // A view that is kept in the page but not shown is only hidden (.held), so its scenes must not keep drawing.
    if (!this.visible || this.host.closest('.held')) return;
    // Refined: a short hold and a quicker swing, so the whole sequence from first path to finished map stays near three seconds.
    const refined = this.options.refined === true;
    const INTRO = 0.12, DRAW = this.drawSeconds, HOLD = refined ? 0.2 : 0.6, PAN = refined ? 1.05 : 2.6;
    if (this.options.reducedMotion && this.mode === 'auto') { this.theta = QUARTER; if (this.paths) this.paths.geometry.instanceCount = this.segments; }
    else if (this.mode === 'auto') {
      const t = this.revealed ? (now - this.t0) / 1000 : -1;
      // Refined: even steps, so every batch gets the same time. The other maps ease in and out.
      const drawn = clamp((t - INTRO) / DRAW, 0, 1);
      if (this.paths) this.paths.geometry.instanceCount = Math.floor(this.segments * (this.options.refined ? drawn : ease(drawn)));
      this.theta = QUARTER * ease(clamp((t - INTRO - DRAW - HOLD) / PAN, 0, 1));
    } else {
      if (this.tween) { const k = ease(clamp((now - this.tween.t0) / (this.options.refined ? 900 : 1200), 0, 1)); this.theta = this.tween.from + (this.tween.to - this.tween.from) * k; if (k >= 1) this.tween = null; }
      if (this.paths) this.paths.geometry.instanceCount = this.segments;
    }
    this.setCamera();
    const pan = this.theta / QUARTER;
    this.applyFades(pan);
    this.showDotsOf(pan > 0.9 ? this.hoveredCell : -1);
    const view: PitchView = pan > 0.78 ? 'over' : 'side';
    if (view !== this.lastView) { this.lastView = view; this.options.onView(view); }
    this.renderer.render(this.scene, this.camera);
  };

  private onMove = (event: PointerEvent): void => {
    const rect = this.renderer.domElement.getBoundingClientRect();
    const ndc = new THREE.Vector2(((event.clientX - rect.left) / rect.width) * 2 - 1, -((event.clientY - rect.top) / rect.height) * 2 + 1);
    if (this.theta / QUARTER > 0.9) {
      const ray = new THREE.Raycaster(); ray.setFromCamera(ndc, this.camera);
      const { origin: o, direction: d } = ray.ray;
      const t = -(o.y - 0.2) / d.y, x = o.x + d.x * t, z = o.z + d.z * t;
      const hit = this.plates.findIndex((p) => Math.abs(p.x - x) < WL / 2 && Math.abs(p.z - z) < p.depth / 2);
      this.hoveredCell = hit;
      const cell = hit >= 0 ? this.plates[hit]?.cell ?? null : null;
      this.options.onHover(cell ? { cell, band: cell.band, x: event.clientX, y: event.clientY } : null);
      return;
    }
    // Side-on: the band under the pointer, from where each band edge falls on screen.
    const edges = [...BANDS.map((b) => this.screenX(b.from)), this.screenX(BANDS[BANDS.length - 1]?.to ?? 0)];
    const band = edges.findIndex((e, i) => { const next = edges[i + 1]; return next !== undefined && ndc.x >= Math.min(e, next) && ndc.x <= Math.max(e, next); });
    this.hoveredCell = -1;
    this.options.onHover(band < 0 ? null : { cell: null, band, x: event.clientX, y: event.clientY });
  };

  private screenX(z: number): number { return new THREE.Vector3(0, 0, z).project(this.camera).x; }
  private onLeave = (): void => { this.hoveredCell = -1; this.options.onHover(null); };
}
