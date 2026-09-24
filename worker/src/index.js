const ALLOWED_ORIGINS = new Set([
  "https://ioanlucianchezan.github.io",
  "http://localhost:8787",
  "http://localhost:5173"
]);

const pickNumber = (source, keys) => {
  for (const key of keys) {
    const value = Number(source?.[key]);
    if (Number.isFinite(value)) return value;
  }
  return null;
};

const companyFromFinnhub = ({ ticker, quote, profile, metrics }) => {
  const sharesOutstanding = pickNumber(profile, ["shareOutstanding"]);
  const fcfPerShare = pickNumber(metrics, ["fcfPerShareAnnual", "fcfPerShareTTM"]);
  const freeCashFlow = pickNumber(metrics, ["freeCashFlowAnnual", "freeCashFlowTTM"])
    ?? (fcfPerShare != null && sharesOutstanding != null ? fcfPerShare * sharesOutstanding : null);
  const raw = {
    ticker,
    name: profile?.name,
    sector: profile?.finnhubIndustry,
    currentPrice: pickNumber(quote, ["c"]),
    marketCap: pickNumber(profile, ["marketCapitalization"]),
    revenueGrowth: pickNumber(metrics, ["revenueGrowthTTMYoy", "revenueGrowth5Y"]),
    netIncome: pickNumber(metrics, ["netIncomeAnnual", "netIncomeTTM"]),
    eps: pickNumber(metrics, ["epsNormalizedAnnual", "epsBasicExclExtraItemsAnnual", "epsAnnual", "epsTTM"]),
    forwardEps: pickNumber(metrics, ["epsEstimate", "epsForward"]),
    epsGrowth: pickNumber(metrics, ["epsGrowthTTMYoy", "epsGrowth5Y"]),
    freeCashFlow,
    fcfGrowth: pickNumber(metrics, ["fcfGrowth5Y"]),
    ebitda: pickNumber(metrics, ["ebitdaAnnual", "ebitdaTTM"]),
    cash: pickNumber(metrics, ["cash", "cashAnnual"]),
    debt: pickNumber(metrics, ["totalDebt", "totalDebtAnnual"]),
    sharesOutstanding,
    dividendPerShare: pickNumber(metrics, ["dividendPerShareAnnual", "dividendPerShareTTM"]),
    dividendGrowth: pickNumber(metrics, ["dividendGrowthRate5Y"]),
    payoutRatio: pickNumber(metrics, ["payoutRatioAnnual", "payoutRatioTTM"]),
    bookValuePerShare: pickNumber(metrics, ["bookValuePerShareAnnual", "bookValuePerShareQuarterly"]),
    roe: pickNumber(metrics, ["roeTTM", "roeAnnual"]),
    historicalPE: pickNumber(metrics, ["peAnnual", "peTTM"]),
    historicalEvEbitda: pickNumber(metrics, ["evToEbitdaAnnual", "evToEbitdaTTM"]),
    historicalPB: pickNumber(metrics, ["pbAnnual", "pbQuarterly"])
  };
  return Object.fromEntries(Object.entries(raw).filter(([, value]) => value !== null && value !== undefined && value !== ""));
};

const corsHeaders = (origin) => ({
  "Access-Control-Allow-Origin": ALLOWED_ORIGINS.has(origin) ? origin : "https://ioanlucianchezan.github.io",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Vary": "Origin"
});

const json = (body, status, origin) => new Response(JSON.stringify(body), {
  status,
  headers: { "Content-Type": "application/json; charset=utf-8", ...corsHeaders(origin) }
});

async function finnhubJson(path, ticker, key) {
  const url = new URL(`https://finnhub.io/api/v1/${path}`);
  url.searchParams.set("symbol", ticker);
  url.searchParams.set("token", key);
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Finnhub a răspuns cu ${response.status}.`);
  return response.json();
}

export default {
  async fetch(request, env, ctx) {
    const origin = request.headers.get("Origin") || "";
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders(origin) });
    const url = new URL(request.url);
    if (request.method !== "GET" || url.pathname !== "/company") return json({ error: "Ruta nu există." }, 404, origin);
    if (!env.FINNHUB_API_KEY) return json({ error: "Worker-ul nu are configurat secretul FINNHUB_API_KEY." }, 503, origin);

    const ticker = (url.searchParams.get("ticker") || "").trim().toUpperCase();
    if (!/^[A-Z0-9.-]{1,15}$/.test(ticker)) return json({ error: "Ticker invalid. Folosește simbolul bursier, de exemplu MSFT sau BRK.B." }, 400, origin);

    const cache = caches.default;
    const cached = await cache.match(request);
    if (cached) return cached;

    try {
      const [quote, profile, metricResponse] = await Promise.all([
        finnhubJson("quote", ticker, env.FINNHUB_API_KEY),
        finnhubJson("stock/profile2", ticker, env.FINNHUB_API_KEY),
        finnhubJson("stock/metric?metric=all", ticker, env.FINNHUB_API_KEY)
      ]);
      const company = companyFromFinnhub({ ticker, quote, profile, metrics: metricResponse.metric || {} });
      if (!company.currentPrice && !company.name) return json({ error: "Nu am găsit date pentru acest ticker în Finnhub." }, 404, origin);
      const response = json({ company, source: "Finnhub", fetchedAt: new Date().toISOString(), note: "Verifică datele fundamentale înainte de calcul; câmpurile indisponibile rămân editabile." }, 200, origin);
      response.headers.set("Cache-Control", "public, max-age=900, s-maxage=21600");
      ctx.waitUntil(cache.put(request, response.clone()));
      return response;
    } catch (error) {
      return json({ error: error.message || "Datele nu au putut fi încărcate momentan." }, 502, origin);
    }
  }
};
