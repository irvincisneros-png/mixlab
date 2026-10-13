// Teacher link builder (teacher.html): choose a start level, year level and options, get a URL, copy button and QR code.
// Includes a small dependency-free QR encoder (byte mode, error correction M, versions 1-14). No network at runtime.

// ---------------------------------------------------------------- QR encoder
// [EC codewords per block, blocks in group 1, data codewords per group-1 block, blocks in group 2, data per group-2 block]
const EC_M = [null, [10, 1, 16, 0, 0], [16, 1, 28, 0, 0], [26, 1, 44, 0, 0], [18, 2, 32, 0, 0], [24, 2, 43, 0, 0], [16, 4, 27, 0, 0],
  [18, 4, 31, 0, 0], [22, 2, 38, 2, 39], [22, 3, 36, 2, 37], [26, 4, 43, 1, 44], [30, 1, 50, 4, 51], [22, 6, 36, 2, 37],
  [22, 8, 37, 1, 38], [24, 4, 40, 5, 41]];
const ALIGN = [null, [], [6, 18], [6, 22], [6, 26], [6, 30], [6, 34], [6, 22, 38], [6, 24, 42], [6, 26, 46], [6, 28, 50],
  [6, 30, 54], [6, 32, 58], [6, 34, 62], [6, 26, 46, 66]];
const MAX_VERSION = 14;

const EXP = new Uint8Array(512), LOG = new Uint8Array(256);
for (let i = 0, x = 1; i < 255; i++) { EXP[i] = x; LOG[x] = i; x <<= 1; if (x & 256) x ^= 0x11d; }
for (let i = 255; i < 512; i++) EXP[i] = EXP[i - 255];
const gmul = (a, b) => (a && b ? EXP[LOG[a] + LOG[b]] : 0);

function rsGenerator(deg) {
  let g = [1];
  for (let i = 0; i < deg; i++) {
    const next = new Array(g.length + 1).fill(0);
    for (let j = 0; j < g.length; j++) { next[j] ^= g[j]; next[j + 1] ^= gmul(g[j], EXP[i]); }
    g = next;
  }
  return g;
}
export function rsRemainder(data, deg) {
  const gen = rsGenerator(deg), res = new Array(deg).fill(0);
  for (const b of data) {
    const f = b ^ res.shift();
    res.push(0);
    if (f) for (let i = 0; i < deg; i++) res[i] ^= gmul(gen[i + 1], f);
  }
  return res;
}

function dataCapacity(v) { const e = EC_M[v]; return e[1] * e[2] + e[3] * e[4]; }

function utf8(str) { return Array.from(new TextEncoder().encode(str)); }

/** Returns { size, modules: boolean[][] (true = dark), version, mask } or null if the text is too long. */
export function qrEncode(text) {
  const bytes = utf8(text);
  let ver = 0;
  for (let v = 1; v <= MAX_VERSION; v++) {
    const lenBits = v < 10 ? 8 : 16;
    if (4 + lenBits + bytes.length * 8 <= dataCapacity(v) * 8) { ver = v; break; }
  }
  if (!ver) return null;
  // bit stream: mode 0100, length, data, terminator, pad
  const bits = [];
  const put = (val, n) => { for (let i = n - 1; i >= 0; i--) bits.push((val >>> i) & 1); };
  put(4, 4); put(bytes.length, ver < 10 ? 8 : 16);
  for (const b of bytes) put(b, 8);
  const cap = dataCapacity(ver) * 8;
  put(0, Math.min(4, cap - bits.length));
  while (bits.length % 8) bits.push(0);
  for (let pad = 0xec; bits.length < cap; pad ^= 0xec ^ 0x11) put(pad, 8);
  const data = [];
  for (let i = 0; i < bits.length; i += 8) { let b = 0; for (let j = 0; j < 8; j++) b = (b << 1) | bits[i + j]; data.push(b); }

  // split into blocks, add error correction, interleave
  const [ecLen, n1, d1, n2, d2] = EC_M[ver];
  const blocks = [], ecs = [];
  let pos = 0;
  for (let i = 0; i < n1 + n2; i++) {
    const len = i < n1 ? d1 : d2;
    const blk = data.slice(pos, pos + len); pos += len;
    blocks.push(blk); ecs.push(rsRemainder(blk, ecLen));
  }
  const codewords = [];
  for (let i = 0; i < Math.max(d1, d2); i++) for (const b of blocks) if (i < b.length) codewords.push(b[i]);
  for (let i = 0; i < ecLen; i++) for (const e of ecs) codewords.push(e[i]);

  // matrix
  const size = ver * 4 + 17;
  const mod = Array.from({ length: size }, () => new Array(size).fill(false));
  const fn = Array.from({ length: size }, () => new Array(size).fill(false));   // function-pattern modules
  const set = (x, y, dark) => { mod[y][x] = dark; fn[y][x] = true; };
  const finder = (cx, cy) => {
    for (let dy = -4; dy <= 4; dy++) for (let dx = -4; dx <= 4; dx++) {
      const x = cx + dx, y = cy + dy;
      if (x < 0 || y < 0 || x >= size || y >= size) continue;
      const d = Math.max(Math.abs(dx), Math.abs(dy));
      set(x, y, d !== 4 && d !== 2);
    }
  };
  finder(3, 3); finder(size - 4, 3); finder(3, size - 4);
  for (let i = 8; i < size - 8; i++) { set(i, 6, i % 2 === 0); set(6, i, i % 2 === 0); }   // timing
  const al = ALIGN[ver];
  for (const ay of al) for (const ax of al) {
    if ((ax === 6 && ay === 6) || (ax === 6 && ay === al.at(-1)) || (ax === al.at(-1) && ay === 6)) continue;
    for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) set(ax + dx, ay + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
  }
  // reserve format + version areas
  for (let i = 0; i < 9; i++) { fn[8][i] = true; fn[i][8] = true; }
  for (let i = 0; i < 8; i++) { fn[8][size - 1 - i] = true; fn[size - 1 - i][8] = true; }
  set(8, size - 8, true);   // dark module
  if (ver >= 7) for (let i = 0; i < 6; i++) for (let j = 0; j < 3; j++) { fn[size - 11 + j][i] = true; fn[i][size - 11 + j] = true; }

  // place data (zig-zag)
  const allBits = [];
  for (const c of codewords) for (let i = 7; i >= 0; i--) allBits.push((c >>> i) & 1);
  let bi = 0;
  for (let right = size - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5;
    for (let vert = 0; vert < size; vert++) for (let j = 0; j < 2; j++) {
      const x = right - j, up = ((right + 1) & 2) === 0, y = up ? size - 1 - vert : vert;
      if (!fn[y][x] && bi < allBits.length) mod[y][x] = allBits[bi++] === 1;
    }
  }
  if (bi !== allBits.length) throw new Error("QR tables inconsistent: data does not fill the symbol");

  const MASKS = [
    (x, y) => (x + y) % 2 === 0, (x, y) => y % 2 === 0, (x, y) => x % 3 === 0, (x, y) => (x + y) % 3 === 0,
    (x, y) => (((x / 3) | 0) + ((y / 2) | 0)) % 2 === 0, (x, y) => ((x * y) % 2) + ((x * y) % 3) === 0,
    (x, y) => (((x * y) % 2) + ((x * y) % 3)) % 2 === 0, (x, y) => (((x + y) % 2) + ((x * y) % 3)) % 2 === 0,
  ];
  const formatBits = (mask) => {
    const d = (0 << 3) | mask;                  // ECC level M = 00
    let r = d << 10;
    for (let i = 14; i >= 10; i--) if ((r >>> i) & 1) r ^= 0x537 << (i - 10);
    return ((d << 10) | r) ^ 0x5412;
  };
  const build = (mask) => {
    const m = mod.map((row) => row.slice());
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) if (!fn[y][x] && MASKS[mask](x, y)) m[y][x] = !m[y][x];
    const f = formatBits(mask), bit = (i) => ((f >>> i) & 1) === 1;
    for (let i = 0; i <= 5; i++) m[i][8] = bit(i);
    m[7][8] = bit(6); m[8][8] = bit(7); m[8][7] = bit(8);
    for (let i = 9; i < 15; i++) m[8][14 - i] = bit(i);
    for (let i = 0; i < 8; i++) m[8][size - 1 - i] = bit(i);
    for (let i = 8; i < 15; i++) m[size - 15 + i][8] = bit(i);
    m[size - 8][8] = true;
    if (ver >= 7) {
      let r = ver << 12;
      for (let i = 17; i >= 12; i--) if ((r >>> i) & 1) r ^= 0x1f25 << (i - 12);
      const vb = (ver << 12) | r;
      for (let i = 0; i < 18; i++) {
        const dark = ((vb >>> i) & 1) === 1, a = size - 11 + (i % 3), b = (i / 3) | 0;
        m[b][a] = dark; m[a][b] = dark;
      }
    }
    return m;
  };
  const penalty = (m) => {
    let p = 0;
    const runs = (get) => {
      for (let a = 0; a < size; a++) {
        let run = 1;
        const line = [];
        for (let b = 0; b < size; b++) line.push(get(a, b));
        for (let b = 1; b < size; b++) {
          if (line[b] === line[b - 1]) { run++; if (run === 5) p += 3; else if (run > 5) p++; } else run = 1;
        }
        const s = line.map((v) => (v ? "1" : "0")).join("");
        for (const pat of ["10111010000", "00001011101"]) { let i = -1; while ((i = s.indexOf(pat, i + 1)) >= 0) p += 40; }
      }
    };
    runs((a, b) => m[a][b]); runs((a, b) => m[b][a]);
    for (let y = 0; y < size - 1; y++) for (let x = 0; x < size - 1; x++) if (m[y][x] === m[y][x + 1] && m[y][x] === m[y + 1][x] && m[y][x] === m[y + 1][x + 1]) p += 3;
    let dark = 0;
    for (const row of m) for (const v of row) if (v) dark++;
    p += Math.floor(Math.abs((dark * 100) / (size * size) - 50) / 5) * 10;
    return p;
  };
  let best = null, bestP = Infinity, bestMask = 0;
  for (let k = 0; k < 8; k++) { const m = build(k), p = penalty(m); if (p < bestP) { best = m; bestP = p; bestMask = k; } }
  return { size, modules: best, version: ver, mask: bestMask };
}

/** Draws a QR matrix to a canvas (with a 4-module quiet zone). Always dark-on-white so projectors and phones read it. */
export function drawQR(canvas, qr, px = 6) {
  const q = 4, n = qr.size + q * 2;
  canvas.width = canvas.height = n * px;
  const g = canvas.getContext("2d");
  g.fillStyle = "#fff"; g.fillRect(0, 0, n * px, n * px);
  g.fillStyle = "#000";
  for (let y = 0; y < qr.size; y++) for (let x = 0; x < qr.size; x++) if (qr.modules[y][x]) g.fillRect((x + q) * px, (y + q) * px, px, px);
}

// ---------------------------------------------------------------- link builder UI
if (typeof document !== "undefined") {
  const $ = (s, r = document) => r.querySelector(s);
  const esc = (t) => String(t).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);

  // levels with their own page open there; every other level opens on the homepage with ?level=<id> (teacherMode.js
  // swaps the starting level)
  const PAGES = {
    cell: "index.html", animal: "index.html?cell=animal",
    membrane: "sims/membrane-transport/index.html", thylakoid: "sims/photosynthesis/index.html", cristae: "sims/atp-synthase/index.html",
    enzymes: "sims/enzymes/index.html", expression: "sims/protein-synthesis/index.html", mitosis: "sims/mitosis/index.html",
    meiosis: "sims/meiosis/index.html",
  };
  const GROUPS = [
    ["Whole cell", ["cell", "animal", "specialised", "immunity"]],
    ["Organelles", ["nucleus", "chloroplast", "mitochondrion", "membrane", "enzymes"]],
    ["Molecular scale", ["thylakoid", "cristae", "chromatin", "dna", "expression", "folding"]],
    ["Cell division and inheritance", ["mitosis", "meiosis", "karyotype", "inheritance", "epigenetics"]],
  ];
  const state = { level: "cell", band: "", dot: null, byCode: false, lock: false, noquiz: false, present: false, paused: false, clay: false };
  let LEVELS = {}, SYL = [];

  const levelSel = $("#t-level"), yearSel = $("#t-year"), out = $("#t-url"), qrBox = $("#t-qr"), qrNote = $("#t-qr-note");

  function buildURL() {
    const page = PAGES[state.level] || "index.html";
    const u = new URL(page, new URL(".", location.href));
    if (!PAGES[state.level]) u.searchParams.set("level", state.level);
    if (state.dot) {
      if (state.byCode && state.dot.school_code) u.searchParams.set("code", state.dot.school_code.replace(" ", "-"));
      else u.searchParams.set("dot", state.dot.id);
    } else if (state.band) u.searchParams.set("year", state.band);
    if (state.lock) u.searchParams.set("lock", "1");
    if (state.noquiz) u.searchParams.set("noquiz", "1");
    if (state.present) u.searchParams.set("present", "1");
    if (state.paused) u.searchParams.set("paused", "1");
    if (state.clay) u.searchParams.set("look", "clay");
    return u.href;
  }

  function refresh() {
    const url = buildURL();
    out.value = url;
    $("#t-open").href = url;
    const qr = qrEncode(url);
    if (!qr) { qrBox.hidden = true; qrNote.textContent = "This link is too long for a QR code. Remove an option or use the copy button."; return; }
    qrBox.hidden = false;
    drawQR($("#t-qr canvas"), qr, 6);
    qrNote.textContent = `QR code (version ${qr.version}, ${url.length} characters). Hold a phone camera up to the projector.`;
    $("#t-qr canvas").setAttribute("aria-label", `QR code for ${url}`);
  }

  function renderDots(filter) {
    const list = $("#t-dots"), f = filter.trim().toLowerCase();
    const items = SYL.filter((d) => !f || `${d.school_code || ""} ${d.text} ${d.outcome} ${d.id}`.toLowerCase().includes(f)).slice(0, 40);
    list.innerHTML = items.map((d) => `<li><button type="button" data-id="${esc(d.id)}" aria-pressed="${state.dot?.id === d.id}">${d.school_code ? `<b>${esc(d.school_code)}</b> ` : ""}${esc(d.text)} <small>${esc(d.outcome)} · ${esc(d.band)}</small></button></li>`).join("")
      || `<li class="none">No dot points match that search.</li>`;
  }

  function setDot(d) {
    state.dot = d;
    $("#t-dot-now").innerHTML = d ? `Selected: <b>${esc(d.school_code || d.id)}</b> ${esc(d.text)} <button type="button" class="btn" id="t-dot-clear">Clear</button>` : "No dot point selected.";
    $("#t-dot-clear")?.addEventListener("click", () => setDot(null));
    yearSel.disabled = !!d;
    $("#t-year-note").textContent = d ? "The dot point sets the year level." : "";
    $("#t-bycode-wrap").hidden = !d?.school_code;
    renderDots($("#t-search").value);
    refresh();
  }

  function init() {
    levelSel.innerHTML = GROUPS.map(([g, ids]) => `<optgroup label="${g}">${ids.map((id) => `<option value="${id}">${esc(LEVELS[id]?.title || id)}</option>`).join("")}</optgroup>`).join("");
    levelSel.value = state.level;
    levelSel.addEventListener("change", () => { state.level = levelSel.value; refresh(); });
    yearSel.addEventListener("change", () => { state.band = yearSel.value; refresh(); });
    for (const k of ["lock", "noquiz", "present", "paused", "clay"]) $(`#t-${k}`).addEventListener("change", (e) => { state[k] = e.target.checked; refresh(); });
    $("#t-bycode").addEventListener("change", (e) => { state.byCode = e.target.checked; refresh(); });
    $("#t-search").addEventListener("input", (e) => renderDots(e.target.value));
    $("#t-dots").addEventListener("click", (e) => {
      const b = e.target.closest("button[data-id]");
      if (b) setDot(SYL.find((d) => d.id === b.dataset.id) || null);
    });
    $("#t-copy").addEventListener("click", async () => {
      const msg = $("#t-copied");
      try { await navigator.clipboard.writeText(out.value); msg.textContent = "Copied."; }
      catch { out.select(); msg.textContent = document.execCommand?.("copy") ? "Copied." : "Press Ctrl+C (or Cmd+C) to copy."; }
      setTimeout(() => (msg.textContent = ""), 2500);
    });
    out.addEventListener("focus", () => out.select());
    setDot(null);
  }

  Promise.all([
    import("./world/shell.js").then((m) => m.LEVELS).catch(() => ({})),
    fetch("content/syllabus.json").then((r) => r.json()).catch(() => ({ dotpoints: [] })),
  ]).then(([levels, syl]) => { LEVELS = levels; SYL = syl.dotpoints || []; init(); });
}
