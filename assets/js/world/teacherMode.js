// Teacher mode: classroom options read from the page URL (see teacher.html for the link builder).
//   ?lock=1     year level is fixed      ?noquiz=1   hide quizzes and revision (missions stay)
//   ?present=1  projector layout         ?paused=1   start paused
//   ?look=clay  start in the clay look   ?level=<id> start on any level (used by links built for levels without their own page)
// Runs before the first level mounts; engine.start is wrapped so the starting level and the paused / clay state apply after it.

export function install(ctx) {
  const { engine, stageEl, header, qs, root } = ctx;
  const on = (k) => qs.get(k) === "1";
  const lock = on("lock"), noquiz = on("noquiz"), present = on("present"), paused = on("paused"), clay = qs.get("look") === "clay";
  const wantLevel = qs.get("level");
  const html = document.documentElement;

  if (lock || noquiz || present) {
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = `${root || ""}assets/css/teacher.css`;
    document.head.appendChild(link);
  }

  if (lock) {
    const sel = header.querySelector(".lens-select");
    if (sel) {
      sel.disabled = true;
      sel.title = "Your teacher has locked the year level for this activity.";
      sel.setAttribute("aria-label", "Year level (locked by your teacher)");
    }
  }

  if (noquiz) {
    html.dataset.teacherHideQuiz = "1";   // revision.js reads this; teacher.css hides the K.quiz cards (.card.quiz)
  }

  if (present) {
    html.dataset.teacherPresent = "1";
    const shell = stageEl.closest(".sim-shell");
    const toggle = document.createElement("button");
    toggle.type = "button";
    toggle.className = "btn cs-panel-toggle";
    toggle.setAttribute("aria-pressed", "false");
    toggle.title = "Show or hide the side panel (P)";
    const set = (hidden) => {
      shell?.classList.toggle("panel-hidden", hidden);
      toggle.textContent = hidden ? "Show panel" : "Hide panel";
      toggle.setAttribute("aria-pressed", String(hidden));
      engine.resize?.();
      requestAnimationFrame(() => engine.resize?.());
    };
    toggle.addEventListener("click", () => set(!shell?.classList.contains("panel-hidden")));
    stageEl.appendChild(toggle);
    set(false);
    addEventListener("keydown", (e) => {
      if (e.key.toLowerCase() !== "p" || e.ctrlKey || e.metaKey || e.altKey || e.repeat) return;
      const t = e.target;
      if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return;
      e.preventDefault();
      set(!shell?.classList.contains("panel-hidden"));
    });
  }

  if (wantLevel || paused || clay) {
    const start = engine.start.bind(engine);
    engine.start = async (id) => {
      const defs = engine.levelsDef;
      const target = wantLevel && defs && Object.hasOwn(defs, wantLevel) && typeof defs[wantLevel]?.load === "function" ? wantLevel : id;
      const r = await start(target);
      if (clay) engine.setStyle("clay");
      if (paused && !engine.paused) {
        const btn = stageEl.querySelector(".cs-pause");
        if (btn) btn.click();                // same path as a student pressing Pause: updates the label and aria-pressed
        else engine.paused = true;
      }
      return r;
    };
  }
}
