# Sector Rotation Monitor

Aplicație statică pentru GitHub Pages, concentrată pe rotația celor 11 sectoare S&P 500, context cross-asset și un rezumat AI bazat exclusiv pe datele calculate.

## Pagini

- **Sector Rotation Weekly** — clasament sectorial, schimbări 1S/4S, faze de rotație, candidați timpurii și sectoare în deteriorare.
- **Cross-asset** — participare a pieței, small caps, credit, rate, aur, Bitcoin și macro SUA.
- **Raport AI** — interpretare narativă prudentă, fără recomandări de investiții.

## Actualizare

GitHub Actions rulează în zilele lucrătoare la 22:00 UTC și actualizează prețurile EOD, indicatorii FRED, istoricul scorului sectorial și raportul AI. Site-ul se deschide direct în **Sector Rotation Weekly**.

Cheile `FINNHUB_API_KEY`, `TWELVE_DATA_API_KEY` și `GROQ_API_KEY` rămân exclusiv în GitHub Secrets. Sursa principală pentru prețurile zilnice este Nasdaq EOD, iar celelalte surse sunt rezerve.
