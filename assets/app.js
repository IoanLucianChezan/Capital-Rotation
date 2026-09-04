const state = { rows: [], history: {}, sort: "score", descending: true, sector: "all", search: "", historySymbol: "SPY" };
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
function scoreClass(value) { return value > 0 ? "pos" : value < 0 ? "neg" : ""; }
function scoreText(value) { return `${value > 0 ? "+" : ""}${value}`; }
function renderHistory() {
  const dates = Object.keys(state.history).sort();
  const observations = dates.map((date) => ({ date, score: state.history[date]?.[state.historySymbol] })).filter(({ score }) => Number.isFinite(score));
  const svg = byId("history-chart");
  if (!observations.length) { byId("history-stats").innerHTML = '<div class="history-stat"><span>Istoric</span><strong>—</strong></div>'; svg.innerHTML = '<text x="450" y="135" text-anchor="middle" class="axis-label">Istoricul va apărea după primul refresh.</text>'; return; }
  const latest = observations.at(-1).score;
  const previous = observations.at(-2)?.score;
  const threeWeeks = observations.at(Math.max(0, observations.length - 16)).score;
  const delta = previous == null ? null : latest - previous;
  const direction = observations.length < 2 ? null : latest - threeWeeks;
  byId("history-stats").innerHTML = [["Scor curent", latest], ["Δ ultima sesiune", delta], ["Direcție 3 săpt.", direction], ["Observații", observations.length]].map(([label, value]) => `<div class="history-stat"><span>${label}</span><strong class="${typeof value === "number" && label !== "Observații" ? scoreClass(value) : ""}">${value == null ? "—" : label === "Observații" ? value : scoreText(value)}</strong></div>`).join("");
  const width = 900, height = 270, left = 42, right = 18, top = 20, bottom = 35, innerWidth = width - left - right, innerHeight = height - top - bottom;
  const x = (i) => left + (observations.length === 1 ? innerWidth / 2 : i * innerWidth / (observations.length - 1));
  const y = (score) => top + (10 - score) * innerHeight / 20;
  const line = observations.map((point, index) => `${index ? "L" : "M"}${x(index).toFixed(1)},${y(point.score).toFixed(1)}`).join(" ");
  const area = `${line} L${x(observations.length - 1).toFixed(1)},${y(-10).toFixed(1)} L${x(0).toFixed(1)},${y(-10).toFixed(1)} Z`;
  const grid = [-10, -5, 0, 5, 10].map((value) => `<line class="grid-line" x1="${left}" x2="${width - right}" y1="${y(value)}" y2="${y(value)}"/><text class="axis-label" x="${left - 8}" y="${y(value) + 4}" text-anchor="end">${value > 0 ? "+" : ""}${value}</text>`).join("");
  const labels = [...new Set([0, Math.floor((observations.length - 1) / 2), observations.length - 1])].map((index) => `<text class="axis-label" x="${x(index)}" y="${height - 11}" text-anchor="middle">${observations[index].date.slice(5)}</text>`).join("");
  svg.innerHTML = `<defs><linearGradient id="score-gradient" x1="0" x2="0" y1="0" y2="1"><stop stop-color="#59a6ff" stop-opacity=".28"/><stop offset="1" stop-color="#59a6ff" stop-opacity="0"/></linearGradient></defs>${grid}<path class="score-area" d="${area}"/><path class="score-line" d="${line}"/>${observations.map((p, i) => `<circle class="score-point" cx="${x(i)}" cy="${y(p.score)}" r="${observations.length > 45 ? 2 : 3}"><title>${p.date}: ${scoreText(p.score)}</title></circle>`).join("")}${labels}`;
}
async function load() {
  const [response, historyResponse] = await Promise.all([fetch(`data/latest.json?cache=${Date.now()}`), fetch(`data/history.json?cache=${Date.now()}`)]);
  const [data, history] = await Promise.all([response.json(), historyResponse.json()]);
  state.rows = data.rows || [];
  state.history = history || {};
  const select = byId("sector-filter");
  const sectors = [...new Set(state.rows.map((row) => row.sector))].sort();
  select.innerHTML = '<option value="all">Toate sectoarele</option>' + sectors.map((sector) => `<option>${sector}</option>`).join("");
  byId("status").textContent = data.updatedAt ? `Piața: ${data.marketDate} · Actualizat: ${new Date(data.updatedAt).toLocaleString("ro-RO")} · Sursă: ${data.source}` : (data.message || "Încă nu există date.");
  const historySelect = byId("history-etf");
  historySelect.innerHTML = state.rows.map((row) => `<option value="${row.symbol}">${row.symbol} — ${row.name}</option>`).join("");
  if (!state.rows.some((row) => row.symbol === state.historySymbol)) state.historySymbol = state.rows[0]?.symbol || "SPY";
  historySelect.value = state.historySymbol;
  render();
  renderHistory();
}
byId("sector-filter").addEventListener("change", (event) => { state.sector = event.target.value; render(); });
byId("search").addEventListener("input", (event) => { state.search = event.target.value.trim().toLocaleLowerCase(); render(); });
byId("reload").addEventListener("click", load);
byId("history-etf").addEventListener("change", (event) => { state.historySymbol = event.target.value; renderHistory(); });
document.querySelectorAll("th[data-sort]").forEach((th) => th.addEventListener("click", () => { const field = th.dataset.sort; state.descending = state.sort === field ? !state.descending : true; state.sort = field; render(); }));
load().catch((error) => { byId("status").textContent = `Nu pot încărca datele: ${error.message}`; });
