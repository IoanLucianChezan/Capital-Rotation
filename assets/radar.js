const pct = new Intl.NumberFormat("en-US", { style: "percent", minimumFractionDigits: 1, maximumFractionDigits: 1, signDisplay: "always" });
const num = new Intl.NumberFormat("en-US", { maximumFractionDigits: 1 });
const byId = (id) => document.getElementById(id);
const text = (value) => `${value > 0 ? "+" : ""}${value}`;
const tone = (value) => value > 0 ? "pos" : value < 0 ? "neg" : "";
let rows = [], sort = "radarScore", descending = true;

function radar(row) {
  const trend = (row.vs50 > 0 ? 12.5 : 0) + (row.vs200 > 0 ? 12.5 : 0);
  const relative = (row.relative1m > 0 ? 12.5 : 0) + (row.relative3m > 0 ? 12.5 : 0);
  const momentum = (row.oneMonth > 0 ? 10 : 0) + (row.threeMonths > 0 ? 10 : 0);
  const acceleration = (row.fiveDay > 0 ? 10 : 0) + (row.fiveDay > (row.oneMonth || 0) / 4 ? 10 : 0);
  const volume = row.rvol >= 1 ? 10 : 0;
  const radarScore = trend + relative + momentum + acceleration + volume;
  const signal = radarScore >= 75 ? "Lider în accelerare" : radarScore >= 55 ? "Lider matur" : radarScore >= 40 ? "Rotație emergentă" : radarScore >= 25 ? "Neutru" : "Pierde forță";
  return { ...row, radarScore, signal };
}
function render() {
  const shown = [...rows].filter((row) => row.symbol !== "SPY").sort((a, b) => {
    const direction = descending ? -1 : 1;
    return typeof a[sort] === "string" ? direction * a[sort].localeCompare(b[sort]) : direction * ((a[sort] ?? -Infinity) - (b[sort] ?? -Infinity));
  });
  byId("radar-rows").innerHTML = shown.map((r) => `<tr><td>${r.symbol}</td><td>${r.sector}</td><td class="radar-score ${r.radarScore >= 55 ? "pos" : r.radarScore < 25 ? "neg" : ""}">${r.radarScore}</td><td><span class="radar-signal ${r.radarScore >= 75 ? "accelerating" : r.radarScore >= 55 ? "leading" : r.radarScore < 25 ? "weak" : ""}">${r.signal}</span></td><td class="${tone(r.relative1m)}">${pct.format(r.relative1m / 100)}</td><td class="${tone(r.relative3m)}">${pct.format(r.relative3m / 100)}</td><td class="${tone(r.oneMonth)}">${pct.format(r.oneMonth)}</td><td class="${tone(r.threeMonths)}">${pct.format(r.threeMonths)}</td><td class="${tone(r.fiveDay)}">${pct.format(r.fiveDay)}</td><td class="${tone(r.vs50)}">${pct.format(r.vs50)}</td><td class="${tone(r.vs200)}">${pct.format(r.vs200)}</td><td>${r.rvol == null ? "—" : num.format(r.rvol)}</td></tr>`).join("");
  document.querySelectorAll("th[data-sort]").forEach((th) => th.classList.toggle("sorted", th.dataset.sort === sort && descending));
  const accelerating = shown.filter((r) => r.radarScore >= 75).length, leaders = shown.filter((r) => r.radarScore >= 55).length, emerging = shown.filter((r) => r.radarScore >= 40 && r.radarScore < 55).length;
  byId("radar-summary").innerHTML = [["ETF-uri analizate", shown.length], ["În accelerare", accelerating], ["Lideri confirmați", leaders], ["Rotații emergente", emerging]].map(([label, value]) => `<div class="metric"><span>${label}</span><strong>${value}</strong></div>`).join("");
}
async function load() {
  const response = await fetch(`data/latest.json?cache=${Date.now()}`);
  const data = await response.json();
  rows = (data.rows || []).map(radar);
  byId("radar-status").textContent = `Piața: ${data.marketDate} · Actualizat: ${new Date(data.updatedAt).toLocaleString("ro-RO")} · Semnal construit exclusiv din preț și volum`;
  render();
}
document.querySelectorAll("th[data-sort]").forEach((th) => th.addEventListener("click", () => { const field = th.dataset.sort; descending = sort === field ? !descending : true; sort = field; render(); }));
load().catch((error) => { byId("radar-status").textContent = `Nu pot încărca datele: ${error.message}`; });
