// Revision quiz card: about five questions matched to the current level's topics and the year lens.
// Questions come from content/revision.json (built by tools/build-revision-bank.mjs).
// Year 7 students see Year 7 items; Extension adds Year 7 items after its own.
import * as K from "../kit.js";
import { BANDS } from "./lens.js";

const N = 5;
const LABEL = Object.fromEntries(BANDS.map((b) => [b.id, b.label]));

/** Which bands a student at `band` draws from, own band first. */
function tiersFor(band) {
  if (band === "ext") return [{ bands: ["ext"], tag: "" }, { bands: ["y7"], tag: "From Year 7" }];
  return [{ bands: ["y7"], tag: "" }];
}

function shuffled(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}

export async function install(ctx) {
  const { engine, panelEl, lens, root, onChange } = ctx;
  let bank = [];
  try {
    const res = await fetch(`${root || ""}content/revision.json`);
    if (!res.ok) return;
    bank = (await res.json()).items || [];
  } catch { return; } // offline or missing: no card
  if (!bank.length) return;

  const html = document.documentElement;
  const card = K.card(panelEl, "Revision quiz", "quiz revision");
  card.setAttribute("aria-label", "Revision quiz");
  // sit just before the Syllabus links card
  const syl = [...panelEl.children].find((c) => c.querySelector?.(":scope > h2")?.textContent === "Syllabus links");
  if (syl) panelEl.insertBefore(card, syl);

  const body = document.createElement("div");
  card.appendChild(body);

  const seen = new Set();   // ids already shown this visit, so "New questions" gives fresh ones first
  let set = [];             // [{ item, tag }]
  let key = "";             // level + band + topics the current set was drawn for
  let idx = 0, score = 0;

  const hiddenByTeacher = () => html.dataset.teacherHideQuiz === "1";

  function draw() {
    const topics = engine.current?.topics || [];
    const tiers = tiersFor(lens.band);
    const pools = tiers.map((t) => bank.filter((it) => t.bands.includes(it.band) && it.topics.some((x) => topics.includes(x))));
    const later = pools.slice(1).reduce((n, p) => n + p.length, 0);
    const pick = [];
    const take = (pool, tag, cap) => {
      const fresh = shuffled(pool.filter((it) => !seen.has(it.id)));
      const old = shuffled(pool.filter((it) => seen.has(it.id)));
      for (const it of [...fresh, ...old]) { if (pick.length >= cap) break; pick.push({ item: it, tag }); }
    };
    take(pools[0], tiers[0].tag, later ? N - 1 : N);
    for (let i = 1; i < pools.length; i++) take(pools[i], tiers[i].tag, N);
    // keep the own-band questions up front, then earlier-year ones, so the warm-ups never lead
    set = pick;
    pick.forEach((p) => seen.add(p.item.id));
  }

  function mini(text, css = "") {
    const p = document.createElement("p");
    p.className = "hint";
    if (css) p.style.cssText = css;
    p.textContent = text;
    return p;
  }

  function render() {
    body.replaceChildren();
    if (hiddenByTeacher() || !set.length) { card.style.display = "none"; return; }
    card.style.display = "";

    if (idx >= set.length) {
      const msg = score === set.length ? "Excellent." : score >= Math.ceil(set.length / 2) ? "Good work." : "Have another go; the explanations are the useful part.";
      const strong = document.createElement("p");
      strong.innerHTML = `<strong>${score} / ${set.length}</strong> correct. `;
      strong.append(msg);
      body.append(strong);
      const row = K.buttonRow(body);
      const again = K.button(row, "New questions", () => newSet(), { kind: "primary" });
      K.button(row, "Try these again", () => { idx = 0; score = 0; render(); });
      again.focus({ preventScroll: true });
      return;
    }

    const { item, tag } = set[idx];
    const meta = document.createElement("p");
    meta.className = "hint";
    meta.style.cssText = "display:flex;justify-content:space-between;gap:8px;margin:0 0 6px";
    const left = document.createElement("span");
    left.textContent = `Question ${idx + 1} of ${set.length}${tag ? " · " + tag : ""}`;
    const sc = document.createElement("span");
    sc.textContent = `Score ${score}`;
    sc.style.fontVariantNumeric = "tabular-nums";
    meta.append(left, sc);
    body.append(meta);

    const q = document.createElement("div");
    q.className = "q";
    q.id = `rv-q-${item.id}`;
    q.textContent = item.q;
    body.append(q);

    const opts = document.createElement("div");
    opts.className = "opts";
    opts.setAttribute("role", "group");
    opts.setAttribute("aria-labelledby", q.id);
    body.append(opts);
    const fb = document.createElement("div");
    fb.className = "fb";
    fb.setAttribute("aria-live", "polite");
    body.append(fb);

    const foot = K.buttonRow(body);
    K.button(foot, "New questions", () => newSet());
    let answered = false;
    item.options.forEach((text, k) => {
      const b = K.button(opts, text, () => {
        if (answered) return;
        answered = true;
        const right = k === item.answer;
        if (right) score++;
        b.classList.add(right ? "right" : "wrong");
        opts.children[item.answer].classList.add("right");
        [...opts.children].forEach((c) => c.setAttribute("aria-disabled", "true")); // stays readable; clicks are ignored once answered
        fb.textContent = (right ? "Correct. " : "Not quite. ") + item.why;
        const next = K.button(foot, idx + 1 < set.length ? "Next question" : "See score", () => { idx++; render(); }, { kind: "primary" });
        foot.prepend(next);
        next.focus({ preventScroll: true });
      });
    });
  }

  function newSet() {
    idx = 0; score = 0;
    draw();
    render();
  }

  function refresh(force) {
    const k = `${engine.stack?.at(-1)?.id}|${lens.band}|${(engine.current?.topics || []).join(",")}`;
    if (!force && k === key) { if (hiddenByTeacher() !== (card.style.display === "none")) render(); return; }
    key = k;
    newSet();
  }

  // re-draw on level change and on lens change
  onChange(() => refresh(false));
  lens.on(() => refresh(false));
  new MutationObserver(() => render()).observe(html, { attributes: true, attributeFilter: ["data-teacher-hide-quiz"] });
  refresh(true);
}
