# GoVio

Know what you make. Know what it costs.

A private earnings ledger for gig delivery drivers in Canada. Log shifts, fuel fill-ups, and bills in this browser. It works with DoorDash, Uber Eats, SkipTheDishes, Instacart, and other delivery apps. There is no account and no server.

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

Entries are stored in `localStorage` under `skippilot.ledger.v1`. That key is unchanged so ledgers saved before the GoVio rename still load. Receipt photos stay in IndexedDB under `skippilot.receipts.v1` for the same reason.
