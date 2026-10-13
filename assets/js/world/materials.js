// Shared materials and small geometry helpers for CellScape 3D levels.
import * as THREE from "three";

/** Glossy opaque "protein / organelle" material. */
export function physical(color, o = {}) {
  const c = new THREE.Color(color);
  return new THREE.MeshPhysicalMaterial({
    color: c, roughness: 0.32, metalness: 0, clearcoat: 0.85, clearcoatRoughness: 0.22,
    sheen: 0.5, sheenRoughness: 0.5, sheenColor: c.clone().lerp(new THREE.Color("#ffffff"), 0.5),
    ...o,
  });
}

/**
 * Translucent membrane / "glass" material: nearly clear face-on, bright at the rim (fresnel),
 * like the membranes in molecular animation. opts: rim colour, rimPower, minAlpha, maxAlpha.
 */
export function glass(color, opts = {}) {
  const { rim = color, rimPower = 2.2, rimStrength = 0.6, minAlpha = 0.06, maxAlpha = 0.75, side = THREE.FrontSide, ...rest } = opts;
  const m = new THREE.MeshPhysicalMaterial({
    color: new THREE.Color(color), roughness: 0.18, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.1,
    transparent: true, depthWrite: false, side, ...rest,
  });
  const u = { rimColor: { value: new THREE.Color(rim) }, rimPower: { value: rimPower }, rimStrength: { value: rimStrength }, minA: { value: minAlpha }, maxA: { value: maxAlpha } };
  m.userData.glass = u;
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, u);
    sh.fragmentShader = sh.fragmentShader
      .replace("void main() {", "uniform vec3 rimColor; uniform float rimPower, rimStrength, minA, maxA;\nvoid main() {")
      .replace("#include <opaque_fragment>", `
        float fr = pow(1.0 - clamp(abs(dot(normalize(vViewPosition), normal)), 0.0, 1.0), rimPower);
        gl_FragColor = vec4(outgoingLight + rimColor * fr * rimStrength, clamp(mix(minA, maxA, fr), 0.0, 1.0) * opacity);`);
  };
  m.customProgramCacheKey = () => `glass${rimPower}`;
  return m;
}

/** Radial soft dot texture for sprites / points. */
let _dot;
export function softDot() {
  if (_dot) return _dot;
  const cv = document.createElement("canvas");
  cv.width = cv.height = 64;
  const c = cv.getContext("2d"), g = c.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, "rgba(255,255,255,1)"); g.addColorStop(0.35, "rgba(255,255,255,0.35)"); g.addColorStop(1, "rgba(255,255,255,0)");
  c.fillStyle = g; c.fillRect(0, 0, 64, 64);
  _dot = new THREE.CanvasTexture(cv);
  _dot.colorSpace = THREE.SRGBColorSpace;
  _dot.userData.shared = true;
  return _dot;
}

/** Floating specks (cytoplasm particles) in a box. Returns THREE.Points. */
export function specks(n, size, box, colors = ["#5eead4", "#a78bfa", "#fbbf24", "#93c5fd", "#f9a8d4"], opacity = 0.5) {
  const pos = new Float32Array(n * 3), col = new Float32Array(n * 3);
  const pal = colors.map((c) => new THREE.Color(c));
  for (let i = 0; i < n; i++) {
    pos[i * 3] = (Math.random() - 0.5) * box[0]; pos[i * 3 + 1] = (Math.random() - 0.5) * box[1]; pos[i * 3 + 2] = (Math.random() - 0.5) * box[2];
    const c = pal[i % pal.length]; col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  g.setAttribute("color", new THREE.BufferAttribute(col, 3));
  return new THREE.Points(g, new THREE.PointsMaterial({
    size, map: softDot(), vertexColors: true, transparent: true, opacity, depthWrite: false, blending: THREE.AdditiveBlending,
  }));
}

/** Add a vertex-colour attribute of one colour (for merging multi-coloured molecules). */
export function paint(g, color) {
  const c = new THREE.Color(color), n = g.attributes.position.count, a = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { a[i * 3] = c.r; a[i * 3 + 1] = c.g; a[i * 3 + 2] = c.b; }
  g.setAttribute("color", new THREE.BufferAttribute(a, 3));
  if (g.index) g = g.toNonIndexed();
  if (g.attributes.uv) g.deleteAttribute("uv");
  return g;
}

/** Deterministic pseudo-random in [0,1). */
export const hash = (n) => { const s = Math.sin(n * 127.1 + 311.7) * 43758.5453; return s - Math.floor(s); };

/** Displace a geometry's vertices with smooth noise along the normal (organic blobs). */
export function wobble(g, amp = 0.08, freq = 2.0, seed = 0) {
  const p = g.attributes.position, v = new THREE.Vector3(), n = new THREE.Vector3();
  g.computeVertexNormals();
  const nr = g.attributes.normal;
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i); n.fromBufferAttribute(nr, i);
    const k = Math.sin(v.x * freq + seed) * Math.cos(v.y * freq * 1.3 + seed * 2) + 0.5 * Math.sin(v.z * freq * 1.7 + v.x + seed);
    v.addScaledVector(n, k * amp);
    p.setXYZ(i, v.x, v.y, v.z);
  }
  g.computeVertexNormals();
  return g;
}

// ---------- performance tiers ----------
// engine.tier is "high" | "medium" | "low" (the Quality control). applyTier(root, tier) walks a level's root and
// downgrades the expensive MeshPhysicalMaterial features in place, remembering the originals on the material
// (userData._tier) so going back up restores them exactly:
//   high   everything as authored
//   medium sheen and transmission off (transmission falls back to plain alpha)
//   low    also clearcoat off
// Only the "real" look's materials are touched. When the clay style is active the mesh carries a clay material
// (userData.clayMat) and the original sits in userData.realMat: we downgrade realMat (so the real look is already
// correct when the style is switched back, and nothing is restored to a stale value) and never touch clay materials.
export const TIER_RANK = { high: 0, medium: 1, low: 2 };
export const TIER_LOD = { high: 1, medium: 0.75, low: 0.5 };

function setTierOn(m, tier) {
  if (!m || !m.isMeshPhysicalMaterial || m.userData.clay) return false;   // clay materials are tiered by style.js (tierClay)
  const u = m.userData, rank = TIER_RANK[tier] ?? 0;
  if ((u._tierRank ?? 0) === rank && (rank === 0 || u._tier)) return false;
  let o = u._tier;
  if (!o) {
    if (rank === 0) return false;
    o = u._tier = { clearcoat: m.clearcoat, sheen: m.sheen, transmission: m.transmission, transparent: m.transparent, opacity: m.opacity, depthWrite: m.depthWrite };
  }
  m.clearcoat = rank >= 2 ? 0 : o.clearcoat;
  m.sheen = rank >= 1 ? 0 : o.sheen;
  if (o.transmission > 0) {
    if (rank >= 1) { m.transmission = 0; m.transparent = true; m.opacity = Math.min(o.opacity, 0.4); m.depthWrite = false; }
    else { m.transmission = o.transmission; m.transparent = o.transparent; m.opacity = o.opacity; m.depthWrite = o.depthWrite; }
  }
  u._tierRank = rank;
  if (rank === 0) delete u._tier;
  m.needsUpdate = true;   // clearcoat/sheen/transmission toggle shader defines
  return true;
}

function eachMat(v, fn) { if (Array.isArray(v)) v.forEach((m) => eachMat(m, fn)); else if (v) fn(v); }

/** Apply a performance tier to everything under root (materials, and InstancedMesh.count for userData.lod meshes). */
export function applyTier(root, tier, lodScale = TIER_LOD[tier] ?? 1) {
  if (!root) return;
  root.traverse((o) => {
    if (!(o.isMesh || o.isPoints || o.isLine)) return;
    const u = o.userData;
    if (o.isMesh) {
      if (u.realMat) eachMat(u.realMat, (m) => setTierOn(m, tier));   // clay style active: the real material is stashed
      else eachMat(o.material, (m) => setTierOn(m, tier));
    }
    if (o.isInstancedMesh && u.lod) {
      const full = u.lodCount ?? o.instanceMatrix.count;
      const n = Math.max(1, Math.ceil(full * lodScale));
      if (o.count !== n) o.count = n;
    }
  });
}
