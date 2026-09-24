import { METHODS, relevance, defaults, dcf, pe, peg, ddm, evEbitda, priceBook, sensitivity, combined } from "./valuation.js";

const byId = (id) => document.getElementById(id);
const money = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 2 });
const pct = new Intl.NumberFormat("en-US", { style: "percent", minimumFractionDigits: 1, maximumFractionDigits: 1, signDisplay: "always" });
const number = new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 });
const fields = ["ticker","name","sector","currentPrice","marketCap","revenueGrowth","netIncome","eps","forwardEps","epsGrowth","freeCashFlow","fcfGrowth","ebitda","cash","debt","sharesOutstanding","dividendPerShare","dividendGrowth","payoutRatio","bookValuePerShare","roe","historicalPE","sectorPE","historicalEvEbitda","sectorEvEbitda","historicalPB","sectorPB"];
const labels = { ticker:"Ticker",name:"Companie",sector:"Sector",currentPrice:"Preț curent",marketCap:"Market cap",revenueGrowth:"Creștere venit %",netIncome:"Net income",eps:"EPS",forwardEps:"Forward EPS",epsGrowth:"Creștere EPS %",freeCashFlow:"Free cash flow",fcfGrowth:"Creștere FCF %",ebitda:"EBITDA",cash:"Cash",debt:"Debt",sharesOutstanding:"Acțiuni în circulație",dividendPerShare:"Dividend/acțiune",dividendGrowth:"Creștere dividend %",payoutRatio:"Payout ratio %",bookValuePerShare:"Book value/acțiune",roe:"ROE %",historicalPE:"P/E istoric",sectorPE:"P/E sector",historicalEvEbitda:"EV/EBITDA istoric",sectorEvEbitda:"EV/EBITDA sector",historicalPB:"P/B istoric",sectorPB:"P/B sector" };
const state = { company: { ticker:"", name:"", currentPrice:null }, method: METHODS.DCF, inputs:{}, results:[] };
const methodNames = { DCF:"DCF", PE:"P/E", PEG:"PEG / Growth", DDM:"Dividend Discount", EV_EBITDA:"EV / EBITDA", PRICE_BOOK:"Price / Book" };
const calculator = { DCF: dcf, PE: pe, PEG: peg, DDM: ddm, EV_EBITDA: evEbitda, PRICE_BOOK: priceBook };
const input = (name, value, step="any") => `<label>${labels[name] || name}<input data-company="${name}" type="${["ticker","name","sector"].includes(name) ? "text" : "number"}" step="${step}" value="${value ?? ""}" /></label>`;
function save() { localStorage.setItem("fair-value-company", JSON.stringify(state.company)); }
function readCompany() { try { Object.assign(state.company, JSON.parse(localStorage.getItem("fair-value-company"))); } catch { /* prima utilizare */ } }
const keyStorage = "fair-value-finnhub-key", twelveKeyStorage = "fair-value-twelve-key";
const pickNumber = (source, keys) => { for (const key of keys) { const value = Number(source?.[key]); if (Number.isFinite(value)) return value; } return null; };
function companyFromFinnhub(ticker, quote, profile, metrics) {
  const sharesOutstanding = pickNumber(profile, ["shareOutstanding"]), fcfPerShare = pickNumber(metrics, ["fcfPerShareAnnual", "fcfPerShareTTM"]), freeCashFlow = pickNumber(metrics, ["freeCashFlowAnnual", "freeCashFlowTTM"]) ?? (fcfPerShare != null && sharesOutstanding != null ? fcfPerShare * sharesOutstanding : null);
  const raw = { ticker, name:profile?.name, sector:profile?.finnhubIndustry, currentPrice:pickNumber(quote,["c"]), marketCap:pickNumber(profile,["marketCapitalization"]), revenueGrowth:pickNumber(metrics,["revenueGrowthTTMYoy","revenueGrowth5Y"]), netIncome:pickNumber(metrics,["netIncomeAnnual","netIncomeTTM"]), eps:pickNumber(metrics,["epsNormalizedAnnual","epsBasicExclExtraItemsAnnual","epsAnnual","epsTTM"]), forwardEps:pickNumber(metrics,["epsEstimate","epsForward"]), epsGrowth:pickNumber(metrics,["epsGrowthTTMYoy","epsGrowth5Y"]), freeCashFlow, fcfGrowth:pickNumber(metrics,["fcfGrowth5Y"]), ebitda:pickNumber(metrics,["ebitdaAnnual","ebitdaTTM"]), cash:pickNumber(metrics,["cash","cashAnnual"]), debt:pickNumber(metrics,["totalDebt","totalDebtAnnual"]), sharesOutstanding, dividendPerShare:pickNumber(metrics,["dividendPerShareAnnual","dividendPerShareTTM"]), dividendGrowth:pickNumber(metrics,["dividendGrowthRate5Y"]), payoutRatio:pickNumber(metrics,["payoutRatioAnnual","payoutRatioTTM"]), bookValuePerShare:pickNumber(metrics,["bookValuePerShareAnnual","bookValuePerShareQuarterly"]), roe:pickNumber(metrics,["roeTTM","roeAnnual"]), historicalPE:pickNumber(metrics,["peAnnual","peTTM"]), historicalEvEbitda:pickNumber(metrics,["evToEbitdaAnnual","evToEbitdaTTM"]), historicalPB:pickNumber(metrics,["pbAnnual","pbQuarterly"]) };
  return Object.fromEntries(Object.entries(raw).filter(([, value]) => value !== null && value !== undefined && value !== ""));
}
function percentChange(current, previous) { return Number.isFinite(current) && Number.isFinite(previous) && previous !== 0 ? (current / previous - 1) * 100 : null; }
function twelveCompanyFromStatements(incomeRows = [], balanceRows = [], cashflowRows = []) {
  const income = incomeRows[0] || {}, previousIncome = incomeRows[1] || {}, balance = balanceRows[0] || {}, previousBalance = balanceRows[1] || {}, cashflow = cashflowRows[0] || {}, previousCashflow = cashflowRows[1] || {};
  const shares = pickNumber(income, ["diluted_shares_outstanding", "basic_shares_outstanding"]), previousShares = pickNumber(previousIncome, ["diluted_shares_outstanding", "basic_shares_outstanding"]), cash = pickNumber(balance.assets?.current_assets, ["cash_and_cash_equivalents", "cash", "cash_equivalents"]), debt = (pickNumber(balance.liabilities?.current_liabilities, ["short_term_debt"]) || 0) + (pickNumber(balance.liabilities?.non_current_liabilities, ["long_term_debt"]) || 0), equity = pickNumber(balance.shareholders_equity, ["total_shareholders_equity"]), previousEquity = pickNumber(previousBalance.shareholders_equity, ["total_shareholders_equity"]), dividend = shares ? Math.abs(pickNumber(cashflow.financing_activities, ["common_dividends"]) || 0) / shares : null, previousDividend = previousShares ? Math.abs(pickNumber(previousCashflow.financing_activities, ["common_dividends"]) || 0) / previousShares : null;
  const raw = { netIncome:pickNumber(income,["net_income"]), eps:pickNumber(income,["eps_diluted","eps_basic"]), epsGrowth:percentChange(pickNumber(income,["eps_diluted","eps_basic"]), pickNumber(previousIncome,["eps_diluted","eps_basic"])), revenueGrowth:percentChange(pickNumber(income,["sales"]), pickNumber(previousIncome,["sales"])), freeCashFlow:pickNumber(cashflow,["free_cash_flow"]), fcfGrowth:percentChange(pickNumber(cashflow,["free_cash_flow"]), pickNumber(previousCashflow,["free_cash_flow"])), ebitda:pickNumber(income,["ebitda"]), cash, debt:debt || null, sharesOutstanding:shares, dividendPerShare:dividend, dividendGrowth:percentChange(dividend, previousDividend), payoutRatio:shares && pickNumber(income,["net_income"]) ? dividend * shares / pickNumber(income,["net_income"]) * 100 : null, bookValuePerShare:shares && equity ? equity / shares : null, roe:equity ? pickNumber(income,["net_income"]) / equity * 100 : null };
  return Object.fromEntries(Object.entries(raw).filter(([, value]) => value !== null && Number.isFinite(value)));
}
const wait = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));
async function twelveStatements(ticker, key) {
  const request = async (path) => { const url = new URL(`https://api.twelvedata.com/${path}`); url.search = new URLSearchParams({ symbol:ticker, apikey:key, period:"annual" }); const response = await fetch(url); const body = await response.json(); if (!response.ok || body.status === "error") throw new Error(body.message || "Twelve Data nu a putut furniza situațiile financiare."); return body; };
  const income = await request("income_statement"); await wait(8_000);
  const balance = await request("balance_sheet"); await wait(8_000);
  const cashflow = await request("cash_flow");
  return twelveCompanyFromStatements(income.income_statement, balance.balance_sheet, cashflow.cash_flow);
}
function setApiKeyFeedback(message) { byId("api-key-feedback").textContent = message; }
function readApiKey() { byId("finnhub-api-key").value = localStorage.getItem(keyStorage) || ""; byId("twelve-api-key").value = localStorage.getItem(twelveKeyStorage) || ""; }
function saveApiKey() { const key = byId("finnhub-api-key").value.trim(), twelveKey = byId("twelve-api-key").value.trim(); if (!key) { setApiKeyFeedback("Cheia Finnhub este necesară pentru prețul curent. Introdu cheia sau apasă „Șterge cheile”."); return; } localStorage.setItem(keyStorage, key); if (twelveKey) localStorage.setItem(twelveKeyStorage, twelveKey); else localStorage.removeItem(twelveKeyStorage); setApiKeyFeedback(twelveKey ? "Cheile au fost salvate numai în browserul acestui dispozitiv. Twelve Data va completa situațiile financiare." : "Cheia Finnhub a fost salvată local. Adaugă și Twelve Data pentru situațiile financiare complete."); }
function removeApiKey() { localStorage.removeItem(keyStorage); localStorage.removeItem(twelveKeyStorage); byId("finnhub-api-key").value = ""; byId("twelve-api-key").value = ""; setApiKeyFeedback("Cheile locale au fost șterse."); }
function renderCompany() {
  byId("company-fields").innerHTML = fields.map((field) => input(field, state.company[field], field.includes("Price") || field.includes("eps") || field === "currentPrice" ? ".01" : "any")).join("");
  ["isBank","isInsurance","isReit"].forEach((field) => { byId(`${field}-flag`).checked = Boolean(state.company[field]); });
  byId("company-title").textContent = state.company.ticker ? `${state.company.ticker}${state.company.name ? ` · ${state.company.name}` : ""}` : "Introdu datele companiei";
}
function methodInputs() {
  const d = defaults(state.company), common = `
    <label>Cash<input data-assumption="cash" type="number" value="${state.company.cash ?? 0}" /></label><label>Debt<input data-assumption="debt" type="number" value="${state.company.debt ?? 0}" /></label><label>Acțiuni în circulație<input data-assumption="sharesOutstanding" type="number" value="${state.company.sharesOutstanding ?? ""}" /></label>`;
  if (state.method === METHODS.DCF) return `<label>Free cash flow<input data-assumption="currentFcf" type="number" value="${state.company.freeCashFlow ?? ""}" /></label><label>FCF growth %<input data-assumption="growthRate" type="number" step=".1" value="${d.growthRate}" /></label><label>Forecast years<input data-assumption="forecastYears" type="number" min="1" max="20" value="${d.forecastYears}" /></label><label>Discount rate %<input data-assumption="discountRate" type="number" step=".1" value="${d.discountRate}" /></label><label>Terminal growth %<input data-assumption="terminalGrowthRate" type="number" step=".1" value="${d.terminalGrowthRate}" /></label>${common}`;
  if (state.method === METHODS.PE) return `<label>Normalized / forward EPS<input data-assumption="normalizedEps" type="number" step=".01" value="${d.normalizedEps ?? ""}" /></label><label>Fair P/E<input data-assumption="fairPE" type="number" step=".1" value="${d.fairPE}" /></label>`;
  if (state.method === METHODS.PEG) return `<label>Forward EPS<input data-assumption="forwardEps" type="number" step=".01" value="${d.forwardEps ?? ""}" /></label><label>EPS growth %<input data-assumption="epsGrowth" type="number" step=".1" value="${d.epsGrowth}" /></label><label>Target PEG<input data-assumption="targetPeg" type="number" step=".1" value="${d.targetPeg}" /></label>`;
  if (state.method === METHODS.DDM) return `<label>Dividend/acțiune<input data-assumption="dividendPerShare" type="number" step=".01" value="${d.dividendPerShare ?? ""}" /></label><label>Dividend growth %<input data-assumption="dividendGrowth" type="number" step=".1" value="${d.dividendGrowth}" /></label><label>Required return %<input data-assumption="requiredReturn" type="number" step=".1" value="${d.requiredReturn}" /></label>`;
  if (state.method === METHODS.EV_EBITDA) return `<label>EBITDA<input data-assumption="ebitda" type="number" value="${d.ebitda ?? ""}" /></label><label>Fair EV/EBITDA<input data-assumption="fairMultiple" type="number" step=".1" value="${d.fairMultiple}" /></label>${common}`;
  return `<label>Book value/acțiune<input data-assumption="bookValuePerShare" type="number" step=".01" value="${state.company.bookValuePerShare ?? ""}" /></label><label>Fair P/B<input data-assumption="fairPriceToBook" type="number" step=".1" value="${d.fairPriceToBook}" /></label>`;
}
function renderMethods() {
  const rows = relevance(state.company).filter((item) => item.status !== "not_recommended");
  byId("method-list").innerHTML = rows.length ? rows.map((item) => `<button type="button" class="method-button ${state.method === item.method ? "active" : ""}" data-method="${item.method}"><strong>${methodNames[item.method]}</strong><span>${item.status === "recommended" ? "Recomandată" : "Disponibilă"} · ${Math.round(item.score)}/100</span><small>${item.reason}</small></button>`).join("") : "<p class=\"muted\">Introdu date financiare pentru a vedea metodele disponibile.</p>";
  byId("method-name").textContent = methodNames[state.method];
  byId("assumptions").innerHTML = methodInputs();
  document.querySelectorAll("[data-method]").forEach((button) => button.addEventListener("click", () => { state.method = button.dataset.method; renderMethods(); }));
}
function assumptions() { return Object.fromEntries([...document.querySelectorAll("[data-assumption]")].map((element) => [element.dataset.assumption, Number(element.value)])); }
function renderResult(result) {
  if (!result) { byId("valuation-result").innerHTML = "<p class=\"muted\">Date insuficiente sau ipoteze invalide pentru această metodă. Verifică valorile obligatorii.</p>"; byId("sensitivity").innerHTML = ""; return; }
  byId("valuation-result").innerHTML = `<div class="fair-main-result"><span>Estimated Fair Value</span><strong>${money.format(result.fairValue)}</strong><small>Preț curent: ${money.format(result.currentPrice)} · <b class="${result.upsideDownsidePct >= 0 ? "pos" : "neg"}">${pct.format(result.upsideDownsidePct / 100)}</b></small></div><div class="fair-confidence"><strong>${Math.round(result.confidenceScore)} / 100</strong><span>${result.confidenceLevel} confidence <button class="info-button" title="Confidence Score arată cât de potrivită și robustă este metoda, nu probabilitatea ca prețul să atingă estimarea.">i</button></span></div><div class="fair-range"><div><span>Bear</span><strong>${result.bearValue ? money.format(result.bearValue) : "—"}</strong></div><div><span>Base</span><strong>${money.format(result.baseValue)}</strong></div><div><span>Bull</span><strong>${result.bullValue ? money.format(result.bullValue) : "—"}</strong></div></div><p class="muted">${result.explanation}</p>${result.warnings.length ? `<ul class="warning-list">${result.warnings.map((warning) => `<li>${warning}</li>`).join("")}</ul>` : ""}`;
  if (state.method === METHODS.DCF) { const grid = sensitivity(state.company, assumptions()); byId("sensitivity").innerHTML = `<h3>Sensitivitate DCF</h3><div class="table-wrap"><table><thead><tr><th>Terminal \ Discount</th>${grid.discounts.map((item) => `<th>${number.format(item * 100)}%</th>`).join("")}</tr></thead><tbody>${grid.terminals.map((terminal, index) => `<tr><td>${number.format(terminal * 100)}%</td>${grid.values[index].map((item) => `<td>${item == null ? "—" : money.format(item)}</td>`).join("")}</tr>`).join("")}</tbody></table></div>`; } else byId("sensitivity").innerHTML = "";
}
function renderCombined() { const combinedResult = combined(state.company, state.results); byId("combined-result").innerHTML = combinedResult ? `<div class="fair-main-result"><span>Combined Fair Value</span><strong>${money.format(combinedResult.fairValue)}</strong><small><b class="${combinedResult.upsideDownsidePct >= 0 ? "pos" : "neg"}">${pct.format(combinedResult.upsideDownsidePct / 100)}</b> față de prețul curent</small></div><p>Overall confidence: <strong>${Math.round(combinedResult.confidenceScore)}/100 · ${combinedResult.confidenceLevel}</strong></p><ul class="breakdown">${combinedResult.breakdown.map((item) => `<li>${methodNames[item.method]}: ${money.format(item.fairValue)} · ${pct.format(item.weight)}</li>`).join("")}</ul>` : "<p class=\"muted\">Adaugă minimum două metode valide cu Confidence Score de cel puțin 40.</p>"; }
function calculate() { const current = calculator[state.method](state.company, assumptions()); renderResult(current); if (current) { state.results = [...state.results.filter((item) => item.method !== current.method), current]; renderCombined(); } }
function setFeedback(message, kind = "success") { const feedback = byId("company-feedback"); feedback.className = `company-feedback visible ${kind}`; feedback.innerHTML = message; }
function updateCompanyFeedback() {
  const available = relevance(state.company).filter((item) => item.status !== "not_recommended");
  const names = available.map((item) => methodNames[item.method]);
  const priceMissing = !(Number(state.company.currentPrice) > 0);
  setFeedback(names.length
    ? `Datele au fost salvate local. Metode disponibile: <strong>${names.join(", ")}</strong>${priceMissing ? ". Adaugă și Preț curent pentru a calcula diferența față de fair value." : ". Alege metoda și apasă „Calculează Fair Value”."}`
    : "Datele au fost salvate local. Pentru o estimare, completează Preț curent și cel puțin una dintre: Free Cash Flow, EPS + Net income, Dividend/acțiune, EBITDA sau Book value (pentru bancă/REIT).", "success");
}
function syncCompany() { document.querySelectorAll("[data-company]").forEach((element) => { state.company[element.dataset.company] = ["ticker","name","sector"].includes(element.dataset.company) ? element.value.trim() : element.value === "" ? null : Number(element.value); }); ["isBank","isInsurance","isReit"].forEach((field) => { state.company[field] = byId(`${field}-flag`).checked; }); save(); renderCompany(); renderMethods(); renderCombined(); updateCompanyFeedback(); }
async function loadCompany() {
  const ticker = document.querySelector('[data-company="ticker"]')?.value.trim().toUpperCase();
  if (!ticker) { setFeedback("Introdu mai întâi tickerul companiei, de exemplu <strong>MSFT</strong>.", "error"); return; }
  const localFinnhubKey = localStorage.getItem(keyStorage), localTwelveKey = localStorage.getItem(twelveKeyStorage);
  if (!localFinnhubKey && !window.FAIR_VALUE_API_URL) { setFeedback("Adaugă cheia Finnhub din „Setare cheie Finnhub pentru acest browser” pentru a încărca automat datele.", "error"); return; }
  const button = byId("load-company");
  button.disabled = true; button.textContent = "Se încarcă…";
  setFeedback(localTwelveKey ? `Se încarcă datele pentru <strong>${ticker}</strong>, inclusiv situațiile financiare. Poate dura până la 20 secunde din cauza limitei Twelve Data…` : `Se încarcă datele pentru <strong>${ticker}</strong>…`, "loading");
  try {
    let payload;
    if (localFinnhubKey) {
      const endpoint = (path, extra = {}) => { const url = new URL(`https://finnhub.io/api/v1/${path}`); url.search = new URLSearchParams({ symbol:ticker, token:localFinnhubKey, ...extra }); return url; };
      const responses = await Promise.all([fetch(endpoint("quote")), fetch(endpoint("stock/profile2")), fetch(endpoint("stock/metric", { metric:"all" }))]);
      if (responses.some((response) => !response.ok)) throw new Error("Finnhub nu a putut furniza datele pentru acest ticker. Verifică cheia și tickerul.");
      const [quote, profile, metricResponse] = await Promise.all(responses.map((response) => response.json()));
      const finnhubCompany = companyFromFinnhub(ticker, quote, profile, metricResponse.metric || {});
      const twelveCompany = localTwelveKey ? await twelveStatements(ticker, localTwelveKey) : {};
      payload = { company:{ ...finnhubCompany, ...twelveCompany }, source:localTwelveKey ? "Finnhub + Twelve Data (chei locale)" : "Finnhub (cheie locală)" };
      if (!payload.company.currentPrice && !payload.company.name) throw new Error("Nu am găsit date pentru acest ticker în Finnhub.");
    } else {
      const response = await fetch(`${window.FAIR_VALUE_API_URL.replace(/\/$/, "")}/company?ticker=${encodeURIComponent(ticker)}`);
      payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Datele nu au putut fi încărcate.");
    }
    Object.assign(state.company, payload.company);
    state.results = [];
    save(); renderCompany(); renderMethods(); renderCombined();
    const loaded = Object.keys(payload.company).filter((field) => field !== "ticker" && field !== "name" && field !== "sector").length;
    setFeedback(`Date încărcate din <strong>${payload.source || "sursa configurată"}</strong> pentru <strong>${state.company.ticker}</strong>: ${loaded} câmpuri. Verifică valorile fundamentale și unitățile înainte de calcul.`, "success");
  } catch (error) { setFeedback(error.message || "Datele nu au putut fi încărcate momentan.", "error"); }
  finally { button.disabled = false; button.textContent = "Încarcă date companie"; }
}
byId("save-company").addEventListener("click", syncCompany); byId("load-company").addEventListener("click", loadCompany); byId("save-api-key").addEventListener("click", saveApiKey); byId("remove-api-key").addEventListener("click", removeApiKey); byId("calculate").addEventListener("click", calculate); byId("clear-results").addEventListener("click", () => { state.results = []; renderCombined(); }); readCompany(); readApiKey(); renderCompany(); renderMethods(); renderCombined();
