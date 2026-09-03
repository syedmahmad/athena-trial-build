# Athena mobile

An [Expo](https://expo.dev) (SDK 57 / React Native 0.86) **native shell** that
wraps the Athena web app in a hardened WebView. It reuses the mobile-responsive
web UI and adds the native pieces a browser can't provide: camera / microphone /
photo-library access, a native splash + app icon, Android hardware-back, and a
system-browser round-trip for Google sign-in (which Google blocks inside
embedded WebViews).

## What's in here

| Path | Purpose |
| --- | --- |
| `App.tsx` | Root: SafeArea + StatusBar, holds the splash until first paint. |
| `src/config.ts` | Reads `EXPO_PUBLIC_*` env (web URL, Supabase public values). |
| `src/AthenaWebView.tsx` | The WebView: media perms, external-link routing, Android back, pull-to-refresh (iOS), loading/error UI, the auth message bridge. |
| `src/nativeOAuth.ts` | Google OAuth PKCE handshake in the system browser. |
| `app.json` | Native config: name, icons, splash, iOS/Android permissions. |
| `assets/` | App icon, Android adaptive/monochrome icon, splash logo, favicon. |

The web app coordinates via a small, self-guarding bridge (no effect in a normal
browser): `src/lib/native/bridge.ts` and `src/components/native/native-bridge.tsx`
in the Next.js repo.

## Prerequisites

- Node 20+ and this folder's deps: `npm install`
- **A development build**, not Expo Go. The config plugins (custom permissions,
  splash) and the `athena://` OAuth deep link only exist in a real build.
  - iOS: Xcode + `npx expo run:ios`
  - Android: Android Studio + `npx expo run:android`
  - Or cloud builds via EAS (below).

## Configure

```bash
cp .env.example .env
```

- `EXPO_PUBLIC_WEB_URL` — leave blank for production (`https://athena.sset.dev`),
  or set your machine's **LAN IP** for local dev (a device can't reach
  `localhost`), e.g. `http://192.168.1.20:3001`. Cleartext http is already
  allowed for dev on both platforms.
- `EXPO_PUBLIC_SUPABASE_URL` / `EXPO_PUBLIC_SUPABASE_ANON_KEY` — required for
  Google sign-in. Copy from the web app's `.env`
  (`NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY`).
  These are publishable values, safe to ship.

## Run (dev build)

This is an **`expo-dev-client`** build (a dev launcher that connects to Metro
and lets you pick the dev server). Build + launch:

```bash
npm install
npm run ios        # = expo run:ios --port 8085   (or: npm run android)
```

Then iterate JS-only with `npm start` (Metro on 8085). Point it at your local
web server by setting `EXPO_PUBLIC_WEB_URL` in `.env` first.

### Metro port — why 8085, not the default 8081

React Native's default Metro port is **8081**, and a plain debug build hard-wires
that port and ignores the launch URL. On a machine running more than one RN/Expo
project (this one has others on 8081/8082), the app will silently connect to the
**wrong** project's Metro and redbox with something like
`expo-router/entry.js: Call retries were exceeded`. The scripts here pin Metro to
**8085**; if that's taken, pick any free port and pass `--port <n>` to both
`start` and `run:ios`/`run:android`.

Because it's a dev-client build, you can also point a running app at a specific
Metro without rebuilding:

```bash
xcrun simctl openurl booted "dev.sset.athena://expo-development-client/?url=http://localhost:8085"
```

If a previous run cached the wrong packager location, `xcrun simctl uninstall
booted dev.sset.athena` clears it (survives a reinstall otherwise).

## Google sign-in — backend configuration (one-time)

The shell sends Google users to the system browser and returns via the
`athena://auth-callback` deep link. Two allow-lists must include it:

1. **Supabase** → Authentication → URL Configuration → **Redirect URLs**: add
   `athena://auth-callback`.
2. **Google Cloud** OAuth client: no change needed — Google still redirects to
   Supabase's `/auth/v1/callback`, which is already configured for the web app.

Magic-link and email/password sign-in work inside the WebView with no extra
setup. If the Supabase env vars are missing, the Google button surfaces a clear
"not configured" message instead of failing silently.

## Build for the stores (EAS)

```bash
npm i -g eas-cli
eas login
eas build:configure          # links/creates the EAS project
eas build --profile production --platform all
```

Set `EXPO_PUBLIC_*` as EAS environment variables / secrets for build profiles
(see `eas.json`). Bundle id / package: `dev.sset.athena` — change in `app.json`
if you register different identifiers.

## Permissions

Declared in `app.json` and surfaced to the WebView:

- **Camera** — photograph handwritten work / attach images.
- **Microphone** — voice tutoring and spoken answers.
- **Photo library** (iOS) — attach existing images.

`getUserMedia` inside the WebView is granted for same-host content
(`mediaCapturePermissionGrantType="grantIfSameHostElsePrompt"`) once the OS
permission is granted.

## How the auth bridge works

1. In the shell, the web app's "Continue with Google" button posts
   `{ type: "google-oauth", next }` to native instead of doing an in-page
   redirect (`isNativeWrapper()` guard).
2. Native runs the Supabase Google OAuth **PKCE** flow in the system browser
   (`expo-web-browser`), then `exchangeCodeForSession(code)`.
3. Native injects the tokens back; the web app calls
   `supabase.auth.setSession(...)` (writes the same cookies as password
   sign-in) and hard-navigates to `next`.

Tokens never travel through a URL — the code is exchanged over TLS by
`supabase-js`.

## Not yet included (candidate follow-ups)

- Push notifications (`expo-notifications`) — scaffold when there's a use.
- Universal / App Links for opening `athena.sset.dev` URLs directly in the app.
- OTA updates (`expo-updates` / EAS Update).
