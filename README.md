# Rotație de capital ETF

Dashboard static pentru GitHub Pages. O acțiune GitHub actualizează zilnic datele de preț și volum, calculează scorul de rotație și păstrează istoricul scorului.

## Publicare în GitHub Pages

1. Creează un repository nou în GitHub și urcă acest director.
2. În repository, deschide **Settings → Pages**.
3. La **Build and deployment**, selectează **Deploy from a branch**, ramura `main` și directorul `/(root)`.
4. Salvează. GitHub afișează URL-ul public al paginii.

## Chei API

În repository, deschide **Settings → Secrets and variables → Actions → New repository secret** și adaugă:

- `FINNHUB_API_KEY` — recomandat, sursa primară;
- `TWELVE_DATA_API_KEY` — recomandat ca fallback; scriptul limitează automat cererile la circa 8/minut.

Cheile sunt disponibile numai în GitHub Actions. Ele nu apar în fișierele publicate în Pages și nu sunt trimise browserului.

## Prima actualizare

Deschide **Actions → Actualizează datele pieței → Run workflow**. După rulare, acțiunea creează/actualizează `data/latest.json` și `data/history.json`, apoi publică automat noile date în Pages.

Workflow-ul programat rulează de luni până vineri, la 22:00 UTC. Ora este aleasă după închiderea obișnuită a pieței SUA; GitHub poate întârzia ocazional rulările programate. Poți porni oricând o rulare manuală.

## Ce calculează

Pentru fiecare dintre cele 35 de instrumente, aplicația calculează din close-uri zilnice: 1D, 5D, 1M, 3M, 6M, 1Y (preț), poziția față de mediile 50D/200D, forța relativă față de SPY, RVOL și scorul -10/+10.

Randamentul de 1 an este randament de preț, nu total return. Fluxul de capital/AUM nu este calculat: pentru acesta avem nevoie de shares outstanding verificabile, specifice fiecărui emitent de ETF.
