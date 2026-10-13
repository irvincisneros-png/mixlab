// Lens-aware text for the States of matter apparatus level (Y7 4.1.1 to 4.1.4). Every number comes from the model
// (statesModel.js) or from WATER's cited data; the narrative is generated from what the model actually did last step,
// never from switch positions. Bands: "y7" (core) and "ext" (Extension). Australian spelling.
import { WATER } from "./statesModel.js";

const MINUS = "−";
export const fmtT = (T, d = 1) => (T < 0 ? MINUS : "") + Math.abs(T).toFixed(d) + " °C";
export const fmtW = (w) => `${Math.round(w)} W`;
export function fmtTime(s, tenths = false) {
  s = Math.max(0, s);
  const m = Math.floor(s / 60), r = s - m * 60;
  return `${String(m).padStart(2, "0")}:${tenths ? r.toFixed(1).padStart(4, "0") : String(Math.floor(r)).padStart(2, "0")}`;
}
const mins = (s) => (s < 90 ? `${Math.round(s)} s` : `${(s / 60).toFixed(1)} min`);
const g1 = (g) => (g < 10 ? g.toFixed(1) : String(Math.round(g)));
export const P = (v, band) => (v != null && typeof v === "object" && !Array.isArray(v) ? v[band] ?? v.y7 : v);

const LF = WATER.Lf, LV = WATER.Lv;

/** Total steam volume in litres for g grams at T °C (ideal-gas scaling of 1.673 L/g at 100 °C, 1 atm). */
export const steamLitres = (g, T) => g * 1.673 * ((T + 273.15) / 373.15);
/** Volume of liquid water in cm³ (density about 1.00 g/cm³; at 100 °C 0.958). */
export const liquidCm3 = (g, T) => g / (T >= 50 ? 0.9584 + (100 - Math.min(T, 100)) * 0.00083 : 0.9982);

/**
 * "What's happening": 2 to 4 short paragraphs from the model's last step.
 * ctx: { sealed, bath, mass0, energyIn (J since the run began), started (bool), prediction (bool: a sketch exists) }
 */
export function narrative(M, ctx, band) {
  const ext = band === "ext";
  const out = [];
  const T = M.T, net = M.heatIn - M.heatLoss;
  const vessel = ctx.sealed ? "syringe" : "beaker";
  const tot = M.solid + M.liquid + M.gas;
  const tNow = M.t;
  const hot = M.power > 0;
  const heatLine = hot
    ? `The hotplate is putting in <b>${fmtW(M.heatIn)}</b>${M.heatLoss > 0.5 ? ` and the water is losing <b>${M.heatLoss.toFixed(1)} W</b> to the air` : M.heatLoss < -0.5 ? ` and the room is adding <b>${(-M.heatLoss).toFixed(1)} W</b>` : ""}.`
    : ctx.bath != null
      ? `The cold bath (${fmtT(ctx.bath, 0)}) is drawing <b>${M.heatLoss.toFixed(0)} W</b> of heat out of the ${ctx.sealed ? "syringe" : "water"}.`
      : M.heatLoss < -0.5 ? `The hotplate is off, but the warmer room is still adding about <b>${(-M.heatLoss).toFixed(1)} W</b>.` : M.heatLoss > 0.5 ? `The hotplate is off and the sample is losing <b>${M.heatLoss.toFixed(1)} W</b> to the room.` : `The hotplate is off.`;

  if (tot <= 1e-6) {
    out.push(`The ${vessel} is empty: all of the water has boiled away and left as steam (<b>${g1(M.escaped)} g</b> in total). Press <b>Reset</b> to start again.`);
    return out;
  }

  if (!ctx.started && tNow === 0 && !hot && ctx.bath == null) {
    const what = M.solid > 0 ? `<b>${g1(tot)} g of ice at ${fmtT(T, 0)}</b>` : `<b>${g1(tot)} g of water at ${fmtT(T, 0)}</b>`;
    out.push(`Ready: ${what} in ${ctx.sealed ? "a sealed syringe" : "an open beaker"}. The stopwatch is stopped, so nothing is changing yet.`);
    out.push(`<b>Predict first.</b> Switch on <i>Predict</i> and sketch on the graph what you think the temperature will do as the hotplate heats it. Then turn the hotplate up and compare.`);
    return out;
  }

  switch (M.phaseChange) {
    case "melting": {
      const rate = M.latentRate / LF;   // g/s
      out.push(`${heatLine} The temperature has <b>stopped rising at ${fmtT(T, 0)}</b>: the energy is going into pulling the ice particles out of their fixed positions (<b>melting</b>), not into making them move faster. <b>${g1(M.solid)} g</b> of ice left, <b>${g1(M.liquid)} g</b> of water so far.`);
      if (ext) out.push(`Melting takes ${LF} J for every gram. At the moment <b>${M.latentRate.toFixed(0)} W</b> is going into melting (${(rate * 60).toFixed(1)} g per minute). The energy overcomes the attractions between the molecules, so their <i>potential energy</i> goes up while their average <i>kinetic energy</i> (and so the temperature) stays the same. The ${g1(M.solid)} g still frozen needs about ${((M.solid * LF) / 1000).toFixed(1)} kJ, around ${mins((M.solid * LF) / Math.max(0.1, M.latentRate))} more at this rate. Boiling the same mass later needs ${(LV / LF).toFixed(1)}× the energy (about ${(LV / LF).toFixed(1)}× the time only at the same net heating rate; heat loss at 100 °C makes a real run longer still).`);
      else out.push(`Look at the heating curve: a flat section. Heat is still going in, but the temperature stays the same until <b>all</b> the ice has melted.`);
      return out;
    }
    case "freezing": {
      const rate = -M.latentRate / LF;
      out.push(`${heatLine} The temperature is <b>stuck at ${fmtT(T, 0)}</b> while the water <b>freezes</b>: the particles are settling into fixed positions and giving out energy as they do, which exactly makes up for the heat leaving. <b>${g1(M.solid)} g</b> frozen, <b>${g1(M.liquid)} g</b> still liquid.`);
      if (ext) out.push(`Freezing releases ${LF} J for every gram (the same energy melting absorbed). About <b>${(-M.latentRate).toFixed(0)} W</b> is being released as the molecules form hydrogen-bonded ice (${(rate * 60).toFixed(1)} g frozen per minute). Their average kinetic energy is unchanged, so the temperature is too.`);
      else out.push(`The line goes flat again, because freezing is melting in reverse. In the model there is no supercooling, so the water freezes at exactly 0 °C.`);
      return out;
    }
    case "boiling": {
      const rate = M.latentRate / LV;
      out.push(`${heatLine} The water is <b>boiling at ${fmtT(T, 0)}</b>. All the energy is being used to pull the water particles apart into a gas (<b>boiling</b>), so the temperature does not rise. The bubbles are <b>water vapour</b>, not air. ${ctx.sealed ? `The steam stays in the syringe and pushes the plunger out; <b>${g1(M.gas)} g</b> is steam so far, <b>${g1(M.liquid)} g</b> still liquid.` : `<b>${g1(M.escaped)} g</b> has left as steam, <b>${g1(M.liquid)} g</b> is left in the beaker.`}`);
      if (!ctx.sealed) out.push(`The white mist above the beaker is <b>not steam</b>. Steam is invisible. The mist is tiny droplets of liquid water that form where the steam meets cooler air.`);
      else out.push(`Steam is an invisible gas. In the model the syringe is sealed but the plunger floats at normal air pressure, so the steam can take up as much room as it needs.`);
      if (ext) out.push(`Vaporising takes ${LV} J per gram, <b>${(LV / LF).toFixed(1)}×</b> the ${LF} J per gram to melt (about that many times the time at the same net heating rate), because the molecules must be separated completely, not just loosened. Right now <b>${M.latentRate.toFixed(0)} W</b> goes into the phase change (${(rate * 60).toFixed(1)} g of steam per minute). The molecules in the liquid and in the steam have the same average kinetic energy (same temperature); the steam has far more potential energy. (Most of the ${LV} J/g goes into potential energy; about 170 J/g pushes the atmosphere back as the vapour expands.) Steam at 100 °C takes up about 1700 times the volume of the liquid.`);
      return out;
    }
    case "condensing": {
      out.push(`${heatLine} The steam is <b>condensing</b> back to liquid at ${fmtT(T, 0)}: the particles are coming together and giving out the energy they took to separate. <b>${g1(M.gas)} g</b> is still steam.`);
      if (ext) out.push(`Condensing releases ${LV} J per gram. This is why steam burns are so much worse than boiling-water burns, and how the water cycle carries energy up into the atmosphere and releases it as clouds form.`);
      return out;
    }
    default: break;
  }

  // no phase change right now
  if (M.solid > 0 && M.liquid <= 0.0001) {
    // all ice
    const dTdt = rateOf(ctx, net / (M.solid * WATER.cSolid) * 60), up = dTdt > 0.05, down = dTdt < -0.05;
    out.push(`${heatLine} The ice is at <b>${fmtT(T)}</b>, so it is ${up ? `warming by about <b>${dTdt.toFixed(1)} °C per minute</b>` : down ? `cooling by about <b>${Math.abs(dTdt).toFixed(1)} °C per minute</b>` : `staying at the same temperature`}. Ice from a freezer is colder than 0 °C. Its particles still vibrate in fixed positions; more energy means bigger vibrations, not new positions.`);
    if (ext) out.push(`Ice has a specific heat capacity of ${WATER.cSolid} J/(g·°C), so ${g1(M.solid)} g needs ${(M.solid * WATER.cSolid).toFixed(0)} J for each degree. That is about half of liquid water's ${WATER.cLiquid}, so ice warms about twice as fast as water would for the same power. Warming from here to 0 °C needs ${((M.solid * WATER.cSolid * (0 - T)) / 1000).toFixed(1)} kJ.`);
    else if (T < -0.05 && up) out.push(`When the ice reaches 0 °C something will change on the graph. Can you say what?`);
    return out;
  }
  if (M.gas > 0 && M.liquid <= 0.0001 && M.solid <= 0.0001) {
    const dTdt = rateOf(ctx, net / (M.gas * WATER.cGas) * 60);
    out.push(`${heatLine} All of the water is now <b>steam at ${fmtT(T)}</b>, ${dTdt > 0.05 ? `heating by about <b>${dTdt.toFixed(1)} °C per minute</b>` : dTdt < -0.05 ? `cooling by about <b>${Math.abs(dTdt).toFixed(1)} °C per minute</b> (it loses heat faster than the hotplate supplies it)` : "staying at about the same temperature (heat in balances heat lost)"}. Only a sealed container can show this: in an open beaker the steam escapes as it forms.`);
    out.push(`The steam now fills about <b>${steamLitres(M.gas, T).toFixed(1)} litres</b> (${(steamLitres(M.gas, T) / (M.gas / 1)).toFixed(1)} L per gram, against about 1 mL per gram for liquid water).${ext ? ` The gas heat capacity here is ${WATER.cGas} J/(g·°C), so the temperature rises about twice as fast per joule as liquid water's.` : ""}`);
    return out;
  }
  // liquid (maybe with a little ice or steam handled above)
  const dTdt = rateOf(ctx, net / (M.liquid * WATER.cLiquid) * 60);
  const balanced = Math.abs(dTdt) < 0.15 && M.power > 0 && M.solid <= 0.0001;
  if (balanced) {
    out.push(`${heatLine} Heat in almost equals the energy leaving (heat lost plus evaporation), so the water has levelled off at <b>${fmtT(T)}</b>. This flat line is <b>not</b> a change of state: it is balance. A warmer beaker loses heat faster (about ${(M.loss * Math.max(0, T - M.room)).toFixed(0)} W at ${fmtT(T, 0)}), so the hotplate needs more power to get hotter still.`);
  } else {
    out.push(`${heatLine} The water is at <b>${fmtT(T)}</b>, ${dTdt > 0.05 ? `warming by about <b>${dTdt.toFixed(1)} °C per minute</b>: the extra energy makes the water particles move faster` : dTdt < -0.05 ? `cooling by about <b>${Math.abs(dTdt).toFixed(1)} °C per minute</b>: the particles are losing energy and slowing down${M.power > 0 && !ctx.sealed && M.evapRate > 1e-5 ? " (heat loss and evaporation together take energy away faster than the hotplate adds it)" : ""}` : `staying at about the same temperature`}.${M.solid > 0 ? "" : ""}`);
  }
  if (M.solid > 0.0001) out.push(`There is still <b>${g1(M.solid)} g</b> of ice in the water.`);
  if (!ctx.sealed && M.evapRate > 1e-5 && M.liquid > 0) {
    const perH = M.evapRate * 3600;
    out.push(`The water is <b>not boiling</b>, but a few particles at the surface are fast enough to escape as vapour: that is <b>evaporation</b>, about <b>${perH < 10 ? perH.toFixed(1) : Math.round(perH)} g per hour</b> right now (${perH < 5 ? "a teaspoon over a few hours" : "visible as faint mist"}). It speeds up as the water gets warmer and it takes energy with it, so it cools the water.`);
  }
  if (ext && M.liquid > 0) out.push(`Liquid water: ${g1(M.liquid)} g × ${WATER.cLiquid} J/(g·°C) = ${(M.liquid * WATER.cLiquid).toFixed(0)} J for every 1 °C. ${ctx.energyIn > 0 ? `So far the hotplate has supplied ${(ctx.energyIn / 1000).toFixed(1)} kJ in total.` : ""}`);
  return out;
}

/** Warming (+) or cooling (-) in °C per minute: the model's actual recent temperature change (ctx.rate), else an energy-balance estimate. */
function rateOf(ctx, fallback) { return ctx.rate != null ? ctx.rate : fallback; }

/** The "Water on Earth" card (Y7 4.1.1): ties the current change in the beaker to the water cycle. */
export function earthCard(M, ctx, band) {
  const ext = band === "ext";
  const pc = M.phaseChange;
  const evap = !ctx.sealed && M.evapRate > 5e-5 && M.liquid > 0 && pc !== "boiling";
  if (pc === "melting") return { head: "Melting", text: `In the beaker: ice becomes water. On Earth: glaciers and ice caps melt (not on mainland Australia), snow in the Alps melts each spring, sea ice melts each spring, snow melts into rivers.${ext ? " Seasonal snowmelt in the Australian Alps feeds rivers such as the Snowy and Murray (the mainland has no glaciers). Every gram that melts absorbs 334 J, which is why melting snow keeps its surroundings near 0 °C." : ""}` };
  if (pc === "boiling") return { head: "Boiling", text: `In the beaker: water becomes vapour all through the liquid. On Earth, boiling is rare: it happens in geysers and hot springs, where the water is heated by hot rock. Most water vapour in the air comes from <b>evaporation</b> instead.${ext ? " Water boils below 100 °C at altitude because the air pressure is lower." : ""}` };
  if (pc === "condensing") return { head: "Condensation", text: `Vapour becomes liquid again. On Earth: clouds form, dew forms on cool mornings, and bathroom mirrors fog up.${ext ? " Each gram that condenses releases about 2450 J at 20 °C (2257 J at 100 °C), and cloud formation heats the air around it and drives storms)." : ""}` };
  if (pc === "freezing") return { head: "Freezing", text: `Water becomes ice. On Earth: ponds and lakes ice over, polar sea water freezes into sea ice, and hail forms when water droplets freeze in clouds.${ext ? " Ice is less dense than water, so it floats and insulates the water below, which is why lakes freeze from the top down." : ""}` };
  if (evap) return { head: "Evaporation", text: `Water is leaving the surface as vapour even though it isn't boiling. On Earth: oceans, lakes and puddles slowly dry out, and wet washing dries. Evaporation happens at any temperature above freezing, faster when it is warm, dry and windy.${ext ? " Most of the water vapour in the air comes from the oceans." : ""}` };
  return { head: "The water cycle", text: `The sun's heat powers the water cycle: <b>evaporation</b> (liquid to gas) lifts water from oceans and lakes, <b>condensation</b> (gas to liquid) makes clouds, rain and snow fall, then <b>melting</b> and runoff return it. Heat the beaker and watch which of these changes you can make happen.${ext ? " These are the same four steps seen on the heating curve, with the sun supplying the energy for the changes that take energy in." : ""}` };
}

/** Feedback on the student's sketched prediction: compared with what the model does (or did). Returns an array of HTML lines. */
export function predictFeedback(sketch, M, band, run = {}) {
  const ext = band === "ext";
  const startsIce = run.startsIce !== false;
  if (!sketch || sketch.length < 4) return [`Draw a line on the graph first (drag across it), then press <b>Check</b>.`];
  const pts = [...sketch].sort((a, b) => a.t - b.t);
  const spanT = pts[pts.length - 1].t - pts[0].t || 1;
  const flatAt = (T0) => {   // longest nearly flat stretch of the sketch near a temperature
    let best = 0, start = null;
    for (let i = 0; i < pts.length; i++) {
      const near = Math.abs(pts[i].T - T0) < 7;
      if (near && start === null) start = i;
      if ((!near || i === pts.length - 1) && start !== null) { const end = near ? i : i - 1; best = Math.max(best, pts[end].t - pts[start].t); start = null; }
    }
    return best;
  };
  const f0 = flatAt(0), f100 = flatAt(100);
  const lines = [];
  const mins = (s) => `${(s / 60).toFixed(1)} min`;
  const powerTxt = run.power ? `${Math.round(run.power)} W` : "this power";
  if (startsIce) {
    if (f0 > spanT * 0.04) lines.push(`✓ You put a <b>flat section at 0 °C</b>: the temperature stays put while the ice melts.`);
    else lines.push(`✗ Ice starts below 0 °C, so there is a flat section at 0 °C while it melts (${run.meltS > 0 ? `${mins(run.meltS)} in your run` : "the energy goes into melting, not warming"}).`);
  }
  if (run.boiled) {
    if (f100 > spanT * 0.04) lines.push(`✓ You put a <b>flat section at 100 °C</b>. In the model's run (${powerTxt}) the water boiled for ${mins(run.boilS)} at 100 °C.`);
    else lines.push(`✗ In the model's run (${powerTxt}) the temperature stopped at 100 °C for ${mins(run.boilS)} while the water boiled. Your line doesn't.`);
    if (startsIce && run.meltS > 5 && run.boilS > 5) lines.push(`In the model's run melting held for ${mins(run.meltS)} and boiling for ${mins(run.boilS)} (${(run.boilS / run.meltS).toFixed(1)}× as long). Boiling needs ${(LV / LF).toFixed(1)}× the energy of melting; the times match that ratio only at the same net heating rate.`);
  } else if (f100 > spanT * 0.04) {
    lines.push(run.t > 0 ? `• Your line goes flat at 100 °C, but this run hasn't boiled yet (${powerTxt}, reached ${fmtT(run.maxT, 0)}). At low power a beaker levels off below 100 °C because heat lost equals heat in.` : `• Your line goes flat at 100 °C: right if the water reaches boiling. Heat it and see whether ${powerTxt} is enough.`);
  } else if (run.t > 0) {
    lines.push(`• This run hasn't reached boiling, so no flat line at 100 °C is expected yet. If it levels off below 100 °C, that is heat in balancing heat lost, not a change of state.`);
  }
  if (ext && startsIce) lines.push(`Also check the slopes: the ice line (${WATER.cSolid} J/g·°C) should be about twice as steep as the liquid line (${WATER.cLiquid}).`);
  return lines;
}

// ---------- parts: hover and the Selected card ----------
export const PARTS = {
  beaker: { name: "250 mL beaker", text: { y7: "A beaker is made of <strong>borosilicate glass</strong>, which is clear and doesn't crack when it is heated. The white lines are the <strong>volume scale</strong>. Beaker marks are only a rough guide (about 5 % accurate): use a measuring cylinder when you need an exact volume.", ext: "Borosilicate glass (about 13 % boron oxide) expands very little when heated, so it survives the temperature difference between a hotplate and ice. The printed scale is accurate to about 5 %." } },
  water: { name: "Water", portal: true, text: { y7: "The water. Double-click or zoom in to see the <strong>particles</strong> inside. The picture changes as the water melts, warms or boils.", ext: "Liquid water: molecules about 0.28 nm across, in constant contact and sliding past each other, held together by hydrogen bonds. Zoom in to see the particle model driven by the same numbers." } },
  ice: { name: "Ice cubes", text: { y7: "Ice <strong>floats</strong> because it is less dense than water (0.917 g/cm³ against 1.00). The white streaks are trapped air bubbles. Watch the water level: floating ice displaces its own mass of water, so the level doesn't change as it melts.", ext: "Ice is less dense than liquid water (0.917 against 0.998 g/cm³ at 0–20 °C) because hydrogen bonds hold the molecules in an open hexagonal lattice. A floating cube displaces its own weight of water, so the level stays the same as it melts." } },
  thermometer: { name: "Thermometer", text: { y7: "A liquid-in-glass thermometer: the red liquid expands as it gets hotter and rises up the tube. In this model the whole sample is stirred, so one temperature describes all of it.", ext: "The dyed liquid expands more than the glass, so the column rises. The model assumes one uniform temperature (a stirred sample); a real unstirred beaker has hot and cold layers." } },
  hotplate: { name: "Hotplate", text: { y7: "The hotplate supplies heat. The <b>heat in</b> is shown in watts (1 W = 1 joule every second). The ring glows when it is on.", ext: "A resistive heating element under an aluminium plate. In the model every watt is delivered to the sample, less the heat the sample loses to the air (Newton's law of cooling, 0.35 W/°C)." } },
  stirbar: { name: "Magnetic stirrer bar", text: { y7: "A magnet in a plastic coating, spun by a magnet inside the hotplate. Stirring spreads the heat so the whole sample is the same temperature.", ext: "A PTFE-coated magnet driven by a rotating magnet in the hotplate. It is why the model can use a single temperature for the whole sample." } },
  timer: { name: "Stopwatch", text: { y7: "Time since you pressed <b>Start</b>. The model runs faster than real life so you don't have to wait: the speed slider sets how much faster.", ext: "Simulated time, shown in minutes and seconds. It runs at the chosen multiple of real time (10× to 120×)." } },
  stand: { name: "Retort stand and clamp", text: { y7: "Holds the thermometer so the bulb is in the water but not touching the bottom, where the glass is hotter than the water.", ext: "The bulb sits in the middle of the sample, clear of the base, because the glass over the hotplate is hotter than the water and would give a false reading." } },
  bath: { name: "Ice and salt bath", text: { y7: "Salt lowers the temperature at which ice melts, so an ice and salt mixture can be much colder than 0 °C (about −15 °C here). Heat flows from the warmer water into the colder bath.", ext: "Dissolved salt lowers the freezing point of water (freezing-point depression), so ice in brine melts at a temperature below 0 °C, drawing in heat from its surroundings. A salt and ice mixture can reach about −21 °C." } },
  syringe: { name: "Sealed syringe", text: { y7: "A glass syringe with a plunger that is free to move at normal air pressure. It keeps the steam in, so you can heat it above 100 °C. The plunger moves out as water becomes steam. <b>The plunger travel is squeezed so it fits on the screen.</b>", ext: "Constant-pressure container: the plunger floats at atmospheric pressure. Water at 100 °C becomes steam with about 1700 times the volume (1.67 L per gram against about 1.04 mL), so the real plunger would move out far more than the drawing shows. The travel is drawn on a logarithmic scale." } },
  mist: { name: "Mist (not steam)", text: { y7: "This white mist is <b>not steam</b>. Steam is an invisible gas. The mist is millions of tiny droplets of <b>liquid</b> water that formed when invisible water vapour met cooler air.", ext: "Water vapour is invisible. The mist is condensed droplets about 1–10 µm across, formed as the vapour cools and reaches saturation just above the surface; it scatters light, so it looks white. Where the air is warm and dry enough, the droplets evaporate again and the mist disappears." } },
  bench: { name: "Bench top", text: { y7: "A matte epoxy-resin bench top, the kind used in school labs because it resists heat and chemicals.", ext: "Epoxy resin worktops resist acids, solvents and heat, which is why they are standard in school and university labs." } },
};

// ---------- missions ----------
// tr (tracker) fields come from states.js: { startedIce, meltHold, meltDone, boiled, boilT, boilHoldMax, steamMax, froze, freezeHold, freezeT, runs }
export const MISSIONS = [
  { text: "Melt <b>all</b> the ice (start from ice at −20 °C) and see how long the temperature stays at 0 °C.", check: (M, tr) => tr.meltDone },
  { text: "Find the <b>boiling point</b> of water: heat it until it boils and read the thermometer.", check: (M, tr) => tr.boiled && Math.abs(tr.boilT - 100) < 0.2 },
  { text: "Show the temperature <b>doesn't rise while boiling</b>: keep it boiling at 250 W (max) for at least 2 minutes and watch the thermometer.", check: (M, tr) => tr.boilHoldMax >= 120 },
  { text: "Make <b>steam hotter than 100 °C</b>. (Hint: it is only possible if the steam can't escape: use the sealed syringe.)", check: (M, tr) => tr.steamMax > 100.5 },
  { text: "Freeze water in the <b>cold bath</b> and find the freezing point on the graph.", check: (M, tr) => tr.froze && Math.abs(tr.freezeT) < 0.2 },
  { band: "ext", text: "Run it twice at the same power with <b>double the mass</b>, melting and boiling each time. Show that <b>both</b> flat sections take twice as long.", check: (M, tr) => tr.doubled },
];

// ---------- quiz ----------
export const QUIZ = [
  { q: "A beaker of ice at 0 °C is on a hotplate. For several minutes the thermometer still reads 0 °C. Why?",
    options: ["The thermometer is stuck", "The energy is going into melting the ice, not raising the temperature", "Ice can't absorb heat", "The hotplate isn't working"],
    answer: 1, why: "While ice melts, the energy goes into pulling particles out of their fixed positions. The temperature stays at 0 °C until all the ice has melted." },
  { q: "What are the bubbles in boiling water made of?",
    options: ["Air", "Oxygen from the water splitting", "Water vapour (steam)", "Hydrogen"],
    answer: 2, why: "Boiling means liquid water turning to gas <i>inside</i> the liquid. The bubbles are water vapour. (Tiny bubbles before boiling are air that was dissolved in the water.)" },
  { q: "What is the white cloud above a boiling kettle or beaker?",
    options: ["Steam", "Smoke", "Tiny droplets of liquid water", "Carbon dioxide"],
    answer: 2, why: "Steam is an invisible gas. The white cloud is water vapour that has cooled and condensed into tiny droplets of liquid water." },
  { q: "Which statement about evaporation is true?",
    options: ["It only happens at 100 °C", "It happens at any temperature, from the surface of the liquid", "It only happens in a kettle", "It happens when bubbles form"],
    answer: 1, why: "Puddles dry on a cool day: fast-moving particles at the surface escape. Boiling is different: it happens throughout the liquid at 100 °C." },
  { q: "Water is boiling on a hotplate. You turn the power up to maximum. What happens to the temperature?",
    options: ["It rises above 100 °C", "It stays at 100 °C but the water boils faster", "It drops", "It stays at 100 °C and boiling stops"],
    answer: 1, why: "Extra power just boils the water away faster. In an open beaker the water can't get hotter than its boiling point." },
  { q: "Ice is taken from a freezer at −18 °C and heated. Which graph description is right?",
    options: ["Flat at −18 °C, then rises", "Rises to 0 °C, flat while it melts, rises to 100 °C, flat while it boils", "A straight line up to 100 °C", "Rises to 100 °C, then flat"],
    answer: 1, why: "Ice isn't always 0 °C. It warms to 0 °C, then the line goes flat during melting, rises as liquid warms, and goes flat again during boiling." },
  { band: "ext", q: "100 g of ice at 0 °C is melted, then a different 100 g of water at 100 °C is boiled, both at the same power. How do the energies compare?",
    options: ["Boiling needs about 6.8 times as much energy", "They need the same energy", "Melting needs more energy", "Boiling needs about twice as much energy"],
    answer: 0, why: "Melting needs 334 J/g and boiling needs 2257 J/g: 2257 ÷ 334 ≈ 6.8 times the energy, so about 6.8 times as long at the same net heating rate (real heat losses make boiling take even longer). (More energy is needed to separate the particles completely than to loosen them.)" },
  { band: "ext", q: "Water at 100 °C and steam at 100 °C: how do the molecules compare?",
    options: ["Steam molecules move faster", "The same average kinetic energy; the steam has much more potential energy", "Steam molecules are bigger", "The liquid molecules have more energy"],
    answer: 1, why: "Same temperature means the same average kinetic energy. Most of the extra 2257 J/g went into potential energy, pulling the molecules apart against their attractions (about 170 J/g pushes back the atmosphere as the gas expands)." },
];

// ---------- common mix-ups ----------
export const MIXUPS = [
  { myth: "\"The temperature keeps rising while the water boils.\"", truth: { y7: "It stops at 100 °C. Extra energy goes into turning liquid into gas, so the water just boils away faster. Try 250 W and watch the graph.", ext: "At the boiling point the supplied energy becomes potential energy of the separated molecules (latent heat), not kinetic energy, so T stays at 100 °C at 1 atm." } },
  { myth: "\"The bubbles in boiling water are air.\"", truth: { y7: "They are water vapour. The tiny bubbles you see on the bottom <i>before</i> boiling are dissolved air coming out of solution; these are different.", ext: "Bubbles that form at boiling are pockets of water vapour whose pressure equals the surrounding pressure. Dissolved air (less soluble when warm) comes out first as tiny bubbles well below 100 °C." } },
  { myth: "\"The white cloud above a kettle is steam.\"", truth: { y7: "Steam is invisible. The cloud is tiny droplets of liquid water, formed when steam meets cooler air. Hover over the mist in the beaker.", ext: "Steam is water vapour, a transparent gas. The visible cloud is condensed droplets (a few micrometres across) that scatter light." } },
  { myth: "\"Water only evaporates at 100 °C.\"", truth: { y7: "Evaporation happens from the surface at any temperature. Look at the evaporation rate in \"What's happening\" when the water is warm but not boiling.", ext: "Surface molecules with enough kinetic energy escape at all temperatures; the vapour pressure rises with temperature (Buck equation in the model), and boiling begins when it equals the air pressure." } },
  { myth: "\"Ice is always 0 °C.\"", truth: { y7: "Ice from a freezer is colder (about −18 °C). It warms up first, then melts at 0 °C. Start the model at −20 °C and watch the first section of the graph.", ext: "Ice has a specific heat capacity (2.09 J/g°C) like any other solid, so it can be any temperature up to its melting point; only the melting point itself is fixed at 0 °C." } },
  { myth: "\"Melting and dissolving are the same thing.\"", truth: { y7: "Melting is one substance changing from solid to liquid when heated. Dissolving is a solid mixing into a liquid, like sugar in water, with no heat needed. You'll meet dissolving in the next station.", ext: "Melting is a change of state of a pure substance at its melting point. Dissolving forms a solution (a mixture): solvent molecules surround solute particles, which can happen at any temperature." } },
  { myth: "\"The hotplate on 'low' will eventually boil the water.\"", truth: { y7: "Not necessarily. The water loses heat to the air. At low power, heat in and heat lost balance and the temperature levels off. Try 30 W.", ext: "At steady state, power in = h(T − T_room). With h = 0.35 W/°C, 27 W is needed just to hold 100 °C; below that the sample plateaus below the boiling point." } },
];

// ---------- data & sources ----------
export const SIMPLIFICATIONS = [
  "The whole sample is stirred, so one temperature describes it.",
  "Specific heat capacities are constant within each state (ice 2.09, liquid 4.18, steam 2.08 J per gram per °C).",
  "Pure water at 101.325 kPa (normal air pressure): melting point exactly 0 °C, boiling point exactly 100 °C. No supercooling or superheating.",
  "Heat loss uses one coefficient (0.35 W per °C in air, 3 W per °C in the stirred bath).",
  "Evaporation below 100 °C is scaled with the vapour pressure but is set at teaching scale (about 2 g per hour at room temperature).",
  "The sealed syringe stays at atmospheric pressure, so the steam expands as the plunger moves. The plunger travel on screen is compressed (logarithmic scale) so you can see it; real steam would take up about 1700 times the volume of the water.",
  "The syringe has no air in it, only water and its own vapour, so the whole pressure is from the steam.",
  "The model runs faster than real time (10× to 120×). Real water would take the same energy, just much longer to watch.",
];
export const DATA_ROWS = [
  ["Specific heat capacity", `ice ${WATER.cSolid}, liquid ${WATER.cLiquid}, steam ${WATER.cGas} J/(g·°C)`],
  ["Latent heat of fusion", `${WATER.Lf} J/g at 0 °C`],
  ["Latent heat of vaporisation", `${WATER.Lv} J/g at 100 °C`],
  ["Density", "ice 0.917, water 1.00 g/cm³ (near 0 –20 °C)"],
  ["Steam volume", "1.673 L per gram at 100 °C, 1 atm"],
];
export const SOURCES = [
  ...WATER.sources,
  { what: "Density of ice and liquid water", ref: "CRC Handbook of Chemistry and Physics (97th ed.), 6-5 'Properties of water'", url: "https://hbcp.chemnetbase.com" },
];
