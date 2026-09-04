const money = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
const number = new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 });
const byId = (id) => document.getElementById(id);
const formatShares = (value) => value == null ? "—" : `${number.format(value / 1_000_000)} mil.`;
const formatPercent = (value) => value == null ? "—" : `${value > 0 ? "+" : ""}${(value * 100).toFixed(2)}%`;
async function loadFlows() {
  const response = await fetch(`data/capital-flows.json?cache=${Date.now()}`);
  const data = await response.json();
  const rows = data.rows.map((item) => Array.isArray(item) ? { symbol: item[0], name: item[1], issuer: item[2], status: "În pregătire" } : item);
  const validated = rows.filter((row) => row.status === "Validat").length;
  byId("flow-summary").innerHTML = [["ETF-uri urmărite", rows.length], ["Surse validate", validated], ["Grupe de emitenți", new Set(rows.map((row) => row.issuer)).size], ["Acoperire", `${Math.round(validated / rows.length * 100)}%`]].map(([label, value]) => `<div class="metric"><span>${label}</span><strong>${value}</strong></div>`).join("");
  byId("flow-rows").innerHTML = rows.map((row) => `<tr><td><strong>${row.symbol}</strong><small>${row.name}</small></td><td>${row.issuer}</td><td>${formatShares(row.shares)}</td><td>${formatShares(row.sharesChange)}</td><td class="${row.sharesChangePercent > 0 ? "pos" : row.sharesChangePercent < 0 ? "neg" : ""}">${formatPercent(row.sharesChangePercent)}</td><td class="${row.netFlowUsd > 0 ? "pos" : row.netFlowUsd < 0 ? "neg" : ""}">${row.netFlowUsd == null ? "—" : money.format(row.netFlowUsd)}</td><td>${row.asOf || "—"}</td><td><span class="flow-status ${row.status === "Validat" ? "validated" : ""}">${row.status}</span></td></tr>`).join("");
  byId("flow-status").textContent = data.updatedAt ? `Date actualizate: ${new Date(data.updatedAt).toLocaleString("ro-RO")}` : "Sursele sunt mapate; colectarea de shares outstanding este în curs de implementare.";
}
loadFlows().catch((error) => { byId("flow-status").textContent = `Nu pot încărca datele: ${error.message}`; });
