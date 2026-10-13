// Page theme (auto / light / dark). The 3D stage stays dark in both themes; only page chrome re-themes.
// Stored choice lives in localStorage "mixlab.theme" ("auto" | "light" | "dark"); the resolved theme is
// applied as <html data-theme="light|dark">. An inline <script> in each <head> mirrors applyStoredTheme()
// so the right theme is set before CSS paints.
const KEY = "mixlab.theme";
const MODES = [["auto", "Auto"], ["light", "Light"], ["dark", "Dark"]];

function readStored() {
  try { const v = localStorage.getItem(KEY); return v === "light" || v === "dark" ? v : "auto"; } catch { return "auto"; }
}
function systemTheme() {
  try { return window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark"; } catch { return "dark"; }
}
function apply(mode) {
  const t = mode === "auto" ? systemTheme() : mode;
  document.documentElement.dataset.theme = t;
  document.documentElement.style.colorScheme = t;
  return t;
}

/** Resolve the stored choice and set data-theme. Safe to call repeatedly. */
export function applyStoredTheme() { return apply(readStored()); }

export function mountThemeToggle(slot) {
  if (!slot) return;
  let mode = readStored();
  apply(mode);
  slot.textContent = "";
  const wrap = document.createElement("div");
  wrap.className = "segmented cs-theme";
  wrap.setAttribute("role", "group");
  wrap.setAttribute("aria-label", "Colour theme");
  const btns = MODES.map(([id, label]) => {
    const b = document.createElement("button");
    b.type = "button"; b.textContent = label; b.dataset.mode = id;
    b.title = id === "auto" ? "Match your device setting" : label + " theme";
    b.addEventListener("click", () => {
      mode = id;
      try { localStorage.setItem(KEY, id); } catch { /* storage blocked: choice lasts this page only */ }
      apply(mode); sync();
    });
    wrap.appendChild(b); return b;
  });
  function sync() { btns.forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.mode === mode))); }
  sync();
  slot.appendChild(wrap);
  try {
    const mq = window.matchMedia("(prefers-color-scheme: light)");
    const onChange = () => { if (mode === "auto") apply("auto"); };
    mq.addEventListener ? mq.addEventListener("change", onChange) : mq.addListener(onChange);
  } catch { /* no matchMedia */ }
  window.addEventListener("storage", (e) => { if (e.key === KEY) { mode = readStored(); apply(mode); sync(); } });
}
