import { readFile, writeFile } from "node:fs/promises";

const DATA_DIR = new URL("../data/", import.meta.url);
const SECTORS = new Set(["XLF", "XLI", "XLY", "XLB", "XLE", "XLC", "XLV", "XLP", "XLU", "XLRE", "XLK"]);
const read = async (name) => JSON.parse(await readFile(new URL(name, DATA_DIR), "utf8"));
const previousScore = (history, symbol, sessions) => { const dates = Object.keys(history).sort(); return dates.length > sessions ? history[dates.at(-(sessions + 1))]?.[symbol] : null; };
function macroAdjustment(symbol, macro) {
  const series = macro.series || {}, tenYear = series.DGS10, hy = series.BAMLH0A0HYM2, production = series.INDPRO;
  if (!tenYear || !hy || !production) return { value: 0, reasons: [] };
  const ratesUp = tenYear.change20 > 0.12, ratesDown = tenYear.change20 < -0.12, creditGood = hy.change20 < -0.1, creditBad = hy.change20 > 0.1, industryUp = production.change3 > 0;
  let value = 0; const reasons = [];
  const add = (points, text) => { value += points; reasons.push(text); };
  if (["XLI", "XLB"].includes(symbol) && industryUp) add(4, "producția industrială susține ciclicele");
  if (symbol === "XLE" && industryUp) add(3, "activitatea industrială susține cererea energetică");
  if (["XLI", "XLB", "XLY", "XLF"].includes(symbol) && creditGood) add(2, "creditul se relaxează");
  if (["XLI", "XLB", "XLY", "XLF"].includes(symbol) && creditBad) add(-3, "creditul se deteriorează");
  if (["XLK", "XLC", "XLRE", "XLU"].includes(symbol) && ratesDown) add(4, "ratele în scădere ajută activele sensibile la durată");
  if (["XLK", "XLC", "XLRE", "XLU"].includes(symbol) && ratesUp) add(-4, "ratele în creștere apasă activele sensibile la durată");
  if (symbol === "XLF" && ratesUp) add(2, "ratele mai ridicate susțin marjele bancare, cu risc de credit");
  if (["XLP", "XLV", "XLU"].includes(symbol) && creditBad) add(2, "caracter defensiv într-un credit mai slab");
  return { value: Math.max(-8, Math.min(8, value)), reasons };
}
const [latest, history, macro, rotationHistory] = await Promise.all([read("latest.json"), read("history.json"), read("macro.json"), read("sector-rotation-history.json")]);
const snapshot = {};
for (const row of latest.rows.filter((item) => SECTORS.has(item.symbol))) {
  const trend = (row.vs50 > 0 ? 10 : 0) + (row.vs200 > 0 ? 10 : 0), rs = (row.relative1m > 0 ? 15 : 0) + (row.relative3m > 0 ? 15 : 0), momentum = (row.oneMonth > 0 ? 8 : 0) + (row.threeMonths > 0 ? 8 : 0), acceleration = (row.fiveDay > 0 ? 7 : 0) + (row.fiveDay > (row.oneMonth || 0) / 4 ? 7 : 0), volume = row.rvol >= 1 ? 5 : 0;
  const oneWeek = previousScore(history, row.symbol, 5), fourWeeks = previousScore(history, row.symbol, 20), current = row.score ?? 0;
  const scoreMomentum = (current > oneWeek ? 3 : 0) + (current > fourWeeks ? 2 : 0) - (current < oneWeek ? 3 : 0) - (current < fourWeeks ? 2 : 0);
  const macroFactor = macroAdjustment(row.symbol, macro);
  const score = Math.max(0, Math.min(100, trend + rs + momentum + acceleration + volume + scoreMomentum + macroFactor.value));
  snapshot[row.symbol] = { score, macroAdjustment: macroFactor.value, macroReasons: macroFactor.reasons };
}
rotationHistory[latest.marketDate] = snapshot;
await writeFile(new URL("sector-rotation-history.json", DATA_DIR), `${JSON.stringify(rotationHistory, null, 2)}\n`);
console.log(`Salvat scorul sectorial pentru ${Object.keys(snapshot).length} sectoare, data ${latest.marketDate}.`);
