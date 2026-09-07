const pct = new Intl.NumberFormat("en-US", { style: "percent", minimumFractionDigits: 1, maximumFractionDigits: 1, signDisplay: "always" });
const byId = (id) => document.getElementById(id);
const sectors = new Set(["XLF", "XLI", "XLY", "XLB", "XLE", "XLC", "XLV", "XLP", "XLU", "XLRE", "XLK"]);
let rows = [], sort = "rotationScore", descending = true;
const tone = (value) => value > 0 ? "pos" : value < 0 ? "neg" : "";
const change = (value) => value == null ? "—" : `${value > 0 ? "+" : ""}${value}`;
function historyChange(history, symbol, sessions) { const dates = Object.keys(history).sort(); const previous = dates.length > sessions ? history[dates.at(-(sessions + 1))]?.[symbol] : null; const current = history[dates.at(-1)]?.[symbol]; return Number.isFinite(previous) && Number.isFinite(current) ? current - previous : null; }
function enrich(row, history) {
  const trend = (row.vs50 > 0 ? 10 : 0) + (row.vs200 > 0 ? 10 : 0);
  const rs = (row.relative1m > 0 ? 15 : 0) + (row.relative3m > 0 ? 15 : 0);
  const momentum = (row.oneMonth > 0 ? 8 : 0) + (row.threeMonths > 0 ? 8 : 0);
  const acceleration = (row.fiveDay > 0 ? 7 : 0) + (row.fiveDay > (row.oneMonth || 0) / 4 ? 7 : 0);
  const volume = row.rvol >= 1 ? 5 : 0;
  const change1w = historyChange(history, row.symbol, 5), change4w = historyChange(history, row.symbol, 20);
  const scoreMomentum = (change1w > 0 ? 3 : 0) + (change4w > 0 ? 2 : 0) - (change1w < 0 ? 3 : 0) - (change4w < 0 ? 2 : 0);
  const rotationScore = Math.max(0, Math.min(100, trend + rs + momentum + acceleration + volume + scoreMomentum));
  let phase = "Lagging";
  if (rotationScore >= 76 && change1w <= 0) phase = "Mature Leader";
  else if (rotationScore >= 70) phase = "Confirmed Leader";
  else if (rotationScore >= 48 && (change1w > 0 || change4w > 0)) phase = "Improving";
  else if (rotationScore >= 38 && change1w > 0 && row.relative1m > 0) phase = "Early Rotation";
  else if (rotationScore < 28 && change1w < 0) phase = "Avoid / Deteriorating";
  else if (rotationScore < 45) phase = "Weakening";
  const supports = [trend === 20 && "trend confirmat", rs === 30 && "bate SPY pe 1M și 3M", acceleration === 14 && "momentum recent pozitiv", volume === 5 && "volum peste normal", change1w > 0 && "scor în urcare"].filter(Boolean);
  const missing = [trend < 20 && "trend incomplet", rs < 30 && "RS nu confirmă pe ambele perioade", acceleration < 14 && "ritm recent slab", change1w < 0 && "scor în scădere"].filter(Boolean);
  return { ...row, rotationScore, change1w, change4w, phase, note: `${supports.slice(0, 2).join("; ") || "fără confirmări puternice"} · ${missing.slice(0, 1).join("") || "fără avertisment major"}` };
}
function phaseClass(phase) { return /Leader/.test(phase) ? "leading" : /Early|Improving/.test(phase) ? "accelerating" : /Weakening|Avoid|Lagging/.test(phase) ? "weak" : ""; }
function renderCards(id, list, empty) { byId(id).innerHTML = list.length ? list.slice(0, 3).map((r) => `<div class="weekly-item"><strong>${r.symbol} · ${r.name}</strong><span class="radar-signal ${phaseClass(r.phase)}">${r.phase}</span><p>${r.note}. Confirmare: ${r.relative1m > 0 ? "continuă să depășească SPY" : "RS 1M trebuie să redevină pozitiv"}. Invalidare: ${r.vs50 > 0 ? "pierdere susținută a 50D" : "eșec de revenire peste 50D"}.</p></div>`).join("") : `<p class="muted">${empty}</p>`; }
function render() {
  const shown = [...rows].sort((a, b) => { const d = descending ? -1 : 1; return typeof a[sort] === "string" ? d * a[sort].localeCompare(b[sort]) : d * ((a[sort] ?? -Infinity) - (b[sort] ?? -Infinity)); });
  byId("weekly-rows").innerHTML = shown.map((r) => `<tr><td>${r.symbol}</td><td>${r.name}</td><td class="radar-score ${r.rotationScore >= 70 ? "pos" : r.rotationScore < 35 ? "neg" : ""}">${r.rotationScore}</td><td class="${tone(r.change1w)}">${change(r.change1w)}</td><td class="${tone(r.change4w)}">${change(r.change4w)}</td><td class="${tone(r.relative1m)}">${pct.format(r.relative1m / 100)}</td><td class="${tone(r.relative3m)}">${pct.format(r.relative3m / 100)}</td><td><span class="radar-signal ${phaseClass(r.phase)}">${r.phase}</span></td><td class="weekly-note">${r.note}</td></tr>`).join("");
  document.querySelectorAll("th[data-sort]").forEach((th) => th.classList.toggle("sorted", th.dataset.sort === sort && descending));
  renderCards("early-candidates", shown.filter((r) => /Early Rotation|Improving/.test(r.phase)), "Nu există încă un candidat cu semnale suficiente.");
  renderCards("confirmed-leaders", shown.filter((r) => /Leader/.test(r.phase)), "Nu există lideri confirmați în criteriile actuale.");
  renderCards("weakening-sectors", shown.filter((r) => /Weakening|Lagging|Avoid/.test(r.phase)).sort((a,b) => a.rotationScore - b.rotationScore), "Nu există deteriorări importante în criteriile actuale.");
  byId("weekly-summary").innerHTML = [["Sectoare analizate", shown.length], ["Early / Improving", shown.filter((r) => /Early|Improving/.test(r.phase)).length], ["Lideri confirmați", shown.filter((r) => /Leader/.test(r.phase)).length], ["În deteriorare", shown.filter((r) => /Weakening|Lagging|Avoid/.test(r.phase)).length]].map(([label, value]) => `<div class="metric"><span>${label}</span><strong>${value}</strong></div>`).join("");
}
function crossAsset(all) { const get = (symbol) => all.find((r) => r.symbol === symbol); const rsp = get("RSP"), iwm = get("IWM"), hyg = get("HYG"), ief = get("IEF"), gld = get("GLD"), ibit = get("IBIT"); const items = [["Breadth mare-cap", "RSP vs SPY", rsp?.relative1m, "Pozitiv sugerează participare dincolo de mega-cap-uri."], ["Small caps", "IWM vs SPY", iwm?.relative1m, "Pozitiv sugerează apetit mai larg pentru risc."], ["Credit", "HYG minus IEF", (hyg?.oneMonth ?? 0) - (ief?.oneMonth ?? 0), "High yield peste titluri de stat susține un regim risk-on."], ["Aur", "GLD 1M", gld?.oneMonth, "Forța aurului poate semnala hedging sau rate reale în scădere."], ["Bitcoin", "IBIT 1M", ibit?.oneMonth, "Un indicator volatil al apetitului pentru risc."]]; byId("cross-asset").innerHTML = items.map(([name, label, value, note]) => `<div class="cross-item"><strong>${name}</strong><span class="${tone(value)}">${label}: ${pct.format(value || 0)}</span><small>${note}</small></div>`).join("");
  const breadth = rsp?.relative1m > 0 && iwm?.relative1m > 0 ? "Participarea pieței se lărgește: atât RSP, cât și IWM depășesc SPY." : "Participarea pieței rămâne selectivă: RSP și/sau IWM nu confirmă încă depășirea SPY.";
  const credit = (hyg?.oneMonth ?? 0) > (ief?.oneMonth ?? 0) ? "Creditul favorizează risk-on." : "Creditul nu confirmă un regim risk-on clar.";
  byId("regime-text").textContent = `${breadth} ${credit} Acest regim este bazat pe relații de preț; nu include încă date macro sau estimări de profit.`;
  byId("watchlist").innerHTML = ["RSP/SPY: confirmă sau infirmă extinderea rally-ului.", "IWM/SPY: urmărește revenirea small caps.", "HYG versus IEF: confirmă sau infirmă apetitul pentru risc.", "Schimbarea săptămânală a scorului pentru candidații Early Rotation.", "Depășirea SPY pe 1 lună pentru sectoarele care se îmbunătățesc."].map((item) => `<li>${item}</li>`).join("");
}
function renderMacroSignals(macro) {
  const series = macro?.series || {}, twoYear = series.DGS2, tenYear = series.DGS10, hy = series.BAMLH0A0HYM2, ig = series.BAMLC0A0CM, production = series.INDPRO, cpi = series.CPIAUCSL, jobs = series.PAYEMS, claims = series.ICSA;
  if (!twoYear || !tenYear || !hy) return;
  const curve = tenYear.latest.value - twoYear.latest.value;
  const items = [["Dobânzi", `SUA 2Y / 10Y: ${twoYear.latest.value.toFixed(2)}% / ${tenYear.latest.value.toFixed(2)}%`, tenYear.change20, `Curba 10Y–2Y: ${curve.toFixed(2)} pp. Schimbare 20 zile a 10Y: ${(tenYear.change20 ?? 0).toFixed(2)} pp.`], ["Credit", `High Yield spread: ${hy.latest.value.toFixed(2)} pp`, -(hy.change20 ?? 0), `Schimbare 20 zile: ${(hy.change20 ?? 0).toFixed(2)} pp. Scăderea spread-ului susține risk-on.`], ["Macro", `Producție industrială: ${production?.latest.value.toFixed(1) ?? "—"}`, production?.change60, `Schimbare 60 observații: ${(production?.change60 ?? 0).toFixed(1)}. CPI: ${cpi?.latest.value.toFixed(1) ?? "—"}; payrolls: ${jobs?.latest.value.toFixed(0) ?? "—"}.`], ["Piața muncii", `Cereri inițiale: ${claims?.latest.value.toFixed(0) ?? "—"} mii`, -(claims?.change20 ?? 0), `Schimbare 20 observații: ${(claims?.change20 ?? 0).toFixed(0)} mii. Creșterea rapidă ar fi un semnal de deteriorare.`]];
  byId("cross-asset").insertAdjacentHTML("beforeend", items.map(([name, label, value, note]) => `<div class="cross-item"><strong>${name}</strong><span class="${tone(value)}">${label}</span><small>${note}</small></div>`).join(""));
  const credit = hy.change20 < 0 ? "Spread-urile High Yield se comprimă, ceea ce susține apetitul pentru risc." : "Spread-urile High Yield nu se comprimă; creditul cere prudență.";
  const rates = tenYear.change20 > 0.12 ? "Randamentul 10Y urcă vizibil, un potențial vânt potrivnic pentru sectoarele sensibile la durată." : tenYear.change20 < -0.12 ? "Randamentul 10Y scade vizibil, ceea ce relaxează condițiile financiare." : "Randamentele sunt relativ stabile în ultima lună.";
  byId("regime-text").textContent = `${rates} ${credit} Producția industrială, CPI, payrolls și cererile de șomaj sunt afișate ca fapte macro; interpretarea lor trebuie actualizată la fiecare publicare.`;
}
async function load() { const [latestResponse, historyResponse, macroResponse] = await Promise.all([fetch(`data/latest.json?cache=${Date.now()}`), fetch(`data/history.json?cache=${Date.now()}`), fetch(`data/macro.json?cache=${Date.now()}`).then((response) => response.ok ? response.json() : {})]); const [data, history, macro] = await Promise.all([latestResponse.json(), historyResponse.json(), macroResponse]); const all = data.rows || []; rows = all.filter((r) => sectors.has(r.symbol)).map((r) => enrich(r, history)); byId("weekly-status").textContent = `Piața: ${data.marketDate} · Actualizat: ${new Date(data.updatedAt).toLocaleString("ro-RO")} · Preț, volum, macro, rate și credit`; render(); crossAsset(all); renderMacroSignals(macro); }
document.querySelectorAll("th[data-sort]").forEach((th) => th.addEventListener("click", () => { const field = th.dataset.sort; descending = sort === field ? !descending : true; sort = field; render(); })); byId("reload-weekly").addEventListener("click", load); load().catch((error) => { byId("weekly-status").textContent = `Nu pot încărca raportul: ${error.message}`; });
