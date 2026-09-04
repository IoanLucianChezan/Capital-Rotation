const state = { rows: [], sort: "score", descending: true, sector: "all", search: "" };
const money = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 2 });
const number = new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 });
const percentage = new Intl.NumberFormat("en-US", { style: "percent", minimumFractionDigits: 1, maximumFractionDigits: 1, signDisplay: "always" });
const byId = (id) => document.getElementById(id);
function signed(value) { return `<span class="${value > 0 ? "pos" : value < 0 ? "neg" : ""}">${percentage.format(value)}</span>`; }
function render() {
  const visible = state.rows.filter((row) => (state.sector === "all" || row.sector === state.sector) && `${row.symbol} ${row.name}`.toLocaleLowerCase().includes(state.search));
  visible.sort((a, b) => { const left = a[state.sort]; const right = b[state.sort]; const direction = state.descending ? -1 : 1; return typeof left === "string" ? direction * left.localeCompare(right) : direction * ((left ?? -Infinity) - (right ?? -Infinity)); });
  byId("rows").innerHTML = visible.length ? visible.map((r) => `<tr><td>${r.symbol}</td><td>${r.sector}</td><td>${money.format(r.price)}</td><td>${signed(r.change)}</td><td>${signed(r.fiveDay)}</td><td>${signed(r.oneMonth)}</td><td>${signed(r.threeMonths)}</td><td>${signed(r.sixMonths)}</td><td>${signed(r.vs50)}</td><td>${signed(r.vs200)}</td><td>${signed(r.relative1m / 100)}</td><td>${r.rvol == null ? "—" : number.format(r.rvol)}</td><td class="score ${r.score > 0 ? "pos" : r.score < 0 ? "neg" : ""}">${r.score > 0 ? "+" : ""}${r.score}</td><td class="classification">${r.classification}</td></tr>`).join("") : '<tr><td class="empty" colspan="14">Nu există rezultate pentru acest filtru.</td></tr>';
  document.querySelectorAll("th[data-sort]").forEach((th) => th.classList.toggle("sorted", th.dataset.sort === state.sort && state.descending));
  const leaders = state.rows.filter((row) => row.score >= 5).length, weak = state.rows.filter((row) => row.score <= -4).length;
  byId("summary").innerHTML = [["Instrumente", state.rows.length], ["Leadership (≥ +5)", leaders], ["Slăbire (≤ −4)", weak], ["Scor mediu", state.rows.length ? (state.rows.reduce((sum, row) => sum + row.score, 0) / state.rows.length).toFixed(1) : "—"]].map(([label, value]) => `<div class="metric"><span>${label}</span><strong>${value}</strong></div>`).join("");
}
async function load() {
  const response = await fetch(`data/latest.json?cache=${Date.now()}`);
  const data = await response.json();
  state.rows = data.rows || [];
  const select = byId("sector-filter");
  const sectors = [...new Set(state.rows.map((row) => row.sector))].sort();
  select.innerHTML = '<option value="all">Toate sectoarele</option>' + sectors.map((sector) => `<option>${sector}</option>`).join("");
  byId("status").textContent = data.updatedAt ? `Piața: ${data.marketDate} · Actualizat: ${new Date(data.updatedAt).toLocaleString("ro-RO")} · Sursă: ${data.source}` : (data.message || "Încă nu există date.");
  render();
}
byId("sector-filter").addEventListener("change", (event) => { state.sector = event.target.value; render(); });
byId("search").addEventListener("input", (event) => { state.search = event.target.value.trim().toLocaleLowerCase(); render(); });
byId("reload").addEventListener("click", load);
document.querySelectorAll("th[data-sort]").forEach((th) => th.addEventListener("click", () => { const field = th.dataset.sort; state.descending = state.sort === field ? !state.descending : true; state.sort = field; render(); }));
load().catch((error) => { byId("status").textContent = `Nu pot încărca datele: ${error.message}`; });
