// CellScape multi-scale 3D engine.
// One renderer/camera/controls; "levels" (cell, organelle, molecular) are swapped in and out.
// Zooming into a level's portal dives into the child level; zooming far out returns to the parent.
// Controls: right-drag (or left-drag on empty space) orbits, shift/ctrl + drag pans, wheel/pinch zooms
// toward the cursor, left-click selects, double-click dives in.
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { BokehPass } from "three/addons/postprocessing/BokehPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import { StyleManager } from "./style.js";
import { applyTier, TIER_LOD } from "./materials.js";

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

const DEFAULT_ENV = {
  bg: ["#071a2c", "#0b3640", "#2a1650"], // top, bottom, accent
  fog: ["#082230", 0.02],
  exposure: 1.0,
  bloom: [0.5, 0.55, 0.82],             // strength, radius, threshold
  aperture: 0.0016,
};

export function formatLength(m) {
  if (m >= 1) return `${+m.toPrecision(3)} m`;
  if (m >= 1e-2) return `${+(m * 1e2).toPrecision(3)} cm`;
  if (m >= 1e-3) return `${+(m * 1e3).toPrecision(3)} mm`;
  if (m >= 1e-6) return `${+(m * 1e6).toPrecision(3)} µm`;
  return `${+(m * 1e9).toPrecision(3)} nm`;
}

const safe = (f) => { try { return f(); } catch (err) { console.error(err); } };

/** Free GPU memory for everything under `root` (skips resources marked userData.shared). */
export function disposeTree(root) {
  const seen = new Set();
  const free = (r) => { if (r && !seen.has(r) && !r.userData?.shared) { seen.add(r); r.dispose?.(); } };
  root.traverse((o) => {
    free(o.geometry);
    // the clay style keeps the original material in userData.realMat and its own in userData.clayMat: free both
    const u = o.userData || {};
    const mats = [o.material, u.realMat, u.clayMat].flat().filter(Boolean);
    for (const m of mats) {
      for (const v of Object.values(m)) if (v && v.isTexture) free(v);
      free(m);
    }
    if (o.isInstancedMesh) o.dispose();
  });
}

export class Engine {
  /**
   * opts: canvas, stageEl, panel (element for level cards), labelLayer, crumbs, scaleEl,
   *       levels: { id: { title, load: () => Promise<module with create(engine, ctx)> } }, toast(msg)
   */
  constructor(opts) {
    Object.assign(this, opts);
    this.levelsDef = opts.levels;
    this.quality = "high";
    this.reducedMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
    const r = (this.renderer = new THREE.WebGLRenderer({ canvas: opts.canvas, antialias: true, powerPreference: "high-performance" }));
    r.toneMapping = THREE.ACESFilmicToneMapping;
    r.outputColorSpace = THREE.SRGBColorSpace;
    r.localClippingEnabled = true;
    r.shadowMap.enabled = true;          // only used by the clay style's key light (no light casts shadows in the real style)
    r.shadowMap.type = THREE.PCFSoftShadowMap;

    const scene = (this.scene = new THREE.Scene());
    const pm = new THREE.PMREMGenerator(r);
    scene.environment = pm.fromScene(new RoomEnvironment(), 0.04).texture;
    scene.environmentIntensity = 0.55;
    scene.fog = new THREE.FogExp2(DEFAULT_ENV.fog[0], DEFAULT_ENV.fog[1]);

    this.camera = new THREE.PerspectiveCamera(38, 1, 0.01, 2000);
    const c = (this.controls = new OrbitControls(this.camera, opts.canvas));
    Object.assign(c, { enableDamping: true, dampingFactor: 0.08, rotateSpeed: 0.6, zoomSpeed: 0.9, zoomToCursor: true, screenSpacePanning: true });
    c.mouseButtons = { LEFT: THREE.MOUSE.ROTATE, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.ROTATE };
    c.touches = { ONE: THREE.TOUCH.ROTATE, TWO: THREE.TOUCH.DOLLY_PAN };

    this.addBackground();
    this.addLights();
    this.setupPost();
    this.styleName = "real";
    this.style = new StyleManager(this);

    this.ray = new THREE.Raycaster();
    this.stack = [];            // [{ id, inst, portal, saved }]
    this.busy = false;
    this.frameTimes = [];
    this.frameSpan = 0;
    this.pixelScale = 1;       // below 1 only on very weak devices, and only in the Fast tier
    this.pointer = { x: 0, y: 0, inside: false };
    this.hoverObj = null;
    this.zoomOutPush = 0;

    this.fade = document.createElement("div");
    this.fade.className = "cs-fade";
    opts.stageEl.appendChild(this.fade);
    this.tip = this.label("", "cs-tip");

    this.bindInput();
    new ResizeObserver(() => this.resize()).observe(opts.stageEl);
    this.resize();
  }

  // ---------- environment ----------
  addBackground() {
    const m = new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false, fog: false,
      uniforms: { t: { value: 0 }, calm: { value: 1 }, top: { value: new THREE.Color() }, bottom: { value: new THREE.Color() }, accent: { value: new THREE.Color() } },
      vertexShader: `varying vec3 vP; void main(){ vP = normalize(position); vec4 p = projectionMatrix * modelViewMatrix * vec4(position,1.0); gl_Position = p.xyww; }`,
      fragmentShader: `
        varying vec3 vP; uniform float t, calm; uniform vec3 top, bottom, accent;
        float h(vec3 p){ return fract(sin(dot(p, vec3(12.9898,78.233,37.719)))*43758.5453); }
        float n(vec3 p){ vec3 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f);
          return mix(mix(mix(h(i),h(i+vec3(1,0,0)),f.x),mix(h(i+vec3(0,1,0)),h(i+vec3(1,1,0)),f.x),f.y),
                     mix(mix(h(i+vec3(0,0,1)),h(i+vec3(1,0,1)),f.x),mix(h(i+vec3(0,1,1)),h(i+vec3(1,1,1)),f.x),f.y),f.z); }
        float fbm(vec3 p){ float s=0.0, a=0.5; for(int i=0;i<5;i++){ s+=a*n(p); p*=2.03; a*=0.5; } return s; }
        void main(){
          vec3 c = mix(bottom, top, smoothstep(-0.6, 0.7, vP.y));
          float f = fbm(vP * 3.0 + vec3(t*0.01, 0.0, t*0.007)) * calm;
          c = mix(c, accent, smoothstep(0.45, 0.85, f) * 0.85);
          c += bottom * smoothstep(0.55, 0.9, fbm(vP*5.0 - t*0.005) * calm) * 0.5;
          gl_FragColor = vec4(c, 1.0);
        }`,
    });
    this.bg = new THREE.Mesh(new THREE.SphereGeometry(1, 48, 32), m);
    this.bg.frustumCulled = false;
    this.bg.renderOrder = -1000;
    this.scene.add(this.bg);
  }

  addLights() {
    const s = this.scene;
    this.lights = new THREE.Group();
    this.lights.add(new THREE.HemisphereLight("#a5c8ff", "#1e5a55", 0.7));
    const key = new THREE.DirectionalLight("#fff3e0", 2.4); key.position.set(-6, 10, 9);
    const rim = new THREE.DirectionalLight("#c4a1ff", 1.8); rim.position.set(5, 4, -10);
    const under = new THREE.DirectionalLight("#38d6c4", 0.8); under.position.set(0, -10, 4);
    this.lights.add(key, rim, under);
    s.add(this.lights);
  }

  applyEnv(env = {}, inst = this.current) {
    const e = this.style.env({ ...DEFAULT_ENV, ...env }, inst);
    const u = this.bg.material.uniforms;
    u.calm.value = this.style.clay ? 0 : 1;   // clay: a clean studio backdrop, no nebula clouds
    u.top.value.set(e.bg[0]); u.bottom.value.set(e.bg[1]); u.accent.value.set(e.bg[2]);
    this.scene.fog.color.set(e.fog[0]);
    this.scene.fog.density = e.fog[1];
    this.renderer.toneMappingExposure = e.exposure;
    [this.bloom.strength, this.bloom.radius, this.bloom.threshold] = e.bloom;
    this.bokeh.uniforms.aperture.value = e.aperture;
    this.bokeh.uniforms.maxblur.value = this.style.clay ? 0.004 : 0.003;
    this.env = e;
    this.fade.style.background = `radial-gradient(circle at 50% 50%, ${e.bg[1]}, ${e.bg[0]})`;
  }

  // ---------- post ----------
  setupPost() {
    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.bokeh = new BokehPass(this.scene, this.camera, { focus: 15, aperture: 0.0016, maxblur: 0.006 });
    this.composer.addPass(this.bokeh);
    this.bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.5, 0.55, 0.82);
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());
  }

  /** Art style: "real" (default) or "clay" (pastel plasticine diorama). Re-applies to the current level; new levels inherit it. */
  setStyle(name) {
    this.styleName = name === "clay" ? "clay" : "real";
    this.style.set(this.styleName);
    this.onStyle && this.onStyle(this.styleName);
  }

  /** Performance tier: "high" | "medium" | "low" (same as .quality). Levels may read it to size their own detail. */
  get tier() { return this.quality; }

  /**
   * Detail multiplier for the tier: 1 (high), 0.75 (medium), 0.5 (low). Levels can scale particle / instance counts by it.
   * The engine also applies it for you: any InstancedMesh marked `userData.lod = true` gets
   * count = ceil(full * lodScale), where full is `userData.lodCount` or the buffer capacity (instanceMatrix.count).
   * Such meshes are engine-managed, so don't set .count on them yourself.
   */
  get lodScale() { return TIER_LOD[this.quality] ?? 1; }

  /** Re-apply the tier's material downgrades and LOD counts to the mounted level (idempotent, cheap when nothing changed). */
  refreshTier() {
    if (this.current?.root) applyTier(this.current.root, this.quality, this.lodScale);
  }

  refreshPost() {
    this.bokeh.enabled = this.quality === "high";
    this.bloom.enabled = this.quality !== "low" && !this.style.clay;
    if (this.scopeActive) this.bokeh.enabled = this.bloom.enabled = false;   // microscope mode draws with its own passes (microscope.js)
  }

  setQuality(q) {
    this.quality = q;
    this.frameTimes.length = 0; this.frameSpan = 0;
    this.refreshTier();
    this.refreshPost();
    this.style.refreshQuality();
    this.resize();
    this.onQuality && this.onQuality(q);
  }

  resize() {
    const r = this.stageEl.getBoundingClientRect();
    const w = (this.w = Math.max(1, r.width)), h = (this.h = Math.max(1, r.height));
    const dpr = Math.min(window.devicePixelRatio || 1, this.quality === "low" ? 1 : this.quality === "medium" ? 1.5 : 2) * (this.quality === "low" ? this.pixelScale : 1);
    this.renderer.setPixelRatio(dpr);
    this.renderer.setSize(w, h, false);
    this.composer.setPixelRatio(dpr);
    this.composer.setSize(w, h);
    this.bloom.resolution.set(w / 2, h / 2);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    if (this.current && !this.userMoved && !this.busy && !this.flight) this.frame(this.current.view);
    this.current?.onResize?.(w, h);
  }

  // ---------- labels ----------
  label(html, cls = "") {
    const d = document.createElement("div");
    d.className = `lbl3d ${cls}`;
    d.innerHTML = html;
    this.labelLayer.appendChild(d);
    return d;
  }

  /** Position a DOM label at a world point. Returns false if behind the camera. */
  place(el, v, dx = 0, dy = 0) {
    const p = (this._pv ||= new THREE.Vector3()).copy(v).project(this.camera);
    if (p.z > 1 || p.z < -1) { el.style.display = "none"; return false; }
    el.style.display = "";
    const x = (p.x * 0.5 + 0.5) * this.w + dx, y = (-p.y * 0.5 + 0.5) * this.h + dy;
    el.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) translate(-50%, -50%)`;
    return true;
  }

  // ---------- picking ----------
  setRay(cx, cy) {
    const r = this.canvas.getBoundingClientRect();
    this.ray.setFromCamera({ x: ((cx - r.left) / r.width) * 2 - 1, y: -((cy - r.top) / r.height) * 2 + 1 }, this.camera);
    return this.ray;
  }

  pick(cx, cy) {
    const L = this.current;
    if (!L?.pickables?.length) return null;
    this.setRay(cx, cy);
    // hidden parts (invisible, or hidden by the clay style) can't be picked even though Raycaster doesn't check .visible
    const live = (h) => { for (let o = h.object; o; o = o.parent) if (o.visible === false || o.userData?.clayHidden) return false; return true; };
    const hit = this.ray.intersectObjects(L.pickables, true).find(live);
    if (hit) return hit;
    return (L.fallbackPickables && this.ray.intersectObjects(L.fallbackPickables, true).find(live)) || null;
  }

  // ---------- input ----------
  bindInput() {
    const cv = this.canvas;
    cv.tabIndex = 0;
    let down = null;
    const active = new Set();      // pointer ids currently down
    let multi = false;             // a multi-touch gesture is in progress: never treat it as a tap
    let lastClick = { t: 0, x: 0, y: 0 };
    let holdLock = false;   // a consumed press became multi-touch: re-enable orbiting only once all fingers lift
    cv.addEventListener("pointerdown", (e) => {
      active.add(e.pointerId);
      if (active.size > 1) { multi = true; if (down?.handled) { safe(() => this.current?.onPointerUp?.(e)); holdLock = true; } down = null; return; }
      multi = false;
      if (this.busy) return;
      down = { id: e.pointerId, x: e.clientX, y: e.clientY, b: e.button, travel: 0 };
      const hit = e.button === 0 ? this.pick(e.clientX, e.clientY) : null;
      down.hit = hit;
      if (e.button === 0 && this.current?.onPointerDown?.(e, hit)) { down.handled = true; this.controls.enabled = false; }
    });
    cv.addEventListener("pointermove", (e) => {
      this.pointer.x = e.clientX; this.pointer.y = e.clientY; this.pointer.inside = true;
      if (down && e.pointerId === down.id) down.travel = Math.max(down.travel, Math.hypot(e.clientX - down.x, e.clientY - down.y));
      if (down?.handled) { this.current?.onPointerDrag?.(e); return; }
      if (e.buttons) return;
      this.hoverPending = true;
    });
    cv.addEventListener("pointerleave", () => { this.pointer.inside = false; this.setHover(null); });
    const end = (e, cancelled) => {
      active.delete(e.pointerId);
      if (!active.size && holdLock) { holdLock = false; this.controls.enabled = true; }
      if (!down || e.pointerId !== down.id) { if (!active.size) multi = false; return; }
      if (down.handled) { this.current?.onPointerUp?.(e); this.controls.enabled = true; }
      else if (!cancelled && !multi && down.travel <= 6 && down.b === 0 && !this.busy) {
        const now = performance.now();
        const dbl = now - lastClick.t < 320 && Math.hypot(e.clientX - lastClick.x, e.clientY - lastClick.y) < 10;
        lastClick = { t: dbl ? 0 : now, x: e.clientX, y: e.clientY };
        if (dbl) {
          // second click of a double-click: dive if it's a portal, never repeat the single-click action
          const portal = down.hit && this.portalFor(down.hit.object);
          if (portal) this.dive(portal);
        } else this.click(e, down.hit);
      }
      down = null;
      if (!active.size) multi = false;
    };
    cv.addEventListener("pointerup", (e) => end(e, false));
    cv.addEventListener("pointercancel", (e) => end(e, true));
    cv.addEventListener("lostpointercapture", (e) => { if (down && e.pointerId === down.id && down.handled) end(e, true); });
    // keyboard: arrows orbit, +/- zoom, Enter dives into the selection, Escape/Backspace goes up
    cv.addEventListener("keydown", (e) => {
      if (this.busy || e.ctrlKey || e.metaKey || e.altKey) return;
      const k = e.key, c = this.controls, off = this.camera.position.clone().sub(c.target);
      const sph = new THREE.Spherical().setFromVector3(off);
      let used = true;
      if (k === "ArrowLeft") sph.theta -= 0.12;
      else if (k === "ArrowRight") sph.theta += 0.12;
      else if (k === "ArrowUp") sph.phi = clamp(sph.phi - 0.1, c.minPolarAngle + 0.01, c.maxPolarAngle - 0.01);
      else if (k === "ArrowDown") sph.phi = clamp(sph.phi + 0.1, c.minPolarAngle + 0.01, c.maxPolarAngle - 0.01);
      else if (k === "+" || k === "=") sph.radius = clamp(sph.radius * 0.85, c.minDistance, c.maxDistance);
      else if (k === "-" || k === "_") sph.radius = clamp(sph.radius / 0.85, c.minDistance, c.maxDistance);
      else if (k === "Enter" && this.selected?.portal) { e.preventDefault(); this.dive(this.selected.portal); return; }
      else if ((k === "Escape" || k === "Backspace") && this.stack.length > 1) { e.preventDefault(); this.up(); return; }
      else used = false;
      if (used) { e.preventDefault(); this.userMoved = true; this.camera.position.copy(c.target).add(off.setFromSpherical(sph)); c.update(); }
    });
    this.controls.addEventListener("start", () => (this.userMoved = true));
    // zooming out past the level's limit climbs to the parent level
    cv.addEventListener("wheel", (e) => {
      if (this.busy || !this.current) return;
      const d = this.camera.position.distanceTo(this.controls.target);
      if (e.deltaY > 0 && d >= this.controls.maxDistance * 0.97 && this.stack.length > 1) {
        this.zoomOutPush += Math.min(80, Math.abs(e.deltaY));
        if (this.zoomOutPush > 160) { this.zoomOutPush = 0; this.up(); }
      } else this.zoomOutPush = 0;
      this.lastWheelIn = e.deltaY < 0 ? performance.now() : 0;
    }, { passive: true });
    let pinch = 0;
    cv.addEventListener("touchmove", (e) => {
      if (e.touches.length !== 2) return;
      const d = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY);
      if (pinch && d > pinch + 2) this.lastWheelIn = performance.now();
      if (pinch && d < pinch - 2) {
        const cd = this.camera.position.distanceTo(this.controls.target);
        if (cd >= this.controls.maxDistance * 0.97 && this.stack.length > 1) { this.zoomOutPush += 12; if (this.zoomOutPush > 160) { this.zoomOutPush = 0; this.up(); } }
      }
      pinch = d;
    }, { passive: true });
    cv.addEventListener("touchend", () => (pinch = 0));
  }

  setHover(obj) {
    if (obj === this.hoverObj) return;
    this.hoverObj = obj;
    const info = obj && this.current?.info?.(obj);
    this.canvas.style.cursor = info ? "pointer" : "grab";
    this.hoverInfo = info;
    this.current?.onHover?.(obj, info);
  }

  click(e, hit) {
    const L = this.current;
    if (L?.onClick?.(e, hit)) return;
    const info = hit && L?.info?.(hit.object);
    this.select(info ? { ...info, object: hit.object, point: hit.point } : null);
  }

  select(info) {
    this.selected = info;
    this.onSelect && this.onSelect(info);
    this.current?.onSelect?.(info);
  }

  portalFor(obj) {
    const L = this.current;
    if (!L?.portals) return null;
    for (let o = obj; o; o = o.parent) {
      const p = L.portals.find((q) => q.object === o || q.objects?.includes(o));
      if (p) return p;
    }
    return null;
  }

  // ---------- levels ----------
  get current() { return this.stack.at(-1)?.inst; }

  async load(id) {
    const def = this.levelsDef[id];
    if (!def) throw new Error(`Unknown level ${id}`);
    const mod = await def.load();
    return mod.create(this, { id, def });
  }

  /** Start at a root level (clears the stack). */
  async start(id) {
    const inst = await this.load(id);
    this.stack = [{ id, inst }];
    this.mount(inst);
    this.frame(inst.view);
    this.userMoved = false;
    this.emitChange();
  }

  mount(inst) {
    this.scene.add(inst.root);
    this.style.name = this.styleName;
    this.applyEnv(inst.env, inst);
    this.style.applyTo(inst, this.styleName);
    this.style.attach(inst);
    this.refreshTier();
    this.refreshPost();
    const c = this.controls;
    c.minDistance = inst.minDistance ?? 0.1;
    c.maxDistance = inst.maxDistance ?? 100;
    c.minPolarAngle = inst.minPolar ?? 0;
    c.maxPolarAngle = inst.maxPolar ?? Math.PI;
    c.minAzimuthAngle = inst.minAzimuth ?? -Infinity;
    c.maxAzimuthAngle = inst.maxAzimuth ?? Infinity;
    c.enablePan = inst.enablePan ?? true;
    c.mouseButtons.LEFT = inst.leftDragRotate === false ? null : THREE.MOUSE.ROTATE;
    this.camera.near = (inst.near ?? c.minDistance * 0.05);
    this.camera.far = inst.far ?? c.maxDistance * 20;
    this.camera.updateProjectionMatrix();
    inst.mountPanel?.(this.panel);
    if ((inst._hookStyle || "real") !== this.styleName) { inst._hookStyle = this.styleName; safe(() => inst.onStyle?.(this.styleName)); }
    this.setHover(null);
    this.select(null);
  }

  unmount(inst) {
    this.scene.remove(inst.root);
    this.style.detach();
    inst.unmountPanel?.(this.panel);
    this.panel.innerHTML = "";
  }

  frame(view) {
    const v = view || { target: new THREE.Vector3(), distance: 10, dir: new THREE.Vector3(0, 0.3, 1) };
    this.controls.target.copy(v.target);
    this.camera.position.copy(v.target).addScaledVector(v.dir.clone().normalize(), v.distance);
    this.controls.update();
  }

  /** Animate camera/target to a new framing. */
  fly(target, pos, dur = 0.9) {
    if (this.flight) { const f = this.flight; this.flight = null; f.res(); }
    if (!this.busy) this.userMoved = true;   // a level asked for this view (e.g. "Show me", tours): keep it on resize
    if (this.reducedMotion) dur = Math.min(dur, 0.05);
    return new Promise((res) => {
      const t0 = this.controls.target.clone(), p0 = this.camera.position.clone();
      this.flight = { t: 0, dur, t0, p0, t1: target.clone(), p1: pos.clone(), res };
    });
  }

  fadeTo(a, ms) {
    this.fade.style.transition = `opacity ${ms}ms ease`;
    this.fade.style.opacity = String(a);
    return new Promise((r) => setTimeout(r, ms));
  }

  /** Dive into a portal of the current level. portal: { to, center(): Vector3, radius, label } */
  async dive(portal) {
    if (this.busy) return;
    const def = this.levelsDef[portal.to];
    if (!def) { portal.fallback ? portal.fallback() : this.toast?.(`${portal.label}: coming soon`); return; }
    this.busy = true;
    const parent = this.stack.at(-1);
    const saved = { target: this.controls.target.clone(), pos: this.camera.position.clone() };
    let swapped = false;
    try {
      const C = portal.center().clone(), r = portal.radius;
      const dir = this.camera.position.clone().sub(C).normalize();
      const loading = this.load(portal.to);
      loading.catch(() => {}); // handled below; avoids an unhandled-rejection warning while we animate
      await this.fly(C, C.clone().addScaledVector(dir, r * 2.6), 0.8);
      const fadeP = this.fadeTo(1, 380);
      await this.fly(C, C.clone().addScaledVector(dir, r * 1.05), 0.4);
      await fadeP;
      const inst = await loading;
      try {
        this.unmount(parent.inst);
        safe(() => parent.inst.onPause?.());
        this.stack.push({ id: portal.to, inst, portal, saved, dir });
        this.mount(inst);
      } catch (err) {
        // roll back to the parent exactly as it was
        if (this.stack.at(-1)?.inst === inst) this.stack.pop();
        safe(() => this.unmount(inst));
        safe(() => inst.dispose?.());
        safe(() => disposeTree(inst.root));
        this.mount(parent.inst);
        safe(() => parent.inst.onResume?.());
        throw err;
      }
      swapped = true;
      const v = inst.view;
      this.userMoved = false;
      if (inst.entryRadius) {
        const s = inst.entryRadius / r;
        this.controls.target.copy(v.target);
        this.camera.position.copy(v.target).addScaledVector(dir, r * 1.05 * s);
        this.controls.update();
        this.fadeTo(0, 450);
        await this.fly(v.target, v.target.clone().addScaledVector(dir, v.distance), 0.9);
      } else {
        const d = v.dir.clone().normalize();
        this.controls.target.copy(v.target);
        this.camera.position.copy(v.target).addScaledVector(d, v.distance * 0.45);
        this.controls.update();
        this.fadeTo(0, 500);
        await this.fly(v.target, v.target.clone().addScaledVector(d, v.distance), 1.1);
      }
      this.userMoved = false;
    } catch (err) {
      console.error(err);
      if (!swapped) {
        this.flight = null;
        this.controls.target.copy(saved.target);
        this.camera.position.copy(saved.pos);
        this.controls.update();
      }
      this.toast?.(`Couldn't open ${portal.label}. Check your connection and try again.`);
    } finally {
      this.fadeTo(0, 300);
      this.busy = false;
      this.emitChange();
    }
  }

  /** Climb back up to the parent level. */
  async up(levels = 1) {
    if (this.busy || this.stack.length <= 1) return;
    this.busy = true;
    try {
      for (let i = 0; i < levels && this.stack.length > 1; i++) {
        await this.fadeTo(1, 320);
        const top = this.stack.pop();         // swap only once the screen is covered
        const parent = this.stack.at(-1);
        safe(() => this.unmount(top.inst));
        try { this.mount(parent.inst); } catch (err) { this.stack.push(top); this.mount(top.inst); throw err; }
        safe(() => parent.inst.onResume?.());
        safe(() => top.inst.dispose?.());       // child is freed only after the parent is back
        safe(() => disposeTree(top.inst.root));
        const C = top.portal.center().clone(), r = top.portal.radius;
        const dir = this.camera.position.clone().sub(this.controls.target).normalize();
        this.controls.target.copy(C);
        this.camera.position.copy(C).addScaledVector(dir, r * 1.3);
        this.controls.update();
        this.fadeTo(0, 420);
        await this.fly(top.saved.target, top.saved.pos, 1.0);
      }
    } catch (err) {
      console.error(err);
    } finally {
      this.fadeTo(0, 300);
      this.busy = false;
      this.emitChange();
    }
  }

  /** Run fn(k) every frame for k = 0 → 1 (eased) over `dur` seconds of real time. */
  tween(dur, fn) {
    if (this.reducedMotion || dur <= 0) { try { fn(1); return Promise.resolve(); } catch (err) { return Promise.reject(err); } }
    return new Promise((res, rej) => {
      const t0 = performance.now();
      const tick = () => {
        const x = Math.min(1, (performance.now() - t0) / (dur * 1000));
        try { fn(x < 0.5 ? 2 * x * x : 1 - Math.pow(-2 * x + 2, 2) / 2); } catch (err) { rej(err); return; }
        x < 1 ? requestAnimationFrame(tick) : res();
      };
      requestAnimationFrame(tick);
    });
  }

  /**
   * Replace the root level in place (e.g. plant cell ⇄ animal cell), keeping the camera.
   * Optional hooks: old.morphOut(k) (k 0→1: hide what the new level doesn't share), then
   * new.morphIn(k) (k 0→1: grow in its own parts). Both levels are in the scene only briefly.
   */
  async swapRoot(id) {
    if (this.busy || this.stack.length !== 1 || this.stack[0].id === id) return;
    this.busy = true;
    const old = this.stack[0];
    let committed = false, inst = null;
    try {
      const loading = this.load(id);
      loading.catch(() => {});
      if (old.inst.morphOut) await this.tween(0.7, (k) => old.inst.morphOut(k));
      inst = await loading;
      inst.morphIn?.(0);
      const cam = { target: this.controls.target.clone(), pos: this.camera.position.clone() };
      this.unmount(old.inst);
      this.stack[0] = { id, inst };
      this.mount(inst);
      committed = true;
      this.controls.target.copy(cam.target);
      this.camera.position.copy(cam.pos);
      this.controls.update();
      safe(() => old.inst.dispose?.());
      safe(() => disposeTree(old.inst.root));
      // reframe for the new cell while it grows in, keeping the current viewing direction
      const v = inst.view, dir = cam.pos.clone().sub(cam.target).normalize();
      const flight = this.fly(v.target, v.target.clone().addScaledVector(dir, v.distance), 1.0);
      this.userMoved = false;
      if (inst.morphIn) await this.tween(0.9, (k) => inst.morphIn(k));
      await flight;
      this.userMoved = false;
    } catch (err) {
      console.error(err);
      if (committed) safe(() => inst.morphIn?.(1));   // new cell is in; just finish its morph
      else {
        // roll back: the old cell comes back whole, the half-made new one is freed
        if (inst) {
          if (this.stack[0].inst === inst) safe(() => this.unmount(inst));
          safe(() => inst.dispose?.());
          safe(() => disposeTree(inst.root));
        }
        this.stack[0] = old;
        if (!this.scene.children.includes(old.inst.root)) safe(() => this.mount(old.inst));
        safe(() => old.inst.morphOut?.(0));
      }
      this.toast?.("Couldn't switch cells. Try again.");
    } finally {
      this.busy = false;
      this.emitChange();
    }
  }

  emitChange() {
    this.select(null);
    this.onChange && this.onChange(this.stack.map((s) => ({ id: s.id, title: s.inst.title })));
  }

  // ---------- per-frame ----------
  metersPerUnit() {
    // derived down the stack for magnified copies; explicit for molecular levels
    let m = this.stack[0]?.inst.metersPerUnit ?? 1e-6;
    for (let i = 1; i < this.stack.length; i++) {
      const s = this.stack[i];
      if (s.inst.metersPerUnit) m = s.inst.metersPerUnit;
      else if (s.inst.entryRadius) m = (m * s.portal.radius) / s.inst.entryRadius;
    }
    return m;
  }

  updateScale() {
    if (!this.scaleEl) return;
    const hide = this.current?.showScale === false;   // stylised, non-spatial levels (e.g. the inheritance lab)
    this.scaleEl.style.display = hide ? "none" : "";
    if (hide) return;
    const d = this.camera.position.distanceTo(this.controls.target);
    const wUnits = 2 * d * Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2)) * this.camera.aspect;
    const wm = wUnits * this.metersPerUnit();
    const target = wm / 6;
    const p = Math.pow(10, Math.floor(Math.log10(target)));
    const nice = [1, 2, 5, 10].map((k) => k * p).reduce((a, b) => (Math.abs(b - target) < Math.abs(a - target) ? b : a));
    const px = (nice / wm) * this.w;
    const key = `${nice}|${Math.round(px)}`;
    if (key !== this._scaleKey) {
      this._scaleKey = key;
      this.scaleEl.innerHTML = `<i style="width:${px.toFixed(0)}px"></i><span>${formatLength(nice)}</span>`;
    }
  }

  checkAutoDive() {
    const L = this.current;
    if (this.busy || !L?.portals?.length || !this.lastWheelIn || performance.now() - this.lastWheelIn > 350) return;
    const cam = this.camera.position;
    for (const p of L.portals) {
      if (p.auto === false) continue;
      const C = p.center();
      const d = cam.distanceTo(C);
      if (d < p.radius * 2.2) {
        // only if it's roughly where the user is looking
        const toC = C.clone().sub(cam).normalize(), fwd = this.controls.target.clone().sub(cam).normalize();
        if (toC.dot(fwd) > 0.8) { this.lastWheelIn = 0; this.dive(p); return; }
      }
    }
  }

  render(dt, t) {
    const L = this.current;
    if (this.flight) {
      const f = this.flight;
      f.t = Math.min(1, f.t + dt / f.dur);
      const k = ease(f.t);
      this.controls.target.lerpVectors(f.t0, f.t1, k);
      this.camera.position.lerpVectors(f.p0, f.p1, k);
      if (f.t >= 1) { this.flight = null; f.res(); }
    }
    this.controls.update();
    this.bg.position.copy(this.camera.position);
    this.bg.scale.setScalar(this.camera.far * 0.9);
    this.bg.material.uniforms.t.value = t;
    this.bokeh.uniforms.focus.value = this.camera.position.distanceTo(this.controls.target);
    if (this.hoverPending && !this.busy) {
      this.hoverPending = false;
      const hit = this.pick(this.pointer.x, this.pointer.y);
      this.setHover(hit ? hit.object : null);
    }
    if (!this.paused) this.simT = (this.simT || 0) + dt;
    L?.update?.(this.paused ? 0 : dt, this.simT || 0, dt);   // (sim dt, sim time, real dt for UI refresh)
    if (this.hoverInfo && this.pointer.inside && !this.busy) {
      const r = this.canvas.getBoundingClientRect();
      this.tip.innerHTML = this.hoverInfo.title + (this.hoverInfo.portal ? `<small>double-click or zoom in to enter</small>` : "");
      this.tip.style.display = "";
      this.tip.style.transform = `translate(${this.pointer.x - r.left + 14}px, ${this.pointer.y - r.top + 14}px)`;
    } else this.tip.style.display = "none";
    this.checkAutoDive();
    this.style.tick(dt);
    if (this.quality !== "high" && (this._tierT = (this._tierT || 0) - dt) <= 0) { this._tierT = 1; this.refreshTier(); }   // levels may spawn meshes mid-simulation
    this.updateScale();
    if (this.quality === "low" && !this.scopeActive) this.renderer.render(this.scene, this.camera);
    else {
      // Depth of field stays gentle: the subject (anything within about half the viewing distance of the focus point)
      // stays sharp and only the far background softens. Levels may still request more blur; it is capped here.
      const ub = this.bokeh.uniforms, focus = ub.focus.value;
      if (ub.aperture.value !== this._apCapped) this._apReq = ub.aperture.value;
      ub.aperture.value = this._apCapped = Math.min(this._apReq, ub.maxblur.value / Math.max(1e-6, 0.5 * focus));
      this.composer.render();
    }
    const now = performance.now(), wall = this._wallT ? (now - this._wallT) / 1000 : 0;   // unclamped: K.loop clamps dt to 0.05, which hides < 20 fps
    this._wallT = now;
    this.autoQuality(wall);
  }

  /**
   * Adaptive quality. Averages frame time over ~3 s of real frames (ignoring pauses > 1 s such as a hidden tab or a
   * shader compile), then steps down ONE tier if it is too slow. It never steps back up by itself, and does nothing once
   * the user has picked a quality (lockQuality). In Fast, a still-struggling device drops the pixel ratio to 0.75 once.
   */
  autoQuality(dt) {
    if (!dt || this.lockQuality || this.busy || this.scopeActive || document.hidden) return;
    if (dt > 1) return;                      // a one-off gap (tab resume, shader compile); sustained slow frames still count
    const f = this.frameTimes;
    f.push(dt);
    this.frameSpan += dt;
    if (this.frameSpan < 3 || f.length < 30) return;
    const avg = this.frameSpan / f.length;
    f.length = 0; this.frameSpan = 0;
    if (avg > 1 / 32 && this.quality === "high") this.setQuality("medium");
    else if (avg > 1 / 24 && this.quality === "medium") this.setQuality("low");
    else if (avg > 1 / 20 && this.quality === "low" && this.pixelScale === 1) { this.pixelScale = 0.75; this.resize(); }
  }
}
