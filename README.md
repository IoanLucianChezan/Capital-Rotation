# Sector Rotation Monitor

Aplicație statică pentru GitHub Pages, concentrată pe rotația celor 11 sectoare S&P 500, context cross-asset și un rezumat AI bazat exclusiv pe datele calculate.

## Pagini

- **Sector Rotation Weekly** — clasament sectorial, schimbări 1S/4S, faze de rotație, candidați timpurii și sectoare în deteriorare.
- **Cross-asset** — participare a pieței, small caps, credit, rate, aur, Bitcoin și macro SUA.
- **Raport AI** — interpretare narativă prudentă, fără recomandări de investiții.

## Actualizare

GitHub Actions rulează în zilele lucrătoare la 22:00 UTC și actualizează prețurile EOD, indicatorii FRED, istoricul scorului sectorial și raportul AI. Site-ul se deschide direct în **Sector Rotation Weekly**.

Cheile `FINNHUB_API_KEY`, `TWELVE_DATA_API_KEY` și `GROQ_API_KEY` rămân exclusiv în GitHub Secrets. Sursa principală pentru prețurile zilnice este Nasdaq EOD, iar celelalte surse sunt rezerve.

## Încărcare companie în Fair Value (Cloudflare)

Pentru ca butonul **Încarcă date companie** să completeze datele pentru un ticker introdus, proiectul include un Cloudflare Worker în directorul `worker/`. Cheia Finnhub este păstrată numai în secretul Worker-ului, niciodată în GitHub Pages sau în browser.

1. Creează sau autentifică-te într-un cont Cloudflare și instalează Node.js dacă nu îl ai deja.
2. Într-un terminal, din directorul `worker`, rulează `npx wrangler login`, apoi `npx wrangler secret put FINNHUB_API_KEY` și introdu cheia Finnhub când este cerută.
3. Rulează `npx wrangler deploy`. Cloudflare afișează un URL de forma `https://capital-rotation-fair-value.<cont>.workers.dev`.
4. Pune acel URL în `config/fair-value-api.js`, la `window.FAIR_VALUE_API_URL`, apoi publică modificarea în GitHub.

Worker-ul acceptă doar cereri pentru un ticker și are cache pentru a reduce apelurile către Finnhub. El completează numai câmpurile pe care le primește de la furnizor; verifică întotdeauna datele fundamentale și unitățile înainte de calcul.
