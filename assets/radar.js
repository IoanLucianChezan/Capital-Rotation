const pct = new Intl.NumberFormat("en-US", { style: "percent", minimumFractionDigits: 1, maximumFractionDigits: 1, signDisplay: "always" });
const byId = (id) => document.getElementById(id);
const scoreText = (value) => value == null ? "—" : `${value > 0 ? "+" : ""}${value}`;
const tone = (value) => value > 0 ? "pos" : value < 0 ? "neg" : "";
let rows = [], sort = "radarScore", descending = true;

function radar(row, history) {
  const trend = (row.vs50 > 0 ? 12.5 : 0) + (row.vs200 > 0 ? 12.5 : 0);
  const relative = (row.relative1m > 0 ? 12.5 : 0) + (row.relative3m > 0 ? 12.5 : 0);
  const momentum = (row.oneMonth > 0 ? 10 : 0) + (row.threeMonths > 0 ? 10 : 0);
  const acceleration = (row.fiveDay > 0 ? 10 : 0) + (row.fiveDay > (row.oneMonth || 0) / 4 ? 10 : 0);
  const volume = row.rvol >= 1 ? 10 : 0;
  const radarScore = trend + relative + momentum + acceleration + volume;
  const outlook = radarScore >= 75 ? "Continuare probabilă" : radarScore >= 55 ? "Pozitiv, dar matur" : radarScore >= 40 ? "Posibilă rotație" : radarScore >= 25 ? "Fără avantaj clar" : "Slăbire probabilă";
  const confirmationCount = [trend === 25, relative === 25, momentum === 20, acceleration === 20, volume === 10].filter(Boolean).length;
  const confidence = confirmationCount >= 4 ? "Ridicată" : confirmationCount >= 3 ? "Medie" : "Redusă";
  const dates = Object.keys(history).sort();
  const previousScore = dates.length >= 6 ? history[dates.at(-6)]?.[row.symbol] : null;
  const scoreDelta5d = Number.isFinite(previousScore) ? row.score - previousScore : null;
  const reasons = [trend === 25 && "trend peste 50D/200D", relative === 25 && "bate SPY pe 1M și 3M", acceleration === 20 && "momentum accelerează", volume === 10 && "volum confirmă"].filter(Boolean);
  const reason = reasons.slice(0, 2).join("; ") || (trend === 0 ? "trendul nu confirmă" : "forța relativă este slabă");
  const confirmations = [trend === 25 && "Prețul este peste mediile de 50 și 200 de zile.", relative === 25 && "ETF-ul depășește SPY pe 1 lună și 3 luni.", momentum === 20 && "Randamentele pe 1 lună și 3 luni sunt pozitive.", acceleration === 20 && "Momentum-ul recent susține accelerarea.", volume === 10 && "Volumul este peste media recentă.", scoreDelta5d > 0 && `Scorul de rotație a crescut cu ${scoreDelta5d} puncte în 5 zile.`].filter(Boolean);
  const risks = [trend < 25 && "Trendul nu este confirmat simultan de 50D și 200D.", relative < 25 && "Forța relativă nu confirmă depășirea SPY pe ambele perioade.", momentum < 20 && "Cel puțin una dintre perioadele de 1M sau 3M rămâne negativă.", acceleration < 20 && "Ritmul din ultimele 5 zile nu confirmă accelerarea.", volume < 10 && "Volumul este sub media recentă.", scoreDelta5d < 0 && `Scorul de rotație a scăzut cu ${Math.abs(scoreDelta5d)} puncte în 5 zile.`].filter(Boolean);
  return { ...row, radarScore, outlook, confidence, scoreDelta5d, reason, confirmations, risks };
}
function render() {
  const shown = [...rows].filter((row) => row.symbol !== "SPY").sort((a, b) => {
    const direction = descending ? -1 : 1;
    return typeof a[sort] === "string" ? direction * a[sort].localeCompare(b[sort]) : direction * ((a[sort] ?? -Infinity) - (b[sort] ?? -Infinity));
  });
  byId("radar-rows").innerHTML = shown.map((r) => `<tr><td>${r.symbol}</td><td>${r.sector}</td><td><span class="radar-signal ${r.radarScore >= 75 ? "accelerating" : r.radarScore >= 55 ? "leading" : r.radarScore < 25 ? "weak" : ""}">${r.outlook}</span></td><td class="confidence ${r.confidence === "Ridicată" ? "pos" : r.confidence === "Redusă" ? "neg" : ""}">${r.confidence}</td><td class="${tone(r.scoreDelta5d)}">${scoreText(r.scoreDelta5d)}</td><td class="radar-score ${r.radarScore >= 55 ? "pos" : r.radarScore < 25 ? "neg" : ""}">${r.radarScore}</td><td class="${tone(r.relative1m)}">${pct.format(r.relative1m / 100)}</td><td class="${tone(r.relative3m)}">${pct.format(r.relative3m / 100)}</td><td>${r.rvol == null ? "—" : r.rvol.toFixed(1)}</td><td class="radar-reason">${r.reason}</td><td><details class="radar-details"><summary>Vezi analiza</summary><div><strong>Confirmări</strong><ul>${r.confirmations.length ? r.confirmations.map((item) => `<li>${item}</li>`).join("") : "<li>Nicio confirmare puternică.</li>"}</ul><strong>Riscuri</strong><ul>${r.risks.length ? r.risks.map((item) => `<li>${item}</li>`).join("") : "<li>Niciun risc tehnic major din criteriile urmărite.</li>"}</ul></div></details></td></tr>`).join("");
  document.querySelectorAll("th[data-sort]").forEach((th) => th.classList.toggle("sorted", th.dataset.sort === sort && descending));
  const accelerating = shown.filter((r) => r.radarScore >= 75).length, leaders = shown.filter((r) => r.radarScore >= 55).length, emerging = shown.filter((r) => r.radarScore >= 40 && r.radarScore < 55).length;
  byId("radar-summary").innerHTML = [["ETF-uri analizate", shown.length], ["Continuare probabilă", accelerating], ["Pozitiv, dar matur", leaders - accelerating], ["Posibilă rotație", emerging]].map(([label, value]) => `<div class="metric"><span>${label}</span><strong>${value}</strong></div>`).join("");
}
async function load() {
  const [latestResponse, historyResponse] = await Promise.all([fetch(`data/latest.json?cache=${Date.now()}`), fetch(`data/history.json?cache=${Date.now()}`)]);
  const [data, history] = await Promise.all([latestResponse.json(), historyResponse.json()]);
  rows = (data.rows || []).map((row) => radar(row, history));
  byId("radar-status").textContent = `Piața: ${data.marketDate} · Actualizat: ${new Date(data.updatedAt).toLocaleString("ro-RO")} · Semnal construit exclusiv din preț și volum`;
  render();
}
document.querySelectorAll("th[data-sort]").forEach((th) => th.addEventListener("click", () => { const field = th.dataset.sort; descending = sort === field ? !descending : true; sort = field; render(); }));
byId("reload-radar").addEventListener("click", load);
load().catch((error) => { byId("radar-status").textContent = `Nu pot încărca datele: ${error.message}`; });
