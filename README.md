# Ledger

Personal tracker for wardrobe, meals, body measurements and tasks. Installable web app (PWA) that keeps all data on the device (IndexedDB). AI suggestions use Gemini, called directly from the device with a key entered in Settings.

Live: https://gagemowry.github.io/Ledger/

## Develop

```bash
npm install
npm run dev
```

## Deploy

Every push to `main` builds and deploys to GitHub Pages via `.github/workflows/deploy.yml`.

## Data

- Everything is stored on the device. Use **Settings → Export backup** regularly.
- The Gemini API key is stored on the device only and is never included in backups or this repo.
