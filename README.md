# SkipPilot

A private earnings ledger for SkipTheDishes drivers in Canada. Log shifts, fuel fill-ups, and bills in this browser. There is no account and no server.

The overview starts empty. It does not invent payouts. A labeled sample week can be loaded from the empty shifts panel or from Settings, and cleared again.

## Run locally

```bash
npm install
npm run dev
```

Open [http://127.0.0.1:43127](http://127.0.0.1:43127).

```bash
npm run lint
npm run typecheck
```

Entries are stored in `localStorage` under `skippilot.ledger.v1`.
