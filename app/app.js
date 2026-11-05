"use strict";

const storageKey = "the-system.player.v1";
const byId = (id) => document.getElementById(id);
const views = [...document.querySelectorAll("[data-view]")];
const navigation = [...document.querySelectorAll(".nav-link")];
const dateLabel = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric" });
const amountLabel = new Intl.NumberFormat("en-GB", { maximumFractionDigits: 1 });
const presetControl = byId("preset");
const trainingForm = byId("training-form");
let state = load();
let renderedDay;
let toastTimer;

function load() {
  try {
    const saved = JSON.parse(localStorage.getItem(storageKey));
    if (Array.isArray(saved?.quests) && Array.isArray(saved?.claims)) return saved;
  } catch {
    // Training remains available for this session if storage is blocked.
  }
  return { quests: [], claims: [] };
}

function update(action) {
  const write = () => {
    try {
      if (localStorage.getItem(storageKey) !== null) state = load();
    } catch {
      // Keep session state when browser storage is unavailable.
    }
    const run = state.training ??= Training.fresh();
    const message = action(run);
    if (!message) return;
    try {
      localStorage.setItem(storageKey, JSON.stringify(state));
      showToast(message);
    } catch {
      showToast(message + " Browser storage is unavailable.");
    }
    render();
  };
  return navigator.locks ? navigator.locks.request(storageKey, write) : Promise.resolve(write());
}

function updateToday(action) {
  const visibleDay = renderedDay;
  return update((run) => {
    const now = dayKey();
    if (now !== visibleDay) return "A new daily quest is available.";
    return action(run, now);
  });
}

// Replay the old weekly rewards so existing saves retain their earned XP.
const bossHP = 100;
const dailyDamageCap = 30;
const clearBonus = 60;
function dayKey(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return year + "-" + month + "-" + day;
}

function shiftDay(day, offset) {
  const date = new Date(day + "T00:00:00Z");
  date.setUTCDate(date.getUTCDate() + offset);
  return date.toISOString().slice(0, 10);
}

function weekStart(day) {
  const weekday = new Date(day + "T00:00:00Z").getUTCDay();
  return shiftDay(day, -((weekday + 6) % 7));
}

function legacyCampaign(claims) {
  const attributesByDay = new Map();
  let xp = 0;
  for (const claim of claims) {
    xp += claim.xp;
    if (!attributesByDay.has(claim.day)) attributesByDay.set(claim.day, new Set());
    attributesByDay.get(claim.day).add(claim.category);
  }

  const weeks = new Map();
  let clears = 0;
  for (const day of [...attributesByDay.keys()].sort()) {
    const week = weekStart(day);
    const damage = weeks.get(week) ?? 0;
    const hit = Math.min(bossHP - damage, dailyDamageCap, attributesByDay.get(day).size * 10);
    weeks.set(week, damage + hit);
    if (hit > 0 && damage + hit === bossHP) clears += 1;
  }
  return xp + clears * clearBonus;
}

function progression(total) {
  let level = 1;
  let xp = total;
  let target = 100;
  while (xp >= target) {
    xp -= target;
    level += 1;
    target += 40;
  }
  return { level, xp, target };
}

function element(tag, className, label) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (label !== undefined) node.textContent = label;
  return node;
}

function exerciseRow(exercise, index, entry, goal) {
  const row = element("li", "exercise-row");
  const count = entry.counts[index];
  const targetMet = count >= goal;
  row.dataset.done = String(targetMet);
  const labels = element("div", "exercise-label");
  const label = element("label", "", exercise.name);
  label.htmlFor = exercise.id;
  const summary = element("span", "hint", amountLabel.format(count) + " / " + amountLabel.format(goal) + " " + exercise.unit);
  const meter = element("progress", "exercise-progress");
  meter.max = goal;
  meter.value = Math.min(count, goal);
  meter.setAttribute("aria-label", exercise.name + " progress");
  labels.append(label, summary, meter);
  const input = element("input", "exercise-input");
  input.id = exercise.id;
  input.type = "number";
  input.min = "0";
  input.max = exercise.unit === "km" ? "100" : "1000";
  input.step = String(exercise.step);
  input.value = String(count);
  input.required = true;
  input.setAttribute("aria-label", exercise.name + " completed (" + exercise.unit + ")");
  input.disabled = entry.claimed || entry.rest;
  row.append(labels, input);
  return row;
}

function renderDaily(run) {
  const entry = Training.day(run, renderedDay);
  const preset = Training.presets[entry.preset];
  const goalsMet = Training.achieved(entry);
  presetControl.value = entry.preset;
  presetControl.disabled = entry.claimed || entry.rest;
  byId("preset-hint").textContent = entry.preset === "anime"
    ? "Episode 3 targets: 100 of each exercise and a 10 km run. Switch to a scaled preset or take a rest day whenever you need."
    : "Log your totals as you go. Walking counts in scaled presets.";
  byId("exercises").replaceChildren(...Training.exercises.map((exercise, index) =>
    exerciseRow(exercise, index, entry, preset.goals[index])));
  byId("save-training").disabled = entry.claimed || entry.rest;
  byId("rest-day").hidden = entry.claimed;
  byId("rest-day").textContent = entry.rest ? "Resume training" : "Take a rest day";

  byId("quest-state").textContent = entry.claimed ? "Rewards claimed" :
    entry.rest ? "Rest day" : goalsMet === 4 ? "Quest complete" : goalsMet + " / 4 objectives complete";
  byId("claim-rewards").disabled = entry.claimed || entry.rest || goalsMet !== 4;
  byId("claim-rewards").textContent = entry.claimed ? "Claimed" : "Claim rewards";

  const missed = Training.missed(run, renderedDay);
  byId("penalty").hidden = !missed;
  byId("penalty-copy").textContent = missed
    ? "The " + dateLabel.format(new Date(missed + "T12:00:00")) + " quest expired. Return to your next quest when ready."
    : "";
}

function renderDungeon(run) {
  const gate = run.gate;
  const keys = run.loot.key ?? 0;
  const hits = gate?.hits ?? (run.clears ? Training.bossHits : 0);
  const remaining = Training.bossHits - hits;
  byId("boss-state").textContent = gate ? "In progress" : keys ? "Key available" : run.clears ? "Cleared" : "Gate locked";
  byId("key-count").textContent = keys + (keys === 1 ? " key" : " keys");
  byId("boss-health-label").textContent = remaining + " / " + Training.bossHits + " boss hits remaining";
  byId("boss-health").max = Training.bossHits;
  byId("boss-health").value = remaining;
  byId("gate-summary").textContent = gate ? "Kasaka · " + remaining + " hits remaining" :
    keys ? "Dungeon key available" : run.clears ? "Kasaka defeated" : "Find a key in a Random Box";
  byId("dungeon-goal").textContent = gate ? "Player HP: " + gate.hp + " / " + Training.maxHP + " (virtual)" :
    run.clears ? run.clears + (run.clears === 1 ? " clear" : " clears") : "A key drops from your first Random Box.";
  byId("enter-dungeon").hidden = Boolean(gate);
  byId("enter-dungeon").disabled = !keys;
  byId("enter-dungeon").textContent = run.clears ? "Reopen instance" : "Use dungeon key";
  byId("use-potion").hidden = !gate;
  byId("use-potion").disabled = !gate || gate.hp === Training.maxHP || !(run.loot.health > 0);
}

function renderStatus(run) {
  const { level, xp, target } = progression(legacyCampaign(state.claims) + run.clears * Training.dungeonXP);
  const available = Training.unspent(run);
  const boxes = Training.boxes(run);
  const entry = Training.day(run, renderedDay);
  const fatigue = entry.claimed ? 0 : Training.achieved(entry) * 15;
  byId("level").textContent = "Level " + level;
  byId("character-status").textContent = "Job: None · Fatigue: " + fatigue + " (virtual)";
  byId("xp-label").textContent = xp + " / " + target + " XP";
  byId("xp").max = target;
  byId("xp").value = xp;
  byId("unspent").textContent = available + " unspent";
  byId("stats").replaceChildren(...Training.stats.map((stat) => {
    const row = element("div", "stat");
    const code = element("span", "stat-code", stat.code);
    code.setAttribute("aria-hidden", "true");
    const button = element("button", "button stat-add", "+1");
    button.type = "button";
    button.setAttribute("aria-label", "Add 1 to " + stat.name);
    button.disabled = available === 0;
    button.addEventListener("click", async () => {
      await update((current) => Training.allocate(current, stat.id));
      const next = byId("stats").querySelector('button[aria-label="Add 1 to ' + stat.name + '"]');
      if (next && !next.disabled) next.focus();
    });
    row.append(code, element("strong", "", stat.name),
      element("span", "stat-value", String(10 + (run.points[stat.id] ?? 0))), button);
    return row;
  }));
  const entries = [{ name: "Random Box", detail: "Earned from daily training.", count: boxes },
    ...Object.entries(Training.loot).map(([key, item]) => ({ ...item, count: run.loot[key] ?? 0 }))];
  byId("inventory").replaceChildren(...entries.map((item) => {
    const row = element("li", "inventory-row");
    const copy = element("div");
    copy.append(element("strong", "", item.name), element("small", "", item.detail));
    row.append(copy, element("span", "badge", "×" + item.count));
    return row;
  }));
  byId("open-box").disabled = boxes < 1;
}

function render() {
  const now = new Date();
  renderedDay = dayKey(now);
  byId("date").textContent = dateLabel.format(now);
  const run = state.training ?? Training.fresh();
  renderDaily(run);
  renderDungeon(run);
  renderStatus(run);
  updateClock(now);
}

function updateClock(now = new Date()) {
  if (renderedDay !== dayKey(now)) {
    render();
    return;
  }
  const midnight = new Date(now);
  midnight.setHours(24, 0, 0, 0);
  const seconds = Math.ceil((midnight - now) / 1000);
  byId("countdown").textContent = [Math.floor(seconds / 3600), Math.floor(seconds / 60) % 60, seconds % 60]
    .map((value) => String(value).padStart(2, "0")).join(":");
}

function showToast(message) {
  const toast = byId("toast");
  toast.textContent = message;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { toast.textContent = ""; }, 5000);
}

function syncNavigation(moveFocus = false) {
  const selected = views.find((view) => "#" + view.id === location.hash) ?? views[0];
  for (const view of views) view.hidden = view !== selected;
  for (const link of navigation) {
    if (link.hash === "#" + selected.id) link.setAttribute("aria-current", "page");
    else link.removeAttribute("aria-current");
  }
  if (moveFocus) {
    window.scrollTo(0, 0);
    selected.querySelector("h1").focus({ preventScroll: true });
  }
}

presetControl.replaceChildren(...Object.entries(Training.presets).map(([id, preset]) => {
  const option = element("option", "", preset.name);
  option.value = id;
  return option;
}));
presetControl.addEventListener("change", () => {
  const preset = presetControl.value;
  updateToday((run, date) => Training.configure(run, date, preset));
});
trainingForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const counts = Training.exercises.map((exercise) => byId(exercise.id).valueAsNumber);
  updateToday((run, date) => Training.log(run, date, counts));
});
byId("rest-day").addEventListener("click", () => updateToday(Training.toggleRest));
byId("claim-rewards").addEventListener("click", () => updateToday(Training.claim));
byId("enter-dungeon").addEventListener("click", () => updateToday(Training.enter));
byId("use-potion").addEventListener("click", () => update(Training.usePotion));
byId("open-box").addEventListener("click", () => update((run) => Training.openBox(run)));
byId("dismiss-penalty").addEventListener("click", () => updateToday((run, date) => {
  const missed = Training.missed(run, date);
  if (!missed) return "";
  run.acknowledged = missed;
  return "Penalty Zone closed.";
}));

window.addEventListener("hashchange", () => syncNavigation(true));
window.addEventListener("storage", (event) => {
  if (event.key === storageKey || event.key === null) {
    state = load();
    render();
  }
});
window.addEventListener("focus", () => updateClock());
setInterval(updateClock, 1000);
syncNavigation();
render();
