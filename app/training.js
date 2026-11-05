"use strict";

const Training = (() => {
  const exercises = [
    { id: "pushups", name: "Push-ups", unit: "reps", step: 1 },
    { id: "situps", name: "Sit-ups", unit: "reps", step: 1 },
    { id: "squats", name: "Squats", unit: "reps", step: 1 },
    { id: "distance", name: "Run", unit: "km", step: 0.1 },
  ];
  const presets = {
    starter: { name: "Scaled · Starter", goals: [5, 5, 10, 0.5] },
    training: { name: "Scaled · Training", goals: [20, 20, 20, 2] },
    anime: { name: "Anime · Episode 3", goals: [100, 100, 100, 10] },
  };
  const stats = [
    { id: "strength", name: "Strength", code: "STR" },
    { id: "vitality", name: "Vitality", code: "VIT" },
    { id: "agility", name: "Agility", code: "AGI" },
    { id: "intelligence", name: "Intelligence", code: "INT" },
    { id: "perception", name: "Perception", code: "PER" },
  ];
  const loot = {
    key: { name: "Instance Dungeon Key", detail: "Opens the subway instance." },
    health: { name: "Health Potion", detail: "Restores 25 virtual HP during a dungeon run." },
    crystal: { name: "Essence Stone", detail: "Collectible dungeon loot." },
  };
  const maxHP = 100;
  const bossHits = 3;
  const dungeonXP = 100;

  function fresh() {
    return { preset: "starter", days: {}, points: {}, loot: {}, opened: 0, clears: 0, acknowledged: "" };
  }

  function day(run, date) {
    return run.days[date] ?? { preset: run.preset, counts: [0, 0, 0, 0], rest: false, claimed: false };
  }

  function achieved(entry) {
    return presets[entry.preset].goals.filter((goal, index) => entry.counts[index] >= goal).length;
  }

  function configure(run, date, preset) {
    const entry = day(run, date);
    if (entry.claimed || !Object.hasOwn(presets, preset)) return "";
    run.preset = preset;
    run.days[date] = { ...entry, preset };
    return "Training targets updated.";
  }

  function log(run, date, counts) {
    const entry = day(run, date);
    if (entry.claimed || entry.rest || counts.length !== exercises.length) return "";
    if (!counts.every((amount, index) => Number.isFinite(amount) && amount >= 0 &&
      amount <= (index === 3 ? 100 : 1000) && (index === 3 || Number.isInteger(amount)))) return "";
    run.days[date] = { ...entry, counts };
    return achieved(run.days[date]) === exercises.length ? "Daily quest complete. Rewards available." : "Training progress saved.";
  }

  function toggleRest(run, date) {
    const entry = day(run, date);
    if (entry.claimed) return "";
    run.days[date] = { ...entry, rest: !entry.rest };
    return entry.rest ? "Daily quest resumed." : "Rest day recorded.";
  }

  function claim(run, date) {
    const entry = day(run, date);
    if (entry.rest || entry.claimed || achieved(entry) !== exercises.length) return "";
    run.days[date] = { ...entry, claimed: true };
    let message = "Rewards received. Full Recovery, +3 stat points, and a Random Box.";
    const gate = run.gate;
    if (gate?.hp > 0 && date > gate.entered) {
      gate.hits += 1;
      if (gate.hits === bossHits) {
        run.clears += 1;
        delete run.gate;
        message += " Kasaka defeated. +" + dungeonXP + " XP.";
      } else {
        gate.hp -= 25;
        message += " Hit landed on Kasaka.";
      }
    }
    return message;
  }

  function unspent(run) {
    const earned = Object.values(run.days).filter((entry) => entry.claimed).length * 3;
    return earned - Object.values(run.points).reduce((total, count) => total + count, 0);
  }

  function allocate(run, id) {
    if (unspent(run) < 1 || !stats.some((stat) => stat.id === id)) return "";
    run.points[id] = (run.points[id] ?? 0) + 1;
    return "+1 " + stats.find((stat) => stat.id === id).name + ".";
  }

  function boxes(run) {
    return Object.values(run.days).filter((entry) => entry.claimed).length - run.opened;
  }

  function openBox(run, random = Math.random) {
    if (boxes(run) < 1) return "";
    const pool = Object.keys(loot);
    const item = run.opened === 0 ? "key" : pool[Math.floor(random() * pool.length)];
    run.opened += 1;
    run.loot[item] = (run.loot[item] ?? 0) + 1;
    return "Random Box opened: " + loot[item].name + ".";
  }

  function enter(run, date) {
    if (run.gate || !(run.loot.key > 0)) return "";
    run.loot.key -= 1;
    run.gate = { entered: date, hits: 0, hp: maxHP };
    return "Instance Dungeon entered. Your next completed training day attacks Kasaka.";
  }

  function usePotion(run) {
    if (!run.gate || run.gate.hp >= maxHP || !(run.loot.health > 0)) return "";
    run.loot.health -= 1;
    run.gate.hp = Math.min(maxHP, run.gate.hp + 25);
    return "Health Potion used. Virtual HP restored.";
  }

  function missed(run, date) {
    return Object.keys(run.days).filter((key) => key < date && key > run.acknowledged)
      .sort().reverse().find((key) => {
        const entry = run.days[key];
        return !entry.claimed && !entry.rest && entry.counts.some((count) => count > 0);
      });
  }

  return { exercises, presets, stats, loot, bossHits, dungeonXP, maxHP, fresh, day, achieved, configure, log,
    toggleRest, claim, unspent, allocate, boxes, openBox, enter, usePotion, missed };
})();
