import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { etfs } from "../config/etfs.mjs";

const FINNHUB_KEY = process.env.FINNHUB_API_KEY;
const TWELVE_KEY = process.env.TWELVE_DATA_API_KEY;
const DATA_DIR = new URL("../data/", import.meta.url);
const DAILY_MS = 1_100;
const TWELVE_MS = 7_600; // 8 requests/minute, with a small safety margin
const NASDAQ_MS = 350;
let lastFinnhubRequest = 0;
let lastTwelveRequest = 0;
let lastNasdaqRequest = 0;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function rateLimit(provider) {
  const now = Date.now();
  const minGap = provider === "finnhub" ? DAILY_MS : provider === "twelve" ? TWELVE_MS : NASDAQ_MS;
  const previous = provider === "finnhub" ? lastFinnhubRequest : provider === "twelve" ? lastTwelveRequest : lastNasdaqRequest;
  await sleep(Math.max(0, minGap - (now - previous)));
  if (provider === "finnhub") lastFinnhubRequest = Date.now();
  else if (provider === "twelve") lastTwelveRequest = Date.now();
  else lastNasdaqRequest = Date.now();
}

function requireSeries(points, symbol) {
  if (points.length < 205) throw new Error(`${symbol}: only ${points.length} daily observations; need at least 205.`);
  return points;
}

async function fetchFinnhub(symbol) {
  await rateLimit("finnhub");
  const to = Math.floor(Date.now() / 1000);
  const from = to - 540 * 24 * 60 * 60;
  const url = new URL("https://finnhub.io/api/v1/stock/candle");
  url.search = new URLSearchParams({ symbol, resolution: "D", from: String(from), to: String(to), token: FINNHUB_KEY });
  const response = await fetch(url);
  const body = await response.json();
  if (!response.ok || body.s !== "ok") throw new Error(body.error || body.s || `HTTP ${response.status}`);
  return requireSeries(body.t.map((timestamp, i) => ({
    date: new Date(timestamp * 1000).toISOString().slice(0, 10),
    close: Number(body.c[i]), volume: Number(body.v[i])
  })).filter((p) => Number.isFinite(p.close) && p.close > 0), symbol);
}

async function fetchTwelve(symbol) {
  await rateLimit("twelve");
  const url = new URL("https://api.twelvedata.com/time_series");
  url.search = new URLSearchParams({ symbol, interval: "1day", outputsize: "400", apikey: TWELVE_KEY });
  const response = await fetch(url);
  const body = await response.json();
  if (!response.ok || !Array.isArray(body.values)) throw new Error(body.message || body.code || `HTTP ${response.status}`);
  return requireSeries(body.values.map((p) => ({
    date: p.datetime.slice(0, 10), close: Number(p.close), volume: Number(p.volume)
  })).filter((p) => Number.isFinite(p.close) && p.close > 0).reverse(), symbol);
}

// Nasdaq exposes end-of-day ETF history publicly. It keeps the daily job working
// when a key-based provider's free plan does not include historical candles.
async function fetchNasdaq(symbol) {
  await rateLimit("nasdaq");
  const today = new Date();
  const from = new Date(today);
  from.setUTCDate(from.getUTCDate() - 730);
  const formatDate = (date) => date.toISOString().slice(0, 10);
  const url = new URL(`https://api.nasdaq.com/api/quote/${symbol}/historical`);
  url.search = new URLSearchParams({ assetclass: "etf", fromdate: formatDate(from), todate: formatDate(today), limit: "5000" });
  const response = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0 (compatible; CapitalRotation/1.0)", Accept: "application/json" } });
  const body = await response.json();
  const rows = body?.data?.tradesTable?.rows;
  if (!response.ok || !Array.isArray(rows)) throw new Error(body?.status?.bCodeMessage?.[0]?.errorMessage || `HTTP ${response.status}`);
  const points = rows.map((row) => ({
    date: (() => {
      const [month, day, year] = String(row.date || "").split("/");
      return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    })(),
    close: Number(String(row.close || "").replace(/[$,]/g, "")),
    volume: Number(String(row.volume || "").replace(/,/g, ""))
  })).filter((point) => Number.isFinite(point.close) && point.close > 0).reverse();
  return requireSeries(points, symbol);
}

async function fetchSeries(symbol) {
  const errors = [];
  try { return { provider: "Nasdaq (EOD)", points: await fetchNasdaq(symbol) }; }
  catch (error) { errors.push(`Nasdaq: ${error.message}`); }
  if (FINNHUB_KEY) {
    try { return { provider: "Finnhub", points: await fetchFinnhub(symbol) }; }
    catch (error) { errors.push(`Finnhub: ${error.message}`); }
  }
  if (TWELVE_KEY) {
    try { return { provider: "Twelve Data", points: await fetchTwelve(symbol) }; }
    catch (error) { errors.push(`Twelve Data: ${error.message}`); }
  }
  throw new Error(`${symbol}: ${errors.join(" | ")}`);
}

const average = (values) => values.reduce((sum, value) => sum + value, 0) / values.length;
const pct = (newer, older) => newer / older - 1;
function returnFor(closes, sessions) { return pct(closes.at(-1), closes.at(-1 - sessions)); }
function scoreRow(etf, points, spy, index = points.length - 1) {
  const availablePoints = points.slice(0, index + 1);
  const closes = availablePoints.map((p) => p.close);
  const latest = availablePoints.at(-1);
  const change = returnFor(closes, 1);
  const oneMonth = returnFor(closes, 21);
  const threeMonths = returnFor(closes, 63);
  const rvol = latest.volume > 0 ? latest.volume / average(availablePoints.slice(-21, -1).map((p) => p.volume).filter((v) => v > 0)) : null;
  const vs50 = pct(latest.close, average(closes.slice(-50)));
  const vs200 = pct(latest.close, average(closes.slice(-200)));
  const relative1m = (oneMonth - spy.oneMonth) * 100;
  const relative3m = (threeMonths - spy.threeMonths) * 100;
  const pointsScore = [vs200 > 0 ? 2 : -2, vs50 > 0 ? 2 : -2,
    relative1m > 2 ? 2 : relative1m > 0 ? 1 : relative1m > -2 ? -1 : -2,
    relative3m > 2 ? 2 : relative3m > 0 ? 1 : relative3m > -2 ? -1 : -2,
    returnFor(closes, 5) > 0 ? 1 : -1,
    rvol && rvol > 1.3 ? (change > 0 ? 1 : -1) : 0];
  const score = pointsScore.reduce((sum, value) => sum + value, 0);
  const classification = score >= 8 ? (returnFor(closes, 126) < 0.05 ? "Acumulare puternică" : "Leadership consacrat")
    : score >= 5 ? "Leadership emergent" : score >= 2 ? "Trend sănătos" : score >= -1 ? "Neutru"
    : score >= -4 ? "Slăbire" : score >= -7 ? "Distribuție" : "Ieșire de capital";
  return { ...etf, date: latest.date, price: latest.close, volume: latest.volume || null, rvol,
    change, fiveDay: returnFor(closes, 5), oneMonth, threeMonths, sixMonths: returnFor(closes, 126), oneYearPrice: closes.length > 252 ? returnFor(closes, 252) : null,
    vs50, vs200, relative1m, relative3m, score, classification };
}

async function atomicJson(fileName, value) {
  const target = new URL(fileName, DATA_DIR);
  const temporary = new URL(`${fileName}.tmp`, DATA_DIR);
  await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`);
  await rename(temporary, target);
}

await mkdir(DATA_DIR, { recursive: true });
const fetched = [];
for (const etf of etfs) {
  process.stdout.write(`Fetching ${etf.symbol}... `);
  const result = await fetchSeries(etf.symbol);
  fetched.push({ etf, ...result });
  console.log(result.provider);
}
const spyData = fetched.find((item) => item.etf.symbol === "SPY").points.map((p) => p.close);
const spy = { oneMonth: returnFor(spyData, 21), threeMonths: returnFor(spyData, 63) };
const rows = fetched.map(({ etf, points }) => scoreRow(etf, points, spy));

let history = {};
try { history = JSON.parse(await readFile(new URL("history.json", DATA_DIR), "utf8")); } catch { /* first run */ }
const spyPoints = fetched.find((item) => item.etf.symbol === "SPY").points;
const byDate = new Map(fetched.map((item) => [item.etf.symbol, new Map(item.points.map((point, pointIndex) => [point.date, pointIndex]))]));
const historicalDates = spyPoints.slice(-126).map((point) => point.date);
for (const date of historicalDates) {
  const spyIndex = byDate.get("SPY").get(date);
  if (spyIndex < 200) continue;
  const spyCloses = spyPoints.slice(0, spyIndex + 1).map((point) => point.close);
  const spyAtDate = { oneMonth: returnFor(spyCloses, 21), threeMonths: returnFor(spyCloses, 63) };
  const scores = {};
  for (const item of fetched) {
    const pointIndex = byDate.get(item.etf.symbol).get(date);
    if (pointIndex != null && pointIndex >= 200) scores[item.etf.symbol] = scoreRow(item.etf, item.points, spyAtDate, pointIndex).score;
  }
  if (Object.keys(scores).length === etfs.length) history[date] = scores;
}
const today = rows[0].date;
history[today] = Object.fromEntries(rows.map((row) => [row.symbol, row.score]));
const dates = Object.keys(history).sort().slice(-130);
history = Object.fromEntries(dates.map((date) => [date, history[date]]));
const providers = [...new Set(fetched.map((item) => item.provider))].join(" + ");
await atomicJson("history.json", history);
await atomicJson("latest.json", { updatedAt: new Date().toISOString(), marketDate: today, source: providers, rows,
  methodology: { close: "Ultimul close zilnic disponibil", windows: { fiveDay: 5, oneMonth: 21, threeMonths: 63, sixMonths: 126, oneYear: 252, volumeAverage: 20 }, totalReturn: false } });
console.log(`Saved ${rows.length} instruments for ${today}.`);
