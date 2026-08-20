"use strict";

const KW = 1e-14;
const INITIAL_VOLUME_L = 0.025;

const MODES = {
  "strong-strong": {
    title: "Strong acid + strong base",
    description: "25.0 mL HCl titrated with NaOH",
    analyte: "HCl",
    titrant: "NaOH",
    xLabel: "NaOH added (mL)",
    intro: "The pH is set by the initial strong acid concentration."
  },
  "strong-weak": {
    title: "Strong acid + weak base",
    description: "25.0 mL NH₃ titrated with HCl",
    analyte: "NH₃",
    titrant: "HCl",
    xLabel: "HCl added (mL)",
    pKaBH: 9.25,
    intro: "The initial pH is set by the weak base equilibrium."
  },
  "weak-strong": {
    title: "Weak acid + strong base",
    description: "25.0 mL CH₃COOH titrated with NaOH",
    analyte: "CH₃COOH",
    titrant: "NaOH",
    xLabel: "NaOH added (mL)",
    pKaHA: 4.76,
    intro: "The initial pH is set by the weak acid equilibrium."
  },
  "weak-weak": {
    title: "Weak acid + weak base",
    description: "25.0 mL CH₃COOH titrated with NH₃",
    analyte: "CH₃COOH",
    titrant: "NH₃",
    xLabel: "NH₃ added (mL)",
    pKaHA: 4.76,
    pKaBH: 9.25,
    intro: "Both weak equilibria influence the starting and final pH."
  }
};

const els = {
  canvas: document.querySelector("#titration-chart"),
  wrap: document.querySelector("#chart-wrap"),
  tooltip: document.querySelector("#chart-tooltip"),
  tooltipPH: document.querySelector("#tooltip-ph"),
  tooltipVolume: document.querySelector("#tooltip-volume"),
  title: document.querySelector("#mode-title"),
  description: document.querySelector("#mode-description"),
  region: document.querySelector("#region-label"),
  eqLabel: document.querySelector("#equivalence-label"),
  bufferKey: document.querySelector("#buffer-key"),
  selectedPH: document.querySelector("#selected-ph"),
  selectedVolume: document.querySelector("#selected-volume"),
  speciesList: document.querySelector("#species-list"),
  speciesNote: document.querySelector("#species-note"),
  bufferBadge: document.querySelector("#buffer-badge"),
  milestoneKicker: document.querySelector("#milestone-kicker"),
  milestoneText: document.querySelector("#milestone-text"),
  analyteLabel: document.querySelector("#analyte-label"),
  titrantLabel: document.querySelector("#titrant-label"),
  analyteInput: document.querySelector("#analyte-concentration"),
  titrantInput: document.querySelector("#titrant-concentration"),
  analyteOutput: document.querySelector("#analyte-output"),
  titrantOutput: document.querySelector("#titrant-output")
};

const state = {
  mode: "strong-strong",
  analyteC: 0.1,
  titrantC: 0.1,
  selectedML: 0,
  hoverVisible: false,
  dragging: false,
  data: [],
  xMax: 50,
  plot: null
};

const ctx = els.canvas.getContext("2d");

function solveHydrogen(chargeAtH) {
  let low = -14.5;
  let high = 0.5;
  for (let i = 0; i < 100; i += 1) {
    const mid = (low + high) / 2;
    const h = 10 ** mid;
    if (chargeAtH(h) > 0) high = mid;
    else low = mid;
  }
  return 10 ** ((low + high) / 2);
}

function chemistryAt(volumeML) {
  const mode = MODES[state.mode];
  const vT = volumeML / 1000;
  const totalV = INITIAL_VOLUME_L + vT;
  const analyteTotal = state.analyteC * INITIAL_VOLUME_L / totalV;
  const titrantTotal = state.titrantC * vT / totalV;

  const strongAcid = state.mode === "strong-strong" ? analyteTotal : state.mode === "strong-weak" ? titrantTotal : 0;
  const strongBase = state.mode === "strong-strong" ? titrantTotal : state.mode === "weak-strong" ? titrantTotal : 0;
  const weakAcidTotal = state.mode === "weak-strong" || state.mode === "weak-weak" ? analyteTotal : 0;
  const weakBaseTotal = state.mode === "strong-weak" ? analyteTotal : state.mode === "weak-weak" ? titrantTotal : 0;
  const kaHA = mode.pKaHA ? 10 ** (-mode.pKaHA) : 0;
  const kaBH = mode.pKaBH ? 10 ** (-mode.pKaBH) : 0;

  const h = solveHydrogen((trialH) => {
    const oh = KW / trialH;
    const aMinus = weakAcidTotal ? weakAcidTotal * kaHA / (kaHA + trialH) : 0;
    const bhPlus = weakBaseTotal ? weakBaseTotal * trialH / (kaBH + trialH) : 0;
    return trialH + strongBase + bhPlus - oh - strongAcid - aMinus;
  });

  const oh = KW / h;
  const aMinus = weakAcidTotal ? weakAcidTotal * kaHA / (kaHA + h) : 0;
  const ha = weakAcidTotal - aMinus;
  const bhPlus = weakBaseTotal ? weakBaseTotal * h / (kaBH + h) : 0;
  const b = weakBaseTotal - bhPlus;

  return {
    volumeML,
    pH: Math.max(0, Math.min(14, -Math.log10(h))),
    h, oh, ha, aMinus, b, bhPlus,
    analyteTotal, titrantTotal
  };
}

function eqVolumeML() {
  return state.analyteC * INITIAL_VOLUME_L / state.titrantC * 1000;
}

function bufferGuide() {
  if (state.mode === "strong-strong") return null;
  const mode = MODES[state.mode];
  const eq = eqVolumeML();
  return {
    startML: eq / 11,
    endML: eq * 10 / 11,
    halfML: eq / 2,
    pKa: state.mode === "strong-weak" ? mode.pKaBH : mode.pKaHA
  };
}

function rebuildData() {
  const eq = eqVolumeML();
  state.xMax = Math.max(50, Math.ceil((eq * 1.65) / 10) * 10);
  state.data = Array.from({ length: 601 }, (_, i) => chemistryAt(state.xMax * i / 600));
  state.selectedML = Math.min(state.selectedML, state.xMax);
}

function formatConcentration(value) {
  if (value < 1e-5) return value.toExponential(2) + " M";
  if (value < 0.001) return (value * 1000).toFixed(3) + " mM";
  return value.toFixed(4) + " M";
}

function regionFor(volumeML) {
  const eq = eqVolumeML();
  const ratio = volumeML / eq;
  if (volumeML < Math.max(.12, eq * .006)) return "Starting solution";
  if (Math.abs(ratio - .5) < .025) return "Half-equivalence point";
  if (Math.abs(ratio - 1) < .018) return "Equivalence point";
  if (ratio < 1) return "Before equivalence";
  return "After equivalence";
}

function compositionFor(point) {
  const mode = MODES[state.mode];
  const eq = eqVolumeML();
  const ratio = point.volumeML / eq;
  let species = [];
  let note = "";
  let buffer = false;

  if (state.mode === "strong-strong") {
    species = [["[H₃O⁺]", point.h], ["[OH⁻]", point.oh]];
    note = ratio < .985 ? "Strong acid is in excess." : ratio > 1.015 ? "Strong base is in excess." : "The strong acid and base have neutralised each other.";
  } else if (state.mode === "weak-strong") {
    species = [["[CH₃COOH]", point.ha], ["[CH₃COO⁻]", point.aMinus], ["[OH⁻]", point.oh]];
    buffer = point.ha > 0 && point.aMinus / point.ha >= .1 && point.aMinus / point.ha <= 10;
    note = buffer ? "The weak acid and its conjugate base form a buffer." : ratio < 1 ? "Acetate is forming as the weak acid is neutralised." : "At and beyond equivalence, acetate or excess OH⁻ controls pH.";
  } else if (state.mode === "strong-weak") {
    species = [["[NH₃]", point.b], ["[NH₄⁺]", point.bhPlus], ["[H₃O⁺]", point.h]];
    buffer = point.b > 0 && point.bhPlus / point.b >= .1 && point.bhPlus / point.b <= 10;
    note = buffer ? "The weak base and its conjugate acid form a buffer." : ratio < 1 ? "Ammonium is forming as the weak base is neutralised." : "At and beyond equivalence, NH₄⁺ or excess H₃O⁺ controls pH.";
  } else {
    species = [["[CH₃COOH]", point.ha], ["[CH₃COO⁻]", point.aMinus], ["[NH₃]", point.b], ["[NH₄⁺]", point.bhPlus]];
    const acidBuffer = point.ha > 0 && point.aMinus / point.ha >= .1 && point.aMinus / point.ha <= 10;
    const baseBuffer = point.b > 0 && point.bhPlus / point.b >= .1 && point.bhPlus / point.b <= 10;
    buffer = acidBuffer || baseBuffer;
    note = buffer ? "Conjugate acid–base pairs resist a sudden pH change." : "Both weak equilibria contribute to the pH.";
  }
  return { species, note, buffer, mode };
}

function milestoneFor(point) {
  const region = regionFor(point.volumeML);
  const mode = MODES[state.mode];
  if (region === "Starting solution") return ["STARTING SOLUTION", mode.intro];
  if (region === "Half-equivalence point") {
    if (state.mode === "weak-strong") return ["HALF-EQUIVALENCE", `Equal CH₃COOH and CH₃COO⁻ concentrations give pH ≈ pKₐ = ${mode.pKaHA}.`];
    if (state.mode === "strong-weak") return ["HALF-EQUIVALENCE", `Equal NH₃ and NH₄⁺ concentrations give pH ≈ pKₐ = ${mode.pKaBH}.`];
    return ["HALF-EQUIVALENCE", "Half of the original analyte has been neutralised."];
  }
  if (region === "Equivalence point") {
    const messages = {
      "strong-strong": "Equal strong-acid and strong-base amounts give pH ≈ 7.00 at 25 °C.",
      "strong-weak": "NH₄⁺ makes the equivalence solution acidic.",
      "weak-strong": "CH₃COO⁻ makes the equivalence solution basic.",
      "weak-weak": "The equivalence pH depends on the relative Kₐ and Kᵦ values."
    };
    return ["EQUIVALENCE POINT", messages[state.mode]];
  }
  if (region === "After equivalence") return ["TITRANT IN EXCESS", `Added ${mode.titrant} now has the greatest influence on pH.`];
  return ["APPROACHING EQUIVALENCE", "The analyte is being neutralised as titrant is added."];
}

function niceTicks(max, count) {
  const rough = max / count;
  const power = 10 ** Math.floor(Math.log10(rough));
  const fraction = rough / power;
  const nice = fraction <= 1 ? 1 : fraction <= 2 ? 2 : fraction <= 5 ? 5 : 10;
  const step = nice * power;
  const ticks = [];
  for (let value = 0; value <= max + step * .1; value += step) ticks.push(value);
  return ticks;
}

function drawChart() {
  const rect = els.wrap.getBoundingClientRect();
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  els.canvas.width = Math.round(rect.width * dpr);
  els.canvas.height = Math.round(rect.height * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  const compact = rect.width < 520;
  const margin = { left: compact ? 48 : 58, right: 18, top: 12, bottom: 48 };
  const plot = { x: margin.left, y: margin.top, w: rect.width - margin.left - margin.right, h: rect.height - margin.top - margin.bottom };
  state.plot = plot;
  const x = value => plot.x + value / state.xMax * plot.w;
  const y = value => plot.y + (14 - value) / 14 * plot.h;

  ctx.clearRect(0, 0, rect.width, rect.height);
  ctx.fillStyle = "rgba(255,255,255,.88)";
  ctx.fillRect(plot.x, plot.y, plot.w, plot.h);

  const guide = bufferGuide();
  if (guide) {
    const bandStart = Math.max(plot.x, x(guide.startML));
    const bandEnd = Math.min(plot.x + plot.w, x(guide.endML));
    if (bandEnd > bandStart) {
      ctx.fillStyle = "rgba(22,133,107,.085)";
      ctx.fillRect(bandStart, plot.y, bandEnd - bandStart, plot.h);
    }
  }

  ctx.font = "12px 'DM Sans', sans-serif";
  ctx.textBaseline = "middle";

  for (let pH = 0; pH <= 14; pH += 2) {
    const py = y(pH);
    ctx.strokeStyle = pH === 7 ? "#c9d4e5" : "#e5eaf1";
    ctx.lineWidth = pH === 7 ? 1.4 : 1;
    ctx.beginPath(); ctx.moveTo(plot.x, py); ctx.lineTo(plot.x + plot.w, py); ctx.stroke();
    ctx.fillStyle = "#60708f"; ctx.textAlign = "right"; ctx.fillText(String(pH), plot.x - 10, py);
  }

  const xTicks = niceTicks(state.xMax, compact ? 4 : 7);
  xTicks.forEach(value => {
    const px = x(value);
    ctx.strokeStyle = "#e5eaf1"; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(px, plot.y); ctx.lineTo(px, plot.y + plot.h); ctx.stroke();
    ctx.fillStyle = "#60708f"; ctx.textAlign = "center"; ctx.fillText(value.toFixed(0), px, plot.y + plot.h + 18);
  });

  ctx.strokeStyle = "#9dacbf"; ctx.lineWidth = 1.2; ctx.strokeRect(plot.x, plot.y, plot.w, plot.h);
  ctx.fillStyle = "#16223d"; ctx.font = "600 12px 'DM Sans', sans-serif"; ctx.textAlign = "center";
  ctx.fillText(MODES[state.mode].xLabel, plot.x + plot.w / 2, rect.height - 10);
  ctx.save(); ctx.translate(14, plot.y + plot.h / 2); ctx.rotate(-Math.PI / 2); ctx.fillText("pH", 0, 0); ctx.restore();

  const eqX = x(eqVolumeML());
  if (eqX <= plot.x + plot.w) {
    ctx.save(); ctx.setLineDash([5, 5]); ctx.strokeStyle = "rgba(34,89,215,.55)"; ctx.lineWidth = 1.3;
    ctx.beginPath(); ctx.moveTo(eqX, plot.y); ctx.lineTo(eqX, plot.y + plot.h); ctx.stroke(); ctx.restore();
  }

  if (guide) {
    const halfX = x(guide.halfML);
    if (halfX >= plot.x && halfX <= plot.x + plot.w) {
      ctx.save();
      ctx.strokeStyle = "rgba(22,133,107,.72)";
      ctx.lineWidth = 1.25;
      ctx.beginPath(); ctx.moveTo(halfX, plot.y); ctx.lineTo(halfX, plot.y + plot.h); ctx.stroke();

      const halfLabel = compact ? `½ eq · pKₐ ${guide.pKa}` : `½ equivalence · pH = pKₐ ${guide.pKa}`;
      ctx.font = "600 11px 'DM Sans', sans-serif";
      const labelWidth = ctx.measureText(halfLabel).width;
      const placeRight = halfX + labelWidth + 9 <= plot.x + plot.w;
      ctx.textAlign = placeRight ? "left" : "right";
      ctx.fillStyle = "#16856b";
      ctx.fillText(halfLabel, halfX + (placeRight ? 7 : -7), plot.y + 15);
      ctx.restore();
    }
  }

  ctx.beginPath();
  state.data.forEach((point, i) => {
    const px = x(point.volumeML); const py = y(point.pH);
    if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
  });
  ctx.strokeStyle = "#ef4444"; ctx.lineWidth = 4; ctx.lineCap = "round"; ctx.lineJoin = "round"; ctx.stroke();

  const selected = chemistryAt(state.selectedML);
  const sx = x(selected.volumeML); const sy = y(selected.pH);
  ctx.strokeStyle = "rgba(22,34,61,.28)"; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(sx, plot.y); ctx.lineTo(sx, plot.y + plot.h); ctx.stroke();
  ctx.fillStyle = "#fff"; ctx.strokeStyle = "#ef4444"; ctx.lineWidth = 3;
  ctx.beginPath(); ctx.arc(sx, sy, 6, 0, Math.PI * 2); ctx.fill(); ctx.stroke();

  if (state.hoverVisible) positionTooltip(sx, sy, selected);
}

function positionTooltip(x, y, point) {
  els.tooltip.hidden = false;
  els.tooltipPH.textContent = `pH ${point.pH.toFixed(2)}`;
  els.tooltipVolume.textContent = `${point.volumeML.toFixed(1)} mL added`;
  const tooltipWidth = 130;
  const left = x + tooltipWidth + 18 > els.wrap.clientWidth ? x - tooltipWidth - 12 : x;
  els.tooltip.style.left = `${left}px`;
  els.tooltip.style.top = `${Math.max(34, Math.min(els.wrap.clientHeight - 34, y))}px`;
  els.tooltip.style.transform = left < x ? "translate(0, -50%)" : "translate(12px, -50%)";
}

function updateInspector() {
  const point = chemistryAt(state.selectedML);
  const comp = compositionFor(point);
  const milestone = milestoneFor(point);
  const region = regionFor(point.volumeML);
  els.region.textContent = region;
  els.selectedPH.textContent = `pH ${point.pH.toFixed(2)}`;
  els.selectedVolume.textContent = `${point.volumeML.toFixed(1)} mL ${MODES[state.mode].titrant} added`;
  els.speciesNote.textContent = comp.note;
  els.bufferBadge.hidden = !comp.buffer;
  els.speciesList.innerHTML = comp.species.map(([name, value]) => `<div><dt>${name}</dt><dd>${formatConcentration(value)}</dd></div>`).join("");
  els.milestoneKicker.textContent = milestone[0];
  els.milestoneText.textContent = milestone[1];
}

function render() {
  const mode = MODES[state.mode];
  els.title.textContent = mode.title;
  els.description.textContent = mode.description;
  els.analyteLabel.textContent = `${mode.analyte} concentration`;
  els.titrantLabel.textContent = `${mode.titrant} concentration`;
  els.analyteOutput.textContent = `${state.analyteC.toFixed(3)} mol/L`;
  els.titrantOutput.textContent = `${state.titrantC.toFixed(3)} mol/L`;
  els.eqLabel.textContent = `Equivalence: ${eqVolumeML().toFixed(1)} mL`;
  els.bufferKey.hidden = state.mode === "strong-strong";
  updateInspector();
  drawChart();
}

function setSelectedFromClientX(clientX) {
  const bounds = els.wrap.getBoundingClientRect();
  if (!state.plot) return;
  const localX = clientX - bounds.left;
  state.selectedML = Math.max(0, Math.min(state.xMax, (localX - state.plot.x) / state.plot.w * state.xMax));
  state.hoverVisible = true;
  updateInspector();
  drawChart();
}

document.querySelectorAll(".tab").forEach(tab => {
  tab.addEventListener("click", () => {
    state.mode = tab.dataset.mode;
    state.selectedML = 0;
    state.hoverVisible = false;
    els.tooltip.hidden = true;
    document.querySelectorAll(".tab").forEach(item => {
      const active = item === tab;
      item.classList.toggle("is-active", active);
      item.setAttribute("aria-pressed", String(active));
    });
    rebuildData();
    render();
  });
});

els.analyteInput.addEventListener("input", event => {
  state.analyteC = Number(event.target.value);
  rebuildData(); render();
});
els.titrantInput.addEventListener("input", event => {
  state.titrantC = Number(event.target.value);
  rebuildData(); render();
});

els.wrap.addEventListener("pointerdown", event => {
  state.dragging = true;
  els.wrap.setPointerCapture(event.pointerId);
  setSelectedFromClientX(event.clientX);
});
els.wrap.addEventListener("pointermove", event => {
  if (event.pointerType === "mouse" || state.dragging) setSelectedFromClientX(event.clientX);
});
els.wrap.addEventListener("pointerup", event => {
  state.dragging = false;
  if (els.wrap.hasPointerCapture(event.pointerId)) els.wrap.releasePointerCapture(event.pointerId);
});
els.wrap.addEventListener("pointerleave", () => {
  if (!state.dragging) { state.hoverVisible = false; els.tooltip.hidden = true; drawChart(); }
});
els.wrap.addEventListener("wheel", event => {
  event.preventDefault();
  const step = state.xMax / 250;
  state.selectedML = Math.max(0, Math.min(state.xMax, state.selectedML + Math.sign(event.deltaY) * step));
  state.hoverVisible = true;
  updateInspector(); drawChart();
}, { passive: false });

new ResizeObserver(drawChart).observe(els.wrap);
rebuildData();
render();
