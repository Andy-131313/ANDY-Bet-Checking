# ValueBet Analytics — Vercel MVP v0.2

Next.js full-stack application (no Docker, no persistent local filesystem). Database: Neon Postgres via `@neondatabase/serverless`.

## Deployment
1. Create a GitHub repository with this folder's files.
2. Create a Neon Postgres database, copy the pooled `DATABASE_URL`.
3. Import GitHub repository into Vercel; Framework Preset = Next.js.
4. Add Vercel environment variables `DATABASE_URL` and `ADMIN_TOKEN` (strong random value). Redeploy.
5. POST JSON to `/api/import` with header `x-admin-token: YOUR_TOKEN` to create tables and import rows.
6. Visit the Vercel domain. `/api/values` returns value opportunities, `/api/predict` takes fixture JSON.

## Example import (PowerShell)
```powershell
$token = 'YOUR_ADMIN_TOKEN'
$rows = Import-Csv .\public\sample_matches.csv | ForEach-Object { @{league=$_.league;date=$_.date;home=$_.home;away=$_.away;hg=[int]$_.hg;ag=[int]$_.ag} }
$body = @{type='matches';rows=@($rows)} | ConvertTo-Json -Depth 5
Invoke-RestMethod -Uri 'https://YOUR-PROJECT.vercel.app/api/import' -Method Post -Headers @{'x-admin-token'=$token} -ContentType 'application/json' -Body $body
$rows = Import-Csv .\public\sample_odds.csv | ForEach-Object { @{league=$_.league;date=$_.date;home=$_.home;away=$_.away;bookmaker=$_.bookmaker;outcome=$_.outcome;price=[double]$_.price} }
$body = @{type='odds';rows=@($rows)} | ConvertTo-Json -Depth 5
Invoke-RestMethod -Uri 'https://YOUR-PROJECT.vercel.app/api/import' -Method Post -Headers @{'x-admin-token'=$token} -ContentType 'application/json' -Body $body
```

Sample data is synthetic. The model is not calibrated and no live bookmaker API is connected. Import is authenticated but lacks per-user accounts and rate limiting; do not expose the token. No automated betting. For large data, use an ETL pipeline and proper migration tools rather than the demo import endpoint.
