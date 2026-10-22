# GoVio

Know what you make. Know what it costs.

A private earnings ledger for gig delivery drivers in Canada. Log shifts, fuel fill-ups, bills, and vehicle records. It works with DoorDash, Uber Eats, SkipTheDishes, Instacart, and other delivery apps.

Without Supabase environment variables, GoVio stays a local ledger in this browser. There is no invented payout data. A labeled sample week can be loaded from the empty shifts panel or from Settings, and cleared again. With a Supabase project configured, the same app also has email and password accounts. Local entries are not uploaded unless a later, confirmed migration is built.

The project URL and publishable key belong only in gitignored env files. They are not in this repository. Signup, email verification, password reset, and row level security were not verified against the live project. A reachability check is not that proof.

## Run the web app

```bash
npm install
npm run dev
```

Open [http://127.0.0.1:43127](http://127.0.0.1:43127).

```bash
npm run lint
npm run typecheck
npm test
npm run build
```

Entries stay in `localStorage` under `skippilot.ledger.v1`. That key is unchanged so ledgers saved before the GoVio rename still load. Receipt photos stay in IndexedDB under `skippilot.receipts.v1` for the same reason. The default platform stored for a shift is still `SkipTheDishes` when one was not chosen.

## Accounts

Accounts use Supabase Auth. GoVio does not store its own passwords. The publishable anon key may be public. The service-role key is server-only and is required only to delete an auth user. It must never be placed in a `NEXT_PUBLIC_` variable, an `EXPO_PUBLIC_` variable, a client bundle, or the mobile app.

When `NEXT_PUBLIC_SUPABASE_URL` or `NEXT_PUBLIC_SUPABASE_ANON_KEY` is missing, dashboard routes keep working on local data and are not redirected to login. Auth pages say that account sign-in is not configured. They do not pretend a session exists.

When both public values are set, `src/proxy.ts` (Next.js 16 Proxy, the replacement for Middleware) checks the session cookie on the server. Unsigned visitors to `/`, `/shifts`, `/fuel`, `/hourly`, `/bills`, `/vehicle`, and `/settings` go to `/login` with a same-origin `next` path. Signed-in visitors to `/login` and `/signup` go to that path or the overview. The service-role key is not required for this gate.

Copy `.env.example` to `.env.local` and fill in the real project values. Do not commit `.env.local`. Set the public variables before `npm run build` if you rely on Next inlining them for any client code. The server gate reads the public names at request time.

### Dashboard steps still required

The web env file is `.env.local` in the repo root. The Expo env file is `mobile/.env.local`. Neither file is committed. Do not paste keys into chat.

These dashboard settings are still yours to turn on:

1. Authentication → Providers → Email: turn the email provider on, and turn confirm email on.
2. Authentication → URL configuration: set the Site URL to `http://127.0.0.1:43127`.
3. Add both of these to the redirect allow list:
   - `http://127.0.0.1:43127/auth/callback`
   - `http://localhost:43127/auth/callback`
4. For the Expo app, also allow `govio://auth/callback` and the Expo Go URL printed on the register screen (`exp://…/--/auth/callback`) if confirmation should open on the phone.

Account deletion stays unavailable until `SUPABASE_SERVICE_ROLE_KEY` is set in `/workspace/.env.local`. That key is server-only. Do not put it in the mobile app, in `EXPO_PUBLIC_` or `NEXT_PUBLIC_` variables, or in chat.

`supabase/migrations/20261022160000_auth_foundation.sql` is prepared and has **not** been applied. It creates `profiles` (with a trigger on `auth.users` insert) and empty user-owned tables for shifts, vehicles, mileage and GPS sessions, fuel purchases, expenses, and receipt metadata, plus a private `receipts` storage bucket. It does not import the local ledger. Approve that file before anyone runs `supabase db push` or pastes it into the SQL editor.

Signup stores the full name in `raw_user_meta_data.full_name`. A security-definer trigger inserts that person's `profiles` row. Row level security lets `authenticated` read and write only rows where `auth.uid()` matches `user_id` (or `id` on `profiles`). The `receipts` storage bucket is private. A user can read and write objects only under their own `<uid>/` prefix. Receipt files and GPS traces must stay in that private prefix. Do not mark the bucket public.

Deleting the auth user cascades the profile and owned rows. A trigger also deletes objects in the private receipt prefix. The Settings deletion route verifies the caller, removes that prefix with the service-role key, and only then deletes that same auth user. If the service-role key is absent, Settings explains that deletion is unavailable and does not clear local data instead.

### Local data is not migrated yet

`localStorage` and IndexedDB are left untouched. Sample data is not mixed into an account. A future migration should let the signed-in person review the on-device records and confirm before each one is inserted with `user_id = auth.uid()`. Household bills, year-coverage flags, and odometer readings that are not columns on the new tables stay on the device until that migration grows a table for them. Settings says this while you are signed in.

### Manual checks that need a real project or a device

These were not run here:

- Sign up, see the check-email state, and confirm the address is not treated as verified before the link is opened.
- Open the confirmation link and land on `/auth/callback` with a session.
- Reject a wrong password, an unverified login, an expired link, and a network failure with a visible error.
- Request a reset, open it, and set a new password.
- Log out, and confirm a signed-out visit to `/` redirects to login only when Supabase is configured.
- Edit the account name on Settings and see it on the `profiles` row.
- With no service-role key, deletion explains that it is unavailable and does not delete the user or the local ledger.
- With the service-role key, type `DELETE`, check the box, and confirm the auth user, profile, owned rows, and private receipt objects are gone while the browser ledger remains.
- On a device or simulator, launch the Expo app, restore a session, sign in, and log out. Confirm tokens are in Secure Store, not AsyncStorage.

## Mobile

`mobile/` is an Expo React Native app for the same Supabase project. It is not a port of the ledger. It signs in, registers, resets a password, and shows the account email and name.

```bash
cd mobile
npm install
npx tsc --noEmit
npx expo start
```

Copy `mobile/.env.example` to `mobile/.env.local` before starting Expo. Use only `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_ANON_KEY`. Permanent deletion is done from the signed-in web Settings screen. The phone app does not have the service-role key.

This environment did not launch Expo or complete a signup.
