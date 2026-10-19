# Livesport importer – pilotní implementace

## Stav
Tento balíček obsahuje implementaci, **nikoli ověřený funkční scraper**. Livesport HTML nebylo v této relaci integračně otestováno. Před produkcí je nutné upravit selektory podle aktuální stránky a potvrdit správnost všech dat. Nepoužívat mimo rozsah uděleného souhlasu.

## Postup
1. V Neon SQL Editoru spusťte `sql/livesport.sql` (stávající `matches` musí existovat).
2. V GitHub Settings → Secrets and variables → Actions přidejte secret `DATABASE_URL` (připojení Neon; nikdy jej necommitujte).
3. Přidejte Actions variables `LIVESPORT_PL_URL`, `LIVESPORT_PD_URL`, `LIVESPORT_SA_URL`, `LIVESPORT_FL1_URL`, `LIVESPORT_BL1_URL`, `LIVESPORT_CZ1_URL`. Každá musí být ověřená stránka **výsledků 2026/27** na `www.livesport.cz`.
4. Pro první lokální test: `npm install`, `npx playwright install chromium`, nastavte `ONLY_LEAGUE=PL` a `LIVESPORT_PL_URL`, poté `npm run sync:livesport -- --dry-run`.
5. Ověřte počet zápasů, datum, skóre a stavy oproti webu. Následně spusťte skutečný import (bez `--dry-run`).
6. Až po úspěšném testu spusťte GitHub Actions ručně. Po ověření odkomentujte `schedule` v `.github/workflows/livesport-sync.yml`.

## Upozornění
- Importér očekává HTML selektory `.event__match` a další. Web se může změnit; při neověřené sezóně import skončí chybou.
- Stav zápasu je nutné otestovat; bez jednoznačného stavu nelze zaručit, že skóre je finální. Před produkčním použitím zpřísněte detekci ukončených zápasů dle skutečného HTML.
- Používá se ISO datum YYYY-MM-DD, pouze sezóna 2026/27. Počáteční načtení i denní běhy jsou idempotentní pro `source_id`.
- `matches` je dosavadní tabulka aplikace, `livesport_fixtures` obsahuje i budoucí zápasy. Kurzy se touto integrací **nezískávají**.
- Historické `sample_matches.csv` jsou syntetické; pro správný model nemíchejte testovací data se skutečnými zápasy.
- Pro nasazení na Vercel není potřeba Playwright spouštět na Vercelu: workflow běží v GitHub Actions.
