const byId = (id) => document.getElementById(id);
const value = new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const pct = new Intl.NumberFormat("en-US", { style: "percent", minimumFractionDigits: 1, maximumFractionDigits: 1, signDisplay: "always" });
const tone = (number) => number > 0 ? "neg" : number < 0 ? "pos" : "";
function card(item) { return `<article class="vix-card"><span>${item.name}</span><strong>${value.format(item.value)}</strong><small class="${tone(item.change)}">${item.change == null ? "—" : `${item.change > 0 ? "+" : ""}${value.format(item.change)} · ${pct.format((item.changePercent || 0) / 100)}`}</small></article>`; }
function explain(data) {
  const indexText = data.indexStructure === "NORMAL / UPWARD SLOPING" ? "VIX este sub VIX3M: curba indicilor este normală / ascendentă, fără inversare între 30 și 90 de zile." : data.indexStructure === "INVERTED" ? "VIX este la sau peste VIX3M: curba indicilor este inversată, semnal de stres relativ mai mare pe termen scurt." : "Structura indicilor nu poate fi evaluată încă.";
  const futuresText = data.futuresStructure === "CONTANGO" ? "M2 este peste M1: futures VIX sunt în contango." : data.futuresStructure === "BACKWARDATION" ? "M2 este sub M1: futures VIX sunt în backwardation." : data.futuresStructure === "FLAT" ? "M1 și M2 sunt aproximativ la același nivel." : "Cotațiile M1/M2 nu sunt disponibile; structura futures nu este etichetată.";
  return `${indexText} ${futuresText}`;
}
async function load() {
  const response = await fetch(`data/vix.json?cache=${Date.now()}`);
  if (!response.ok) throw new Error("Datele VIX nu au fost publicate încă.");
  const data = await response.json();
  byId("vix-status").textContent = `Actualizat: ${new Date(data.updatedAt).toLocaleString("ro-RO")} · indici Cboe cu întârziere`;
  byId("vix-indices").innerHTML = data.indices.map(card).join("");
  byId("vix9d-vix").textContent = data.ratios.vix9dToVix == null ? "—" : value.format(data.ratios.vix9dToVix);
  byId("vix-vix3m").textContent = data.ratios.vixToVix3m == null ? "—" : value.format(data.ratios.vixToVix3m);
  byId("index-structure").textContent = data.indexStructure || "INDISPONIBIL";
  byId("index-structure").className = `vix-badge ${data.indexStructure === "INVERTED" ? "alert" : "normal"}`;
  byId("futures-rows").innerHTML = data.futures.map((item) => `<tr><td>${item.label}</td><td>${item.symbol || "—"}</td><td>${item.value == null ? "Indisponibil" : value.format(item.value)}</td><td class="${tone(item.change)}">${item.change == null ? "—" : `${item.change > 0 ? "+" : ""}${value.format(item.change)}`}</td><td class="${tone(item.changePercent)}">${item.changePercent == null ? "—" : pct.format(item.changePercent / 100)}</td></tr>`).join("");
  byId("futures-structure").textContent = data.futuresStructure || "INDISPONIBIL";
  byId("futures-structure").className = `vix-badge ${data.futuresStructure === "BACKWARDATION" ? "alert" : "normal"}`;
  byId("m1-m2").textContent = data.futuresM1M2Percent == null ? "—" : pct.format(data.futuresM1M2Percent / 100);
  byId("vix-reading").textContent = explain(data);
}
byId("reload-vix").addEventListener("click", load); load().catch((error) => { byId("vix-status").textContent = error.message; });
