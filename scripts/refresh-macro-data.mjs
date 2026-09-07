import { mkdir, writeFile } from "node:fs/promises";

const DATA_DIR = new URL("../data/", import.meta.url);
const SERIES = {
  DGS2: { name: "Randament SUA 2 ani", unit: "%", group: "Rate" },
  DGS10: { name: "Randament SUA 10 ani", unit: "%", group: "Rate" },
  DGS30: { name: "Randament SUA 30 ani", unit: "%", group: "Rate" },
  BAMLH0A0HYM2: { name: "Spread credit High Yield", unit: "pp", group: "Credit" },
  BAMLC0A0CM: { name: "Spread credit Investment Grade", unit: "pp", group: "Credit" },
  INDPRO: { name: "Producție industrială", unit: "index", group: "Macro" },
  CPIAUCSL: { name: "CPI", unit: "index", group: "Macro" },
  PAYEMS: { name: "Payrolls non-farm", unit: "mii locuri", group: "Macro" },
  ICSA: { name: "Cereri inițiale șomaj", unit: "mii", group: "Macro" }
};

function parseCsv(text, id) {
  return text.trim().split(/\r?\n/).slice(1).map((line) => {
    const [date, raw] = line.split(",");
    return { date, value: Number(raw) };
  }).filter((row) => row.date && Number.isFinite(row.value));
}
function pointAt(values, sessions) { return values.at(-(sessions + 1)) ?? null; }
async function fetchSeries(id, meta) {
  const response = await fetch(`https://fred.stlouisfed.org/graph/fredgraph.csv?id=${id}`, { headers: { "User-Agent": "Capital-Rotation-GitHub-Action" } });
  if (!response.ok) throw new Error(`${id}: HTTP ${response.status}`);
  const values = parseCsv(await response.text(), id);
  const latest = values.at(-1);
  if (!latest) throw new Error(`${id}: fără observații valide`);
  const makeChange = (sessions) => { const prior = pointAt(values, sessions); return prior ? latest.value - prior.value : null; };
  return { ...meta, latest, change5: makeChange(5), change20: makeChange(20), change60: makeChange(60) };
}

const entries = await Promise.all(Object.entries(SERIES).map(async ([id, meta]) => [id, await fetchSeries(id, meta)]));
await mkdir(DATA_DIR, { recursive: true });
await writeFile(new URL("macro.json", DATA_DIR), `${JSON.stringify({ updatedAt: new Date().toISOString(), source: "FRED", series: Object.fromEntries(entries) }, null, 2)}\n`);
console.log(`Actualizate ${entries.length} serii macro FRED.`);
