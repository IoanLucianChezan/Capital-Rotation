import { readFile, rename, writeFile } from "node:fs/promises";
import { iSharesFunds } from "../config/flows.mjs";

const DATA_DIR = new URL("../data/", import.meta.url);
const CAPITAL_FILE = new URL("capital-flows.json", DATA_DIR);
const HISTORY_FILE = new URL("capital-flow-history.json", DATA_DIR);
const LATEST_FILE = new URL("latest.json", DATA_DIR);
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function asIsoDate(value) {
  const timestamp = Date.parse(`${value} UTC`);
  if (Number.isNaN(timestamp)) throw new Error(`Invalid iShares as-of date: ${value}`);
  return new Date(timestamp).toISOString().slice(0, 10);
}

function parseIsharesPage(html, symbol) {
  const normalized = html.replaceAll("&quot;", '"').replaceAll("&amp;", "&");
  const match = normalized.match(/sharesOutstanding"\s*:\s*\{[^}]*"formattedValue"\s*:\s*"([0-9,.]+)"[^}]*"formattedAsOfDate"\s*:\s*"([^"]+)"/i);
  if (!match) throw new Error(`${symbol}: Shares Outstanding is absent from the iShares page.`);
  const shares = Number(match[1].replaceAll(",", ""));
  if (!Number.isFinite(shares) || shares <= 0) throw new Error(`${symbol}: invalid shares value.`);
  return { shares, asOf: asIsoDate(match[2]) };
}

async function getIsharesShares(symbol, sourceUrl) {
  const response = await fetch(sourceUrl, { headers: { "User-Agent": "Mozilla/5.0 (compatible; CapitalRotationBot/1.0)" } });
  if (!response.ok) throw new Error(`${symbol}: iShares returned HTTP ${response.status}.`);
  return { ...parseIsharesPage(await response.text(), symbol), sourceUrl };
}

async function save(fileName, value) {
  const temporary = new URL(`${fileName}.tmp`, DATA_DIR);
  await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`);
  await rename(temporary, new URL(fileName, DATA_DIR));
}

const prior = JSON.parse(await readFile(CAPITAL_FILE, "utf8"));
let history = {};
try { history = JSON.parse(await readFile(HISTORY_FILE, "utf8")); } catch { /* first run */ }
const market = JSON.parse(await readFile(LATEST_FILE, "utf8"));
const prices = new Map(market.rows.map((row) => [row.symbol, row.price]));
const previousRows = new Map(prior.rows.map((row) => [Array.isArray(row) ? row[0] : row.symbol, row]));
const rows = [];

for (const item of prior.rows) {
  const [symbol, name, issuer] = Array.isArray(item) ? item : [item.symbol, item.name, item.issuer];
  const previous = previousRows.get(symbol);
  if (!iSharesFunds[symbol]) { rows.push({ symbol, name, issuer, status: "În pregătire" }); continue; }
  try {
    const current = await getIsharesShares(symbol, iSharesFunds[symbol]);
    const priorDates = Object.keys(history).filter((date) => date < current.asOf && history[date]?.[symbol]?.shares).sort();
    const priorObservation = priorDates.length ? history[priorDates.at(-1)][symbol] : null;
    const sharesChange = priorObservation ? current.shares - priorObservation.shares : null;
    const sharesChangePercent = sharesChange == null ? null : sharesChange / priorObservation.shares;
    rows.push({ symbol, name, issuer, status: "Validat", ...current, sharesChange, sharesChangePercent, netFlowUsd: sharesChange == null ? null : sharesChange * prices.get(symbol) });
  } catch (error) {
    console.warn(error.message);
    rows.push({ symbol, name, issuer, status: "Sursă indisponibilă", sourceUrl: iSharesFunds[symbol] });
  }
  await sleep(1100);
}

for (const row of rows.filter((row) => row.status === "Validat")) {
  history[row.asOf] ??= {};
  history[row.asOf][row.symbol] = { shares: row.shares, price: prices.get(row.symbol), sourceUrl: row.sourceUrl };
}
const historyDates = Object.keys(history).sort().slice(-260);
history = Object.fromEntries(historyDates.map((date) => [date, history[date]]));
await save("capital-flows.json", { updatedAt: new Date().toISOString(), methodology: "Shares outstanding publicate de emitent; flux USD ≈ variația unităților × ultimul preț de închidere.", rows });
await save("capital-flow-history.json", history);
console.log(`Saved ${rows.filter((row) => row.status === "Validat").length} validated iShares funds.`);
