const state = { rows: [], history: {}, sort: "score", descending: true, sector: "all", search: "", historySymbols: new Set(["SPY"]), historyWindow: 126 };
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
  const shownDates = dates.slice(-state.historyWindow);
  const selected = state.rows.filter((row) => state.historySymbols.has(row.symbol));
  const svg = byId("history-chart");
  const series = selected.map((row) => ({ ...row, allObservations: dates.map((date) => ({ date, score: state.history[date]?.[row.symbol] })).filter(({ score }) => Number.isFinite(score)), observations: shownDates.map((date) => ({ date, score: state.history[date]?.[row.symbol] })).filter(({ score }) => Number.isFinite(score)) })).filter((row) => row.observations.length);
  if (!series.length) { byId("history-stats").innerHTML = '<div class="history-stat"><span>Istoric</span><strong>—</strong></div>'; if (byId("history-legend")) byId("history-legend").innerHTML = ""; if (byId("history-comparison")) byId("history-comparison").innerHTML = ""; svg.innerHTML = '<text x="450" y="135" text-anchor="middle" class="axis-label">Bifează cel puțin un ETF pentru istoric.</text>'; return; }
  const latestScores = series.map((row) => row.allObservations.at(-1).score);
  byId("history-stats").innerHTML = [["ETF-uri selectate", series.length], ["Scor mediu curent", (latestScores.reduce((sum, score) => sum + score, 0) / latestScores.length).toFixed(1)], ["Cel mai bun", `${series.reduce((best, row) => row.allObservations.at(-1).score > best.allObservations.at(-1).score ? row : best).symbol} ${scoreText(Math.max(...latestScores))}`], ["Observații afișate", `${shownDates.length} / ${dates.length}`]].map(([label, value]) => `<div class="history-stat"><span>${label}</span><strong>${value}</strong></div>`).join("");
  const width = 1200, height = 420, left = 56, right = 28, top = 26, bottom = 48, innerWidth = width - left - right, innerHeight = height - top - bottom;
  const x = (index) => left + (shownDates.length === 1 ? innerWidth / 2 : index * innerWidth / (shownDates.length - 1));
  const y = (score) => top + (10 - score) * innerHeight / 20;
  const grid = [-10, -5, 0, 5, 10].map((value) => `<line class="grid-line" x1="${left}" x2="${width - right}" y1="${y(value)}" y2="${y(value)}"/><text class="axis-label" x="${left - 8}" y="${y(value) + 4}" text-anchor="end">${value > 0 ? "+" : ""}${value}</text>`).join("");
  const labels = [...new Set([0, Math.floor((shownDates.length - 1) / 2), shownDates.length - 1])].map((index) => `<text class="axis-label" x="${x(index)}" y="${height - 11}" text-anchor="middle">${shownDates[index].slice(5)}</text>`).join("");
  const colors = ["#59a6ff", "#53d399", "#f5c45a", "#ff7e8b", "#b78bff", "#4dd8df", "#fb923c", "#f472b6", "#a3e635", "#e2e8f0"];
  const paths = series.map((row, seriesIndex) => { const color = colors[seriesIndex % colors.length]; const line = row.observations.map((point, index) => { const dateIndex = shownDates.indexOf(point.date); return `${index ? "L" : "M"}${x(dateIndex).toFixed(1)},${y(point.score).toFixed(1)}`; }).join(" "); return `<path class="score-line" stroke="${color}" d="${line}"><title>${row.symbol}</title></path>`; }).join("");
  const dots = series.length <= 6 ? series.map((row, seriesIndex) => row.observations.map((point) => `<circle class="score-point" fill="${colors[seriesIndex % colors.length]}" stroke="${colors[seriesIndex % colors.length]}" cx="${x(shownDates.indexOf(point.date))}" cy="${y(point.score)}" r="4"><title>${row.symbol} · ${point.date}: ${scoreText(point.score)}</title></circle>`).join("")).join("") : "";
  svg.innerHTML = `${grid}${paths}${dots}${labels}`;
  if (byId("history-legend")) byId("history-legend").innerHTML = series.map((row, index) => `<span class="legend-item"><i class="legend-dot" style="background:${colors[index % colors.length]}"></i>${row.symbol}</span>`).join("");
  if (byId("history-comparison")) byId("history-comparison").innerHTML = series.map((row) => { const scores = row.allObservations.map((item) => item.score), latest = scores.at(-1), delta = scores.length > 1 ? latest - scores.at(-2) : null, direction = scores.length > 1 ? latest - scores.at(Math.max(0, scores.length - 16)) : null; return `<tr><td>${row.symbol}</td><td class="${scoreClass(latest)}">${scoreText(latest)}</td><td class="${delta == null ? "" : scoreClass(delta)}">${delta == null ? "—" : scoreText(delta)}</td><td class="${direction == null ? "" : scoreClass(direction)}">${direction == null ? "—" : scoreText(direction)}</td></tr>`; }).join("");
}
async function load() {
  const [response, historyResponse] = await Promise.all([fetch(`data/latest.json?cache=${Date.now()}`), fetch(`data/history.json?cache=${Date.now()}`)]);
  const [data, history] = await Promise.all([response.json(), historyResponse.json()]);
  state.rows = data.rows || [];
  state.history = history || {};
  const select = byId("sector-filter");
  if (select) { const sectors = [...new Set(state.rows.map((row) => row.sector))].sort(); select.innerHTML = '<option value="all">Toate sectoarele</option>' + sectors.map((sector) => `<option>${sector}</option>`).join(""); }
  byId("status").textContent = data.updatedAt ? `Piața: ${data.marketDate} · Actualizat: ${new Date(data.updatedAt).toLocaleString("ro-RO")} · Sursă: ${data.source}` : (data.message || "Încă nu există date.");
  if (byId("history-chart")) {
    state.historySymbols = new Set([...state.historySymbols].filter((symbol) => state.rows.some((row) => row.symbol === symbol)));
    if (!state.historySymbols.size && state.rows.length) state.historySymbols.add("SPY");
    const historyOptions = byId("history-options");
    if (historyOptions) {
      historyOptions.innerHTML = state.rows.map((row) => `<label><input type="checkbox" data-history-symbol="${row.symbol}" ${state.historySymbols.has(row.symbol) ? "checked" : ""} /> ${row.symbol}</label>`).join("");
      loadPickerState();
    } else {
      const legacySelect = byId("history-etf");
      if (legacySelect) { legacySelect.innerHTML = state.rows.map((row) => `<option value="${row.symbol}">${row.symbol} — ${row.name}</option>`).join(""); legacySelect.value = [...state.historySymbols][0] || "SPY"; }
    }
  }
  if (byId("rows")) render();
  if (byId("history-chart")) renderHistory();
}
if (byId("sector-filter")) byId("sector-filter").addEventListener("change", (event) => { state.sector = event.target.value; render(); });
if (byId("search")) byId("search").addEventListener("input", (event) => { state.search = event.target.value.trim().toLocaleLowerCase(); render(); });
if (byId("reload")) byId("reload").addEventListener("click", load);
document.querySelectorAll("[data-history-window]").forEach((button) => button.addEventListener("click", () => { state.historyWindow = Number(button.dataset.historyWindow); document.querySelectorAll("[data-history-window]").forEach((item) => item.classList.toggle("active", item === button)); renderHistory(); }));
if (byId("history-all")) byId("history-all").addEventListener("change", (event) => { state.historySymbols = event.target.checked ? new Set(state.rows.map((row) => row.symbol)) : new Set(); renderHistory(); loadPickerState(); });
if (byId("history-options")) byId("history-options").addEventListener("change", (event) => { const symbol = event.target.dataset.historySymbol; if (!symbol) return; if (event.target.checked) state.historySymbols.add(symbol); else state.historySymbols.delete(symbol); renderHistory(); loadPickerState(); });
if (byId("history-etf")) byId("history-etf").addEventListener("change", (event) => { state.historySymbols = new Set([event.target.value]); renderHistory(); });
function loadPickerState() { const options = byId("history-options"), all = byId("history-all"), label = byId("history-picker-label"); if (!options || !all || !label) return; options.querySelectorAll("input").forEach((input) => { input.checked = state.historySymbols.has(input.dataset.historySymbol); }); all.checked = state.historySymbols.size === state.rows.length; all.indeterminate = state.historySymbols.size > 0 && state.historySymbols.size < state.rows.length; label.textContent = state.historySymbols.size === state.rows.length ? "Toate" : state.historySymbols.size === 1 ? [...state.historySymbols][0] : `${state.historySymbols.size} selectate`; }
document.querySelectorAll("th[data-sort]").forEach((th) => th.addEventListener("click", () => { const field = th.dataset.sort; state.descending = state.sort === field ? !state.descending : true; state.sort = field; render(); }));
load().catch((error) => { byId("status").textContent = `Nu pot încărca datele: ${error.message}`; });
