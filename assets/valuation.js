const finite = (value) => Number.isFinite(Number(value)) ? Number(value) : null;
const clamp = (value, min = 0, max = 100) => Math.max(min, Math.min(max, value));
const percent = (value) => Math.abs(value) > 1 ? value / 100 : value;
const level = (score) => score >= 80 ? "high" : score >= 60 ? "medium" : "low";
const upside = (fairValue, currentPrice) => currentPrice > 0 ? (fairValue - currentPrice) / currentPrice * 100 : null;
const positive = (value) => finite(value) != null && finite(value) > 0;

export const METHODS = {
  DCF: "DCF", PE: "PE", PEG: "PEG", DDM: "DDM", EV_EBITDA: "EV_EBITDA", PRICE_BOOK: "PRICE_BOOK"
};

export function relevance(company) {
  const bankLike = company.isBank || company.isInsurance;
  const rows = [];
  const add = (method, score, reason) => rows.push({ method, score, status: score >= 70 ? "recommended" : score >= 40 ? "available" : "not_recommended", reason });
  add(METHODS.DCF, positive(company.freeCashFlow) && !bankLike ? 85 : bankLike ? 15 : 25, bankLike ? "Cash-flow DCF este mai puțin potrivit pentru instituții financiare." : positive(company.freeCashFlow) ? "Free cash flow pozitiv permite modelarea fluxurilor viitoare." : "Necesită free cash flow pozitiv.");
  add(METHODS.PE, positive(company.forwardEps || company.eps) && positive(company.netIncome) ? 80 : 15, positive(company.forwardEps || company.eps) ? "Earnings pozitive permit evaluarea P/E." : "EPS pozitiv este obligatoriu.");
  const growth = finite(company.epsGrowth);
  add(METHODS.PEG, positive(company.forwardEps || company.eps) && growth > 0 ? clamp(55 + Math.min(growth * 1.2, 35)) : 10, growth > 0 ? "Creșterea EPS face metoda PEG relevantă." : "Necesită EPS pozitiv și creștere EPS pozitivă.");
  const payout = finite(company.payoutRatio);
  add(METHODS.DDM, positive(company.dividendPerShare) ? clamp(60 + (payout > 0 && payout <= 90 ? 20 : 0) - (payout > 100 ? 35 : 0)) : 10, positive(company.dividendPerShare) ? "Compania plătește dividend." : "Necesită dividend pe acțiune pozitiv.");
  add(METHODS.EV_EBITDA, positive(company.ebitda) && !bankLike ? 75 : bankLike ? 10 : 20, bankLike ? "EV/EBITDA nu este potrivit de regulă pentru bănci și asigurări." : positive(company.ebitda) ? "EBITDA pozitiv permite compararea operațională." : "Necesită EBITDA pozitiv.");
  add(METHODS.PRICE_BOOK, bankLike ? 90 : company.isReit ? 65 : positive(company.bookValuePerShare) ? 35 : 10, bankLike ? "Book value și ROE sunt foarte relevante pentru instituții financiare." : company.isReit ? "Book value poate fi relevant pentru active imobiliare." : "Pentru companii asset-light, P/B are relevanță redusă.");
  return rows;
}

function confidence(company, method, sensitivity = 70) {
  const dataFields = { DCF: ["freeCashFlow", "cash", "debt", "sharesOutstanding"], PE: ["forwardEps", "eps", "historicalPE", "sectorPE"], PEG: ["forwardEps", "epsGrowth"], DDM: ["dividendPerShare", "dividendGrowth", "payoutRatio"], EV_EBITDA: ["ebitda", "cash", "debt", "sharesOutstanding"], PRICE_BOOK: ["bookValuePerShare", "roe"] }[method];
  const dataQuality = dataFields.filter((field) => finite(company[field]) != null).length / dataFields.length * 100;
  const predictable = clamp(45 + (positive(company.revenueGrowth) ? 15 : 0) + (positive(company.freeCashFlow) ? 15 : 0) + (positive(company.dividendPerShare) ? 10 : 0));
  const suitability = relevance(company).find((item) => item.method === method)?.score ?? 0;
  const stability = clamp(55 + (positive(company.historicalPE) || positive(company.historicalEvEbitda) || positive(company.historicalPB) ? 20 : 0) + (finite(company.payoutRatio) > 100 ? -25 : 0));
  return clamp(dataQuality * .25 + predictable * .25 + suitability * .20 + stability * .15 + sensitivity * .15);
}

function result(company, method, fairValue, assumptions, warnings = [], scenarios = {}) {
  if (!positive(company.currentPrice) || !Number.isFinite(fairValue) || fairValue <= 0) return null;
  const score = confidence(company, method, scenarios.sensitivity ?? 70);
  return { method, fairValue, currentPrice: company.currentPrice, upsideDownsidePct: upside(fairValue, company.currentPrice), confidenceScore: score, confidenceLevel: level(score), assumptions, warnings, explanation: explanations[method], bearValue: scenarios.bearValue, baseValue: fairValue, bullValue: scenarios.bullValue };
}

const explanations = { DCF: "Estimează valoarea actuală a fluxurilor de numerar libere viitoare.", PE: "Evaluează compania prin earnings normalizate și un multiplu P/E justificat.", PEG: "Ajustează multiplul P/E în funcție de creșterea estimată a EPS.", DDM: "Evaluează valoarea actuală a dividendelor viitoare.", EV_EBITDA: "Evaluează operațiunile printr-un multiplu enterprise value / EBITDA.", PRICE_BOOK: "Evaluează compania în raport cu capitalurile proprii contabile." };

function dcfValue({ currentFcf, growthRate, forecastYears, terminalGrowthRate, discountRate, cash, debt, sharesOutstanding }) {
  const fcf = finite(currentFcf), years = Math.round(finite(forecastYears)), growth = percent(growthRate), terminal = percent(terminalGrowthRate), discount = percent(discountRate), shares = finite(sharesOutstanding);
  if (!(fcf > 0 && years >= 1 && shares > 0 && discount > terminal)) return null;
  let flow = fcf, pvFlows = 0;
  for (let year = 1; year <= years; year += 1) { flow *= 1 + growth; pvFlows += flow / Math.pow(1 + discount, year); }
  const terminalValue = flow * (1 + terminal) / (discount - terminal), pvTerminal = terminalValue / Math.pow(1 + discount, years);
  return { fairValue: (pvFlows + pvTerminal + (finite(cash) || 0) - (finite(debt) || 0)) / shares, terminalShare: pvTerminal / (pvFlows + pvTerminal) };
}

export function dcf(company, inputs) {
  const base = dcfValue(inputs), warnings = [];
  if (!base) return null;
  if (base.terminalShare > .75) warnings.push("Terminal value reprezintă peste 75% din enterprise value; rezultatul este sensibil la ipoteze.");
  const bear = dcfValue({ ...inputs, growthRate: percent(inputs.growthRate) * .8, discountRate: percent(inputs.discountRate) + .015, terminalGrowthRate: Math.max(0, percent(inputs.terminalGrowthRate) - .005) })?.fairValue;
  const bullDiscount = Math.max(percent(inputs.terminalGrowthRate) + .002, percent(inputs.discountRate) - .01);
  const bull = dcfValue({ ...inputs, growthRate: percent(inputs.growthRate) * 1.2, discountRate: bullDiscount, terminalGrowthRate: percent(inputs.terminalGrowthRate) + .005 })?.fairValue;
  return result(company, METHODS.DCF, base.fairValue, inputs, warnings, { bearValue: bear, bullValue: bull, sensitivity: base.terminalShare > .75 ? 35 : 70 });
}

export function pe(company, inputs) { const eps = finite(inputs.normalizedEps) || finite(company.forwardEps) || finite(company.eps), multiple = finite(inputs.fairPE); if (!(eps > 0 && multiple > 0)) return null; const warnings = multiple < 5 || multiple > 60 ? ["Fair P/E este o ipoteză neobișnuit de mică sau mare."] : []; return result(company, METHODS.PE, eps * multiple, { normalizedEps: eps, fairPE: multiple }, warnings, { bearValue: eps * multiple * .85, bullValue: eps * multiple * 1.15 }); }
export function peg(company, inputs) { const eps = finite(inputs.forwardEps) || finite(company.forwardEps) || finite(company.eps), growth = finite(inputs.epsGrowth), target = finite(inputs.targetPeg); if (!(eps > 0 && growth > 0 && target > 0)) return null; const fairPE = growth * target, fairValue = eps * fairPE; return result(company, METHODS.PEG, fairValue, { forwardEps: eps, epsGrowth: growth, targetPeg: target }, growth > 35 ? ["Ipoteza de creștere EPS este ridicată și poate fi volatilă."] : [], { bearValue: fairValue * .8, bullValue: fairValue * 1.2 }); }
export function ddm(company, inputs) { const dividend = finite(inputs.dividendPerShare) || finite(company.dividendPerShare), growth = percent(inputs.dividendGrowth), required = percent(inputs.requiredReturn); if (!(dividend > 0 && required > growth)) return null; const fairValue = dividend * (1 + growth) / (required - growth), warnings = finite(company.payoutRatio) > 100 ? ["Payout ratio depășește 100%. Dividendul poate să nu fie sustenabil."] : finite(company.payoutRatio) > 90 ? ["Payout ratio este ridicat."] : []; return result(company, METHODS.DDM, fairValue, { dividendPerShare: dividend, dividendGrowth: growth, requiredReturn: required }, warnings, { bearValue: fairValue * .8, bullValue: fairValue * 1.15 }); }
export function evEbitda(company, inputs) { const ebitda = finite(inputs.ebitda) || finite(company.ebitda), multiple = finite(inputs.fairMultiple), shares = finite(inputs.sharesOutstanding) || finite(company.sharesOutstanding); if (!(ebitda > 0 && multiple > 0 && shares > 0)) return null; const fairValue = (ebitda * multiple - (finite(inputs.debt) ?? finite(company.debt) ?? 0) + (finite(inputs.cash) ?? finite(company.cash) ?? 0)) / shares; return result(company, METHODS.EV_EBITDA, fairValue, { ebitda, fairMultiple: multiple, sharesOutstanding: shares }, [], { bearValue: fairValue * .85, bullValue: fairValue * 1.15 }); }
export function priceBook(company, inputs) { const book = finite(inputs.bookValuePerShare) || finite(company.bookValuePerShare), multiple = finite(inputs.fairPriceToBook); if (!(book > 0 && multiple > 0)) return null; const fairValue = book * multiple; return result(company, METHODS.PRICE_BOOK, fairValue, { bookValuePerShare: book, fairPriceToBook: multiple }, company.isBank || company.isInsurance ? [] : ["Price / Book este în general mai puțin informativ pentru companiile asset-light."], { bearValue: fairValue * .8, bullValue: fairValue * 1.2 }); }

export function defaults(company) { return { growthRate: finite(company.fcfGrowth) ?? 8, forecastYears: 5, terminalGrowthRate: 2.5, discountRate: 9, normalizedEps: finite(company.forwardEps) ?? finite(company.eps), fairPE: finite(company.historicalPE) && finite(company.sectorPE) ? finite(company.historicalPE) * .4 + finite(company.sectorPE) * .3 + Math.max(5, finite(company.epsGrowth) || 10) * .3 : 20, forwardEps: finite(company.forwardEps) ?? finite(company.eps), epsGrowth: finite(company.epsGrowth) ?? 12, targetPeg: 1.2, dividendPerShare: finite(company.dividendPerShare), dividendGrowth: finite(company.dividendGrowth) ?? 3, requiredReturn: 9, ebitda: finite(company.ebitda), fairMultiple: finite(company.historicalEvEbitda) && finite(company.sectorEvEbitda) ? (finite(company.historicalEvEbitda) + finite(company.sectorEvEbitda)) / 2 : 12, fairPriceToBook: finite(company.historicalPB) && finite(company.sectorPB) ? (finite(company.historicalPB) + finite(company.sectorPB)) / 2 : 1.5 }; }
export function sensitivity(company, inputs) { const discounts = [-1, 0, 1].map((offset) => percent(inputs.discountRate) + offset / 100), terminals = [-.5, 0, .5].map((offset) => percent(inputs.terminalGrowthRate) + offset / 100); return { discounts, terminals, values: terminals.map((terminalGrowthRate) => discounts.map((discountRate) => dcfValue({ ...inputs, terminalGrowthRate, discountRate })?.fairValue ?? null)) }; }
export function combined(company, results) { const valid = results.filter((item) => item && item.confidenceScore >= 40); if (valid.length < 2) return null; const base = company.isBank || company.isInsurance ? { PRICE_BOOK: .5, PE: .35, DDM: .15 } : positive(company.dividendPerShare) ? { DCF: .3, PE: .25, DDM: .3, EV_EBITDA: .15 } : finite(company.epsGrowth) > 15 ? { DCF: .35, PEG: .3, PE: .25, EV_EBITDA: .1 } : { DCF: .35, PE: .3, PEG: .15, EV_EBITDA: .2 }; const weighted = valid.map((item) => ({ ...item, effectiveWeight: (base[item.method] || .1) * item.confidenceScore / 100 })); const total = weighted.reduce((sum, item) => sum + item.effectiveWeight, 0), fairValue = weighted.reduce((sum, item) => sum + item.fairValue * item.effectiveWeight, 0) / total, confidenceScore = weighted.reduce((sum, item) => sum + item.confidenceScore * item.effectiveWeight, 0) / total; return { fairValue, confidenceScore, confidenceLevel: level(confidenceScore), upsideDownsidePct: upside(fairValue, company.currentPrice), breakdown: weighted.map((item) => ({ ...item, weight: item.effectiveWeight / total })) }; }
