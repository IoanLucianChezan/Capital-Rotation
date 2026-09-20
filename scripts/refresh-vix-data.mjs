import { writeFile } from "node:fs/promises";

const DATA_DIR = new URL("../data/", import.meta.url);
const TWELVE_KEY = process.env.TWELVE_DATA_API_KEY;
const indices = [
  ["VIX9D", "_VIX9D"],
  ["VIX", "_VIX"],
  ["VIX3M", "_VIX3M"]
];

async function cboeIndex(name, symbol) {
  const response = await fetch(`https://cdn.cboe.com/api/global/delayed_quotes/quotes/${symbol}.json`);
  const body = await response.json();
  const item = body?.data;
  if (!response.ok || !Number.isFinite(item?.current_price)) throw new Error(`${name}: Cboe nu a returnat o cotație validă.`);
  return { name, value: item.current_price, change: item.price_change ?? null, changePercent: item.price_change_percent ?? null, asOf: item.last_trade_time ?? null, source: "Cboe delayed" };
}

async function twelveQuote(label, candidates) {
  if (!TWELVE_KEY) return { label, value: null, unavailable: "Twelve Data nu este configurat." };
  for (const symbol of candidates) {
    const url = new URL("https://api.twelvedata.com/quote");
    url.search = new URLSearchParams({ symbol, apikey: TWELVE_KEY });
    try {
      const response = await fetch(url);
      const body = await response.json();
      const value = Number(body.close ?? body.price);
      if (response.ok && Number.isFinite(value) && value > 0) return { label, symbol: body.symbol || symbol, value, change: Number.isFinite(Number(body.change)) ? Number(body.change) : null, changePercent: Number.isFinite(Number(body.percent_change)) ? Number(body.percent_change) : null, source: "Twelve Data" };
    } catch { /* încearcă următorul format de simbol */ }
  }
  return { label, value: null, unavailable: "Contractul nu este disponibil momentan prin furnizorul de date." };
}

const indexResults = await Promise.all(indices.map(([name, symbol]) => cboeIndex(name, symbol)));
const [m1, m2] = await Promise.all([
  twelveQuote("M1", ["VX1!", "VX1"]),
  twelveQuote("M2", ["VX2!", "VX2"])
]);
const lookup = Object.fromEntries(indexResults.map((item) => [item.name, item]));
const ratio = (a, b) => Number.isFinite(a) && Number.isFinite(b) && b !== 0 ? a / b : null;
const indexStructure = ratio(lookup.VIX?.value, lookup.VIX3M?.value) == null ? null : lookup.VIX.value < lookup.VIX3M.value ? "NORMAL / UPWARD SLOPING" : "INVERTED";
const futuresSpread = ratio(m2.value - m1.value, m1.value);
const futuresStructure = futuresSpread == null ? null : futuresSpread > 0 ? "CONTANGO" : futuresSpread < 0 ? "BACKWARDATION" : "FLAT";
const data = {
  updatedAt: new Date().toISOString(),
  indices: indexResults,
  ratios: { vix9dToVix: ratio(lookup.VIX9D?.value, lookup.VIX?.value), vixToVix3m: ratio(lookup.VIX?.value, lookup.VIX3M?.value) },
  indexStructure,
  futures: [m1, m2],
  futuresStructure,
  futuresM1M2Percent: futuresSpread == null ? null : futuresSpread * 100,
  methodology: { indexStructure: "VIX comparat cu VIX3M: NORMAL / UPWARD SLOPING când VIX este sub VIX3M; INVERTED când VIX este peste sau egal cu VIX3M.", futuresStructure: "CONTANGO și BACKWARDATION sunt folosite exclusiv pentru futures VIX, pe baza diferenței procentuale M2 față de M1." }
};
await writeFile(new URL("vix.json", DATA_DIR), `${JSON.stringify(data, null, 2)}\n`);
console.log(`Date VIX salvate. Futures M1/M2: ${m1.value != null && m2.value != null ? futuresStructure : "indisponibile"}.`);
