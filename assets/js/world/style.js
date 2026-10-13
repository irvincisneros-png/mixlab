// Art styles for the CellScape world: "real" (the default glassy look) and "clay" (a pastel plasticine
// diorama inspired by AI "clay model" cell videos). Engine.setStyle(name) drives this.
//
// Clay in a nutshell:
//   * every Mesh / InstancedMesh under a level's root gets a matte pastel MeshPhysicalMaterial (cached per
//     original material; the original is kept in userData.realMat so "real" restores it exactly);
//   * Points, additive sprites/meshes and lines are hidden by swapping in an invisible material (robust against
//     levels toggling .visible themselves);
//   * a tiling clay height texture is sampled triplanar in the fragment shader, so any geometry (even without
//     UVs) gets fine plasticine bumps;
//   * the studio rig (hemisphere + soft key with shadows + fill) replaces the engine lights, the background becomes
//     a warm light grey, bloom is off and the depth of field is stronger.
// Levels can customise through optional hooks/fields (all optional):
//   inst.onStyle(name)          called after the swap, e.g. to lay the cell out as a cut-away diorama
//   inst.clay = { groundY, groundR, shadow, freq, amount }   pedestal / shadow framing / bump scale
//   inst.clayEnv                partial env overrides while in clay
//   mesh.userData.clayColor     explicit clay colour (hex) instead of the nearest-pastel mapping
//   mesh.userData.clayHide      hide this object in clay
//   mesh.userData.keepMaterial  leave this object alone (e.g. glowing dive markers)
//   material.userData.clayPatch(shader, renderer) + clayPatchKey   an onBeforeCompile patch (hole cut-aways, glow bands) re-applied on top of the clay shader
import * as THREE from "three";

const CLAY_ENV = { bg: ["#f4efea", "#ddd6cf", "#e8e2dc"], fog: ["#d9d2cb", 0], exposure: 0.92, bloom: [0, 0.4, 1], aperture: 0.0016 };

// curated pastel table: [hue in degrees, hex]
const PAL = [
  [268, "#c5b3ea"], [236, "#a1b1ef"], [212, "#8fbdea"], [182, "#92d3cf"], [152, "#a6ddc2"], [128, "#a3d9a8"],
  [78, "#d9e5a4"], [48, "#f4e3b8"], [27, "#f8c29d"], [6, "#f3a798"], [342, "#f0b0c9"], [312, "#dba8d1"],
];
const smoothstep = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const _hsl = { h: 0, s: 0, l: 0 };
const _tmp = new THREE.Color();
const PAL_COL = PAL.map(([h, hex]) => [h, new THREE.Color(hex)]);
const CREAM = new THREE.Color("#f1e9db"), GREYLILAC = new THREE.Color("#d2c9d9");

/** Map any colour to the nearest curated pastel by hue (keeps hue identity: orange stays peach, green stays mint). */
export function pastelOf(color, out = new THREE.Color()) {
  color.getHSL(_hsl, THREE.SRGBColorSpace);
  const k = 0.8 + 0.2 * smoothstep(0.1, 0.5, _hsl.l);
  if (_hsl.l > 0.86 && _hsl.s < 0.6) return out.copy(CREAM);                  // whites and near-whites (starch, glucose, plaque) read as cream clay
  if (_hsl.s < 0.12) return out.copy(_hsl.l > 0.6 ? CREAM : GREYLILAC).multiplyScalar(_hsl.l > 0.6 ? 1 : 0.92 * k + 0.08);
  const h = _hsl.h * 360;
  let best = PAL_COL[0], bd = 1e9;
  for (const e of PAL_COL) { const d = Math.min(Math.abs(e[0] - h), 360 - Math.abs(e[0] - h)); if (d < bd) { bd = d; best = e; } }
  return out.copy(best[1]).multiplyScalar(k);
}

/** Keep only the part of a geometry at or below the plane y = cut (the lower half of a shell). Returns a new non-indexed geometry. */
export function clipGeometryBelow(src, cut) {
  const g = src.index ? src.toNonIndexed() : src;
  if (!g.attributes.normal) g.computeVertexNormals();
  const P = g.attributes.position, N = g.attributes.normal, n = P.count;
  const pos = [], nor = [];
  const V = (i) => ({ x: P.getX(i), y: P.getY(i), z: P.getZ(i), nx: N.getX(i), ny: N.getY(i), nz: N.getZ(i) });
  const mix = (a, b) => { const t = (cut - a.y) / (b.y - a.y); return { x: a.x + (b.x - a.x) * t, y: cut, z: a.z + (b.z - a.z) * t, nx: a.nx + (b.nx - a.nx) * t, ny: a.ny + (b.ny - a.ny) * t, nz: a.nz + (b.nz - a.nz) * t }; };
  const push = (v) => { pos.push(v.x, v.y, v.z); const l = Math.hypot(v.nx, v.ny, v.nz) || 1; nor.push(v.nx / l, v.ny / l, v.nz / l); };
  for (let i = 0; i < n; i += 3) {
    const t = [V(i), V(i + 1), V(i + 2)], poly = [];
    for (let k = 0; k < 3; k++) {
      const a = t[k], b = t[(k + 1) % 3], ia = a.y <= cut, ib = b.y <= cut;
      if (ia) poly.push(a);
      if (ia !== ib) poly.push(mix(a, b));
    }
    for (let k = 1; k + 1 < poly.length; k++) { push(poly[0]); push(poly[k]); push(poly[k + 1]); }
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  out.setAttribute("normal", new THREE.Float32BufferAttribute(nor, 3));
  if (g !== src) g.dispose();
  return out;
}

/** Outline of a rounded rectangle in the x-z plane (counter-clockwise), as [[x, z], ...]. */
export function roundedRectPts(hx, hz, r, seg = 10) {
  r = Math.max(0.01, Math.min(r, hx, hz));
  const pts = [];
  for (const [cx, cz, a0] of [[hx - r, hz - r, 0], [-(hx - r), hz - r, 0.5], [-(hx - r), -(hz - r), 1], [hx - r, -(hz - r), 1.5]]) {
    for (let i = 0; i <= seg; i++) { const a = (a0 + (i / seg) * 0.5) * Math.PI; pts.push([cx + Math.cos(a) * r, cz + Math.sin(a) * r]); }
  }
  return pts;
}

/**
 * A soft-edged clay slab from an x-z outline (and an optional inner outline, making a ring). Its base is at
 * y = 0 and its top at y = height, with a small bevel. Points are [[x, z], ...].
 */
export function slabGeometry(outer, inner, height, bevel = 0.14) {
  const sh = new THREE.Shape(outer.map(([x, z]) => new THREE.Vector2(x, -z)));
  if (inner) sh.holes.push(new THREE.Path(inner.map(([x, z]) => new THREE.Vector2(x, -z))));
  const b = Math.min(bevel, height * 0.45);
  const g = new THREE.ExtrudeGeometry(sh, { depth: Math.max(0.01, height - 2 * b), bevelEnabled: true, bevelThickness: b, bevelSize: b, bevelOffset: -b, bevelSegments: 2, curveSegments: 1 });
  g.rotateX(-Math.PI / 2);
  g.translate(0, b, 0);
  return g;
}

/** A clay material for use by levels' own clay-only parts (floor slab, rims...). */
export function clayMaterial(style, color, opts = {}) { return style.makeClay(new THREE.Color(color), opts); }

/** Tileable procedural height noise: used immediately, and replaced by assets/textures/clay-height.png once it loads. */
function proceduralHeight(n = 128) {
  const data = new Uint8Array(n * n * 4);
  const oct = [[8, 0.55], [16, 0.3], [32, 0.15]];
  const grids = oct.map(([f], i) => { const g = new Float32Array(f * f); for (let k = 0; k < g.length; k++) g[k] = Math.abs(Math.sin((k + 1) * 12.9898 + i * 78.233) * 43758.5453) % 1; return g; });
  const sm = (t) => t * t * (3 - 2 * t);
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    let v = 0;
    oct.forEach(([f, w], i) => {
      const gx = (x / n) * f, gy = (y / n) * f, x0 = Math.floor(gx), y0 = Math.floor(gy), tx = sm(gx - x0), ty = sm(gy - y0), g = grids[i];
      const a = g[(y0 % f) * f + (x0 % f)], b = g[(y0 % f) * f + ((x0 + 1) % f)], c = g[((y0 + 1) % f) * f + (x0 % f)], d = g[((y0 + 1) % f) * f + ((x0 + 1) % f)];
      v += w * (a + (b - a) * tx + (c - a) * ty + (a - b - c + d) * tx * ty);
    });
    const o = (y * n + x) * 4, u = Math.max(0, Math.min(255, Math.round(v * 255)));
    data[o] = data[o + 1] = data[o + 2] = u; data[o + 3] = 255;
  }
  const t = new THREE.DataTexture(data, n, n, THREE.RGBAFormat);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.magFilter = THREE.LinearFilter; t.minFilter = THREE.LinearMipmapLinearFilter; t.generateMipmaps = true; t.needsUpdate = true;
  return t;
}

export class StyleManager {
  constructor(engine) {
    this.engine = engine;
    this.name = "real";
    this.tex = proceduralHeight();
    this.tex.userData.shared = true;
    this.U = { tex: { value: this.tex }, freq: { value: 0.12 }, amt: { value: 0.5 } };
    this.hiddenMat = new THREE.MeshBasicMaterial({ visible: false });
    this.hiddenMat.userData.shared = true;
    this.hiddenPts = new THREE.PointsMaterial({ visible: false });
    this.hiddenPts.userData.shared = true;
    this.hiddenLine = new THREE.LineBasicMaterial({ visible: false });
    this.hiddenLine.userData.shared = true;
    this.cache = new WeakMap();      // original material -> clay material (kept so switching is cheap)
    this.sweepT = 0;
    this.rig = null;
    this.ground = null;
    this.loadTexture();
    this.injectCss();
  }

  get clay() { return this.name === "clay"; }

  loadTexture() {
    const url = `${this.engine.root || ""}assets/textures/clay-height.png`;
    new THREE.TextureLoader().load(url, (t) => {
      t.wrapS = t.wrapT = THREE.RepeatWrapping;
      t.colorSpace = THREE.NoColorSpace;
      t.anisotropy = 4;
      t.userData.shared = true;
      this.tex.dispose();
      this.tex = t;
      this.U.tex.value = t;
    }, undefined, () => { /* keep the procedural texture */ });
  }

  injectCss() {
    if (document.getElementById("cs-clay-css")) return;
    const s = document.createElement("style");
    s.id = "cs-clay-css";
    s.textContent = `
      .style-clay .cs-scale, .style-clay .cs-scale span { color: #3f3832; text-shadow: none; }
      .style-clay .cs-scale i { background: #3f3832; }
      .style-clay .cs-hint, .style-clay .lbl3d.dive, .style-clay .lbl3d.org, .style-clay .lbl3d.cs-tip {
        background: rgba(17, 26, 40, 0.94) !important; color: #eef5f6 !important; border-color: rgba(94, 234, 212, 0.55); text-shadow: none; }
      .style-clay .cs-hint { padding: 4px 9px; border-radius: 8px; }
      .style-clay .lbl3d.org small, .style-clay .lbl3d.cs-tip small { color: #b9c7d4 !important; }
      .style-clay .lbl3d[data-csclay="light"] { color: #3b322c !important; text-shadow: 0 0 5px #fbf6ef, 0 0 9px #fbf6ef, 0 1px 2px rgba(251,246,239,0.9) !important; }
      .style-clay .lbl3d[data-csclay="light"] small { color: #6a5d54 !important; }`;
    document.head.appendChild(s);
  }

  // ---------- materials ----------
  makeClay(color, { vc = false, side = THREE.FrontSide, pastelShader = false, opacity = 1 } = {}) {   // vc: geometry has a colour attribute; pastelShader: colours come from vertices/instances
    const m = new THREE.MeshPhysicalMaterial({
      color, roughness: 0.6, metalness: 0, clearcoat: 0.3, clearcoatRoughness: 0.5,
      sheen: 0.4, sheenRoughness: 0.7, sheenColor: color.clone().lerp(new THREE.Color("#ffffff"), 0.6),
      side, vertexColors: vc,
      ...(opacity < 1 ? { transparent: true, opacity, depthWrite: false } : {}),
    });
    m.userData.clay = true;                  // so other systems (quality tiers) can recognise a clay stand-in
    this.tierClay(m);
    const U = this.U, pastel = pastelShader;
    m.onBeforeCompile = (sh) => {
      sh.uniforms.uClayTex = U.tex; sh.uniforms.uClayFreq = U.freq; sh.uniforms.uClayAmt = U.amt;
      sh.vertexShader = sh.vertexShader
        .replace("#include <common>", "#include <common>\nvarying vec3 vClayP; varying vec3 vClayN;")
        .replace("#include <begin_vertex>", "#include <begin_vertex>\nvClayP = transformed; vClayN = normal;");
      let f = sh.fragmentShader
        .replace("#include <common>", "#include <common>\nvarying vec3 vClayP; varying vec3 vClayN; uniform sampler2D uClayTex; uniform float uClayFreq; uniform float uClayAmt;")
        .replace("#include <normal_fragment_maps>", `#include <normal_fragment_maps>
          {
            vec3 bw = pow(abs(vClayN), vec3(4.0)); bw /= (bw.x + bw.y + bw.z + 1e-4);
            vec3 cp = vClayP * uClayFreq;
            // two octaves (a soft lumpy one plus a finer one), sampled with a mip bias so the surface reads as smooth plasticine, not grain
            vec3 cq = cp * 0.31;
            float h = 0.62 * (texture2D(uClayTex, cq.yz, 0.6).r * bw.x + texture2D(uClayTex, cq.xz + 0.19, 0.6).r * bw.y + texture2D(uClayTex, cq.xy + 0.53, 0.6).r * bw.z)
                    + 0.38 * (texture2D(uClayTex, cp.yz, 1.6).r * bw.x + texture2D(uClayTex, cp.xz + 0.37, 1.6).r * bw.y + texture2D(uClayTex, cp.xy + 0.71, 1.6).r * bw.z);
            vec2 dh = vec2(dFdx(h), dFdy(h));
            vec3 sx = dFdx(-vViewPosition), sy = dFdy(-vViewPosition);
            vec3 r1 = cross(sy, normal), r2 = cross(normal, sx);
            float det = dot(sx, r1) * faceDirection;
            vec3 gr = sign(det) * (dh.x * r1 + dh.y * r2);
            normal = normalize(abs(det) * normal - uClayAmt * gr);
          }`);
      if (pastel) f = f.replace("#include <color_fragment>", `#include <color_fragment>
          {   // per-vertex / per-instance colours of any depth become pastels of the same hue: keep the hue, lift the value, cap the saturation
            vec3 c0 = diffuseColor.rgb; float mx = max(max(c0.r, c0.g), c0.b), mn = min(min(c0.r, c0.g), c0.b);
            float sat = mx > 1e-4 ? (mx - mn) / mx : 0.0;
            vec3 hue = mx > 1e-4 ? c0 / mx : vec3(1.0);
            vec3 pc = mix(vec3(1.0), hue, clamp(sat * 0.8, 0.0, 0.8)) * (0.5 + 0.5 * pow(mx, 0.5));
            float lift = 1.0 - smoothstep(0.3, 0.85, mx);                         // only dark colours need pastelising; light ones are already pastel
            vec3 res = mix(c0, pc, lift) * 0.94;
            res = mix(res, vec3(0.64, 0.58, 0.82) * (0.62 + 0.38 * mx), (1.0 - smoothstep(0.04, 0.22, sat)) * 0.85);   // near-greys and whites (backbones, scaffolds) become soft periwinkle, not white-on-white
            float rl = dot(res, vec3(0.299, 0.587, 0.114));
            diffuseColor.rgb = max(vec3(0.0), mix(vec3(rl), res, 1.3));   // a touch more chroma so pastel never turns chalky
          }`);
      sh.fragmentShader = f;
    };
    m.customProgramCacheKey = () => `clay2${pastel ? "p" : ""}`;
    return m;
  }

  /** Cheaper clay on slower tiers: Fast drops clearcoat and sheen (two extra lobes per pixel), Balanced drops sheen. Restores on Cinematic. */
  tierClay(m, q = this.engine.quality) {
    const cc = q === "low" ? 0 : 0.3, sh = q === "high" ? 0.4 : 0;
    if (m.clearcoat !== cc || m.sheen !== sh) { m.clearcoat = cc; m.sheen = sh; m.needsUpdate = true; }
  }

  clayFor(orig, o) {
    if (Array.isArray(orig)) return orig.map((m) => this.clayFor(m, o));
    const vc = !!orig.vertexColors, perInst = !!(o.isInstancedMesh && o.instanceColor), tinted = vc || perInst;
    // enclosing glass shells (low alpha) and other see-through parts stay see-through so the action inside remains visible
    const g = orig.userData?.glass, gBase = g ? (g.maxA.value <= 0.5 ? Math.min(0.26, Math.max(0.12, g.maxA.value * 0.65)) : 1) : 1, lv0 = g ? orig.opacity : orig.transparent && orig.opacity < 0.9 ? Math.max(0.15, orig.opacity) : 1;
    const opacity = gBase * lv0;
    const op = o.userData.clayOpacity ?? opacity, dbl = o.userData.claySide === "double" || orig.side === THREE.DoubleSide;
    const back = !dbl && orig.side === THREE.BackSide;                     // an inside-out shell (a room seen from inside) stays inside-out
    const key = `${vc ? "v" : "p"}${perInst ? "i" : ""}${op}${dbl ? "d" : back ? "b" : ""}${o.userData.clayColor || ""}`;
    let per = this.cache.get(orig);
    if (!per) this.cache.set(orig, (per = {}));
    if (per[key]) { per[key].userData.opReset?.(o.userData.clayOpacity !== undefined ? op : lv0); return per[key]; }   // reused: start from the real material's current fade
    const color = o.userData.clayColor ? new THREE.Color(o.userData.clayColor) : tinted ? (orig.color || new THREE.Color("#ffffff")).clone() : pastelOf(orig.color || new THREE.Color("#cccccc"));
    const m = (per[key] = this.makeClay(color, { vc, pastelShader: tinted, opacity: op, side: dbl ? THREE.DoubleSide : back ? THREE.BackSide : THREE.FrontSide }));
    if (o.userData.clayOpacity !== undefined) this.linkOpacity(m, 1, op); else this.linkOpacity(m, gBase, lv0);
    this.syncClip(orig, m);
    // a realistic material may carry a shader patch that still matters in clay (cut-away holes, glowing bands): re-apply it on top of the clay shader
    const patch = orig.userData?.clayPatch;
    if (patch) {
      const base = m.onBeforeCompile, key = m.customProgramCacheKey;
      m.onBeforeCompile = (sh, r) => { base(sh, r); patch(sh, r); };
      m.customProgramCacheKey = () => `${key.call(m)}+${orig.userData.clayPatchKey || "patch"}`;
    }
    return m;
  }

  /**
   * Levels fade parts by writing material.opacity (nucleus fading in, a cell disappearing...) and don't know the clay
   * material is standing in. Keep that working: the written value is multiplied by the clay see-through factor (so a
   * glass shell that is 20 % in clay stays 20 % x fade) and the material flips transparent only while it is below 1.
   */
  linkOpacity(m, base, written) {
    let lv = written;
    const apply = () => { const t = lv * base < 0.999; if (m.transparent !== t) { m.transparent = t; m.depthWrite = !t; m.needsUpdate = true; } };
    Object.defineProperty(m, "opacity", {
      configurable: true, enumerable: true,
      get: () => lv * base,
      set: (v) => { lv = v; m.userData.opWritten = v; apply(); },
    });
    m.userData.opReset = (v) => { lv = v; delete m.userData.opWritten; apply(); };    // start again from the real material's fade (not a level's write)
  }

  /** Levels cut shells open with clipping planes (e.g. the nucleus "near side is cut away"): keep that in clay. */
  syncClip(orig, m) {
    if (m.clippingPlanes !== orig.clippingPlanes) { m.clippingPlanes = orig.clippingPlanes; m.needsUpdate = true; }
    m.clipIntersection = orig.clipIntersection; m.clipShadows = orig.clipShadows;
  }

  isGlowOnly(m) {
    return m.blending === THREE.AdditiveBlending || (m.isMeshBasicMaterial && m.transparent && m.opacity < 0.35);
  }

  /**
   * Labels are DOM text, mostly written for the dark backdrop (pale text, dark halo). On the light clay backdrop those
   * vanish, so any label with pale text and no pill background of its own is tagged once and restyled by the CSS above.
   */
  fixLabels() {
    const L = document.querySelectorAll(".lbl3d:not([data-csclay])");
    for (let i = 0; i < L.length; i++) {
      const el = L[i], cs = getComputedStyle(el);
      const bg = cs.backgroundColor.match(/[\d.]+/g) || [0, 0, 0, 0], col = cs.color.match(/[\d.]+/g) || [0, 0, 0];
      const hasPill = (bg.length > 3 ? +bg[3] : 1) > 0.3;
      const lum = (0.299 * col[0] + 0.587 * col[1] + 0.114 * col[2]) / 255;
      el.dataset.csclay = !hasPill && lum > 0.62 ? "light" : "ok";
    }
  }

  // ---------- applying a style to a level ----------
  applyTo(inst, name = this.name) {
    if (!inst?.root) return;
    const clay = name === "clay";
    inst.root.traverse((o) => {
      if (o.isLight) {
        if (clay && o.userData._lv === undefined) { o.userData._lv = o.visible; o.visible = false; }
        else if (!clay && o.userData._lv !== undefined) { o.visible = o.userData._lv; delete o.userData._lv; }
        return;
      }
      if (!(o.isMesh || o.isPoints || o.isLine || o.isSprite)) return;
      if (clay && o.userData.styled === "clay" && o.userData.realMat !== undefined && !this.isStandIn(o)) delete o.userData.styled;   // the level put a material of its own back on: restyle it
      if (clay) { this.toClay(o); const u = o.userData; if (u.realMat && u.clayMat && !Array.isArray(u.realMat) && !Array.isArray(u.clayMat)) this.syncClip(u.realMat, u.clayMat); }
      else this.toReal(o);
    });
  }

  /** True while the mesh still carries the material this manager put on it (a clay or hidden stand-in). */
  isStandIn(o) {
    const m = o.material, u = o.userData;
    return m === u.clayMat || m === this.hiddenMat || m === this.hiddenPts || m === this.hiddenLine || !!m?.userData?.clay || (Array.isArray(m) && m.every((x) => x.userData.clay));
  }

  toClay(o) {
    const u = o.userData;
    if (u.styled === "clay") return;
    u.styled = "clay";
    if (u.keepMaterial) return;
    const orig = o.material;
    if (!orig) return;
    if (o.isSprite) {
      // additive glows (selection halo) become plain alpha sprites so they still read on the light backdrop
      if (orig.blending === THREE.AdditiveBlending) {
        orig.userData._blend = orig.blending; orig.userData._dt = orig.depthTest;
        orig.blending = THREE.NormalBlending; orig.depthTest = false;       // opaque clay would otherwise hide a halo centred inside an organelle
        orig.needsUpdate = true;
      }
      return;
    }
    let mat;
    if (o.isPoints) mat = this.hiddenPts;
    else if (o.isLine) mat = this.hiddenLine;
    else {
      const first = Array.isArray(orig) ? orig[0] : orig;
      if (u.clayHide || this.isGlowOnly(first)) mat = this.hiddenMat;
      else if (!first.visible) return;                       // an invisible pick handle: leave alone
      else {
        const g = o.geometry;
        if (g && g.attributes.position && !g.attributes.normal) g.computeVertexNormals();
        mat = this.clayFor(orig, o);
        u.clayMat = mat;
        if (!u.shadowFlags) u.shadowFlags = [o.castShadow, o.receiveShadow];
        const solid = !mat.transparent;
        o.castShadow = solid; o.receiveShadow = true;
      }
    }
    u.realMat = orig;
    if (mat === this.hiddenMat) u.clayHidden = true;
    o.material = mat;
  }

  toReal(o) {
    const u = o.userData;
    if (u.styled !== "clay") return;
    delete u.styled;
    if (o.isSprite) {
      const m = o.material;
      if (m?.userData._blend !== undefined) { m.blending = m.userData._blend; m.depthTest = m.userData._dt; delete m.userData._blend; delete m.userData._dt; m.needsUpdate = true; }
      return;
    }
    if (u.realMat) {
      // a level may have faded this part while clay was on (it wrote to the clay material): hand the value back
      const cm = u.clayMat, r = u.realMat;
      if (!Array.isArray(cm) && cm?.userData?.opWritten !== undefined && !Array.isArray(r)) { r.opacity = cm.userData.opWritten; delete cm.userData.opWritten; }
      o.material = r; delete u.realMat;
    }
    if (u.shadowFlags) { [o.castShadow, o.receiveShadow] = u.shadowFlags; delete u.shadowFlags; }
    delete u.clayHidden;
  }

  // ---------- environment ----------
  /** Called by Engine.applyEnv with the merged env; returns the env to use. */
  env(e, inst) {
    if (!this.clay) return e;
    const c = { ...CLAY_ENV, aperture: Math.max(e.aperture * 1.3, CLAY_ENV.aperture * 0.25), ...(inst?.clayEnv || {}) };
    return { ...e, ...c };
  }

  ensureRig() {
    if (this.rig) return this.rig;
    const g = new THREE.Group();
    g.add(new THREE.HemisphereLight("#fff8f0", "#cfc3ba", 0.45));
    const key = new THREE.DirectionalLight("#fff1e0", 2.9);
    key.position.set(-30, 60, 40);
    key.shadow.mapSize.set(2048, 2048);
    key.shadow.bias = -0.0004;
    key.shadow.normalBias = 0.25;
    const fill = new THREE.DirectionalLight("#dfe8ff", 0.55);
    fill.position.set(40, 20, 30);
    const back = new THREE.DirectionalLight("#ffe9e2", 0.4);
    back.position.set(0, 25, -50);
    g.add(key, key.target, fill, back);
    g.visible = false;
    this.engine.scene.add(g);
    this.rig = g;
    this.key = key;
    return g;
  }

  ensureGround() {
    if (this.ground) return this.ground;
    const cv = document.createElement("canvas");
    cv.width = cv.height = 128;
    const c = cv.getContext("2d"), gr = c.createRadialGradient(64, 64, 8, 64, 64, 64);
    gr.addColorStop(0, "rgba(60,45,40,0.55)"); gr.addColorStop(0.55, "rgba(60,45,40,0.22)"); gr.addColorStop(1, "rgba(60,45,40,0)");
    c.fillStyle = gr; c.fillRect(0, 0, 128, 128);
    const tex = new THREE.CanvasTexture(cv);
    tex.userData.shared = true;
    const g = new THREE.Group();
    const catcher = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.ShadowMaterial({ opacity: 0.3, color: "#6a5a52" }));
    catcher.rotation.x = -Math.PI / 2; catcher.receiveShadow = true; catcher.name = "clay-catcher";
    const aoSpot = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, fog: false }));
    aoSpot.rotation.x = -Math.PI / 2; aoSpot.position.y = 0.02; aoSpot.renderOrder = -10; aoSpot.name = "clay-ao";
    g.add(aoSpot, catcher);
    g.userData.parts = { catcher, aoSpot, tex };
    this.ground = g;
    return g;
  }

  /** Shared soft radial blob (dark centre fading out): used for contact-shadow decals. */
  get blobTexture() { return this.ensureGround().userData.parts.tex; }

  /** Called when a level is mounted or the style changes. */
  attach(inst) {
    const eng = this.engine, clay = this.clay;
    eng.scene.environmentIntensity = clay ? 0.6 : 0.55;
    eng.renderer.toneMapping = clay ? THREE.NeutralToneMapping : THREE.ACESFilmicToneMapping;
    document.body.classList.toggle("style-clay", clay);
    eng.stageEl?.classList.toggle("style-clay", clay);
    const rig = this.ensureRig();
    rig.visible = clay;
    if (eng.lights) eng.lights.visible = !clay;
    const gnd = this.ensureGround();
    if (clay && inst?.clay?.groundY !== undefined) {
      const r = inst.clay.groundR || 60, { catcher, aoSpot } = gnd.userData.parts;
      gnd.position.set(0, inst.clay.groundY, 0);
      catcher.scale.set(r * 3, r * 3, 1); aoSpot.scale.set(r * 1.9, r * 1.9, 1);
      if (!gnd.parent) eng.scene.add(gnd);
    } else gnd.parent?.remove(gnd);
    if (clay && this.key) {
      const size = inst?.clay?.shadow ?? Math.max(30, (inst?.view?.distance || 60) * 0.45);
      const c = this.key.shadow.camera;
      c.left = c.bottom = -size; c.right = c.top = size; c.near = 1; c.far = size * 8;
      const y = inst?.clay?.groundY ?? 0;
      this.key.target.position.set(0, y * 0.4, 0);
      this.key.position.set(-size * 1.05, size * 1.0, size * 0.75);
      c.updateProjectionMatrix();
      this.key.target.updateMatrixWorld();
    }
    const f = inst?.clay?.freq ?? 0.14 * (60 / Math.max(20, inst?.view?.distance || 60)) * 0.6;
    this.U.freq.value = f;
    this.U.amt.value = inst?.clay?.amount ?? 0.7 / Math.max(0.2, f * 6);
    this.refreshQuality();
  }

  detach() {
    this.ground?.parent?.remove(this.ground);
  }

  refreshQuality() {
    this.engine.current?.root.traverse((o) => {
      if (!o.isMesh) return;
      for (const m of Array.isArray(o.material) ? o.material : [o.material]) if (m?.userData?.clay) this.tierClay(m);   // incl. kit materials and arrays
    });
    if (!this.key) return;
    const q = this.engine.quality, on = this.clay && q !== "low";
    if (this.key.castShadow !== on) this.key.castShadow = on;
    const s = q === "high" ? 2048 : 1024;
    if (this.key.shadow.mapSize.x !== s) { this.key.shadow.mapSize.set(s, s); this.key.shadow.map?.dispose(); this.key.shadow.map = null; }
  }

  /** Switch style; re-applies to the current level. */
  set(name) {
    this.name = name === "clay" ? "clay" : "real";
    const eng = this.engine, inst = eng.current;
    if (!inst) return;
    eng.applyEnv(inst.env, inst);
    this.applyTo(inst);
    this.attach(inst);
    this.fixLabels();
    if ((inst._hookStyle || "real") !== this.name) { inst._hookStyle = this.name; inst.onStyle?.(this.name, true); }
    eng.refreshPost();
  }

  /** Per-frame upkeep: restyle parts a level created after the swap (e.g. spawned mid-simulation). */
  tick(dt) {
    if (!this.clay) return;
    // some levels scale the fog with the zoom every frame (tuned for a dark backdrop): on the light clay backdrop it only washes colours out
    const fog = this.engine.scene.fog;
    if (fog && fog.density > 0) {
      const d = Math.max(0.5, this.engine.camera.position.distanceTo(this.engine.controls.target));
      if (fog.density * d > 0.2) fog.density = 0.2 / d;
    }
    if ((this.sweepT -= dt) > 0) return;
    this.sweepT = 0.6;
    this.applyTo(this.engine.current);
    this.fixLabels();
  }
}
