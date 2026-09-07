import { readFile, writeFile } from "node:fs/promises";

const DATA_DIR = new URL("../data/", import.meta.url);
const SECTORS = new Set(["XLF", "XLI", "XLY", "XLB", "XLE", "XLC", "XLV", "XLP", "XLU", "XLRE", "XLK"]);
const read = async (name) => JSON.parse(await readFile(new URL(name, DATA_DIR), "utf8"));
const apiKey = process.env.GROQ_API_KEY;
if (!apiKey) { console.log("GROQ_API_KEY lipsește; raportul AI nu este generat."); process.exit(0); }
const [latest, macro, rotationHistory] = await Promise.all([read("latest.json"), read("macro.json"), read("sector-rotation-history.json")]);
const snapshot = rotationHistory[latest.marketDate] || {};
const sectors = latest.rows.filter((row) => SECTORS.has(row.symbol)).map((row) => ({ symbol: row.symbol, sector: row.name, rotationScore: snapshot[row.symbol]?.score ?? null, macroAdjustment: snapshot[row.symbol]?.macroAdjustment ?? 0, relative1m: row.relative1m, relative3m: row.relative3m, fiveDay: row.fiveDay, oneMonth: row.oneMonth, threeMonths: row.threeMonths, vs50: row.vs50, vs200: row.vs200, rvol: row.rvol, score: row.score }));
const macroFacts = Object.fromEntries(Object.entries(macro.series || {}).map(([id, item]) => [id, { name: item.name, latest: item.latest, change3: item.change3, change20: item.change20 }]));
const input = { marketDate: latest.marketDate, sectors, macro: macroFacts, crossAsset: latest.rows.filter((row) => ["RSP", "IWM", "HYG", "IEF", "GLD", "IBIT"].includes(row.symbol)).map((row) => ({ symbol: row.symbol, oneMonth: row.oneMonth, relative1m: row.relative1m, relative3m: row.relative3m })) };
const prompt = `Ești analist de rotație sectorială pentru piața SUA. Folosește EXCLUSIV datele JSON primite. Nu inventa date, știri, earnings revisions, breadth sau cauze macro care nu sunt în date. Separă faptele de interpretare prin formulări prudente: "datele sugerează", "confirmarea lipsește". Nu spune că un sector va crește și nu da recomandări de cumpărare. Returnează DOAR JSON valid, fără markdown, exact cu schema: {"marketRegime":"maxim 110 cuvinte","earlyRotation":[{"symbol":"ticker din date","thesis":"maxim 55 cuvinte","confirmation":"maxim 28 cuvinte","invalidation":"maxim 28 cuvinte"}],"leaders":[{"symbol":"ticker din date","comment":"maxim 45 cuvinte"}],"weakening":[{"symbol":"ticker din date","comment":"maxim 45 cuvinte"}],"crossAsset":"maxim 90 cuvinte","watchlist":["maxim 8 elemente, fiecare maxim 20 cuvinte"],"caveat":"maxim 45 cuvinte"}. Selectează maximum 3 elemente în fiecare listă. Date: ${JSON.stringify(input)}`;
try {
  const headers = { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` };
  const modelsResponse = await fetch("https://api.groq.com/openai/v1/models", { headers });
  if (!modelsResponse.ok) throw new Error(`Groq models HTTP ${modelsResponse.status}: ${(await modelsResponse.text()).slice(0, 300)}`);
  const availableModels = (await modelsResponse.json()).data?.map((model) => model.id) || [];
  const preferredModels = ["llama-3.3-70b-versatile", "meta-llama/llama-4-scout-17b-16e-instruct", "llama-3.1-8b-instant", "openai/gpt-oss-20b", "openai/gpt-oss-120b"];
  const model = preferredModels.find((candidate) => availableModels.includes(candidate));
  if (!model) throw new Error(`Niciun model compatibil nu este disponibil. Modele primite: ${availableModels.slice(0, 12).join(", ") || "niciunul"}`);
  const response = await fetch("https://api.groq.com/openai/v1/chat/completions", { method: "POST", headers, body: JSON.stringify({ model, stream: false, temperature: 0.15, max_tokens: 1800, messages: [{ role: "user", content: prompt }] }) });
  if (!response.ok) throw new Error(`Groq HTTP ${response.status}: ${(await response.text()).slice(0, 300)}`);
  const completion = await response.json();
  const content = completion.choices?.[0]?.message?.content?.trim() || "";
  const json = content.match(/\{[\s\S]*\}/)?.[0];
  if (!json) throw new Error("Groq nu a returnat un obiect JSON valid.");
  const report = JSON.parse(json);
  await writeFile(new URL("ai-report.json", DATA_DIR), `${JSON.stringify({ updatedAt: new Date().toISOString(), marketDate: latest.marketDate, source: `Groq ${model}`, report }, null, 2)}\n`);
  console.log("Raport AI generat.");
} catch (error) {
  const diagnostic = error.message.replace(/Bearer\s+[^\s]+/gi, "Bearer [redacted]").slice(0, 240);
  const userMessage = "Raportul AI nu a putut fi generat momentan. Datele cantitative rămân disponibile în celelalte pagini.";
  await writeFile(new URL("ai-report.json", DATA_DIR), `${JSON.stringify({ updatedAt: new Date().toISOString(), marketDate: latest.marketDate, source: "Groq", error: userMessage, diagnostic }, null, 2)}\n`);
  console.warn(`Raport AI indisponibil: ${error.message}`);
}
