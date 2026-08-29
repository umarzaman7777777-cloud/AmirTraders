# Amir Traders — cloud APK builder

This folder is a complete Capacitor Android project, wired up with a GitHub
Actions workflow that builds a real, installable `.apk` automatically —
in the cloud, no Android Studio needed. You do this setup **once**; after
that, every time you push a new `index.html`, a fresh APK appears
automatically a couple of minutes later.

## One-time setup (about 10 minutes)

### 1. Create a free GitHub account
Skip this if you already have one — [github.com/join](https://github.com/join).

### 2. Create a new repository
On [github.com/new](https://github.com/new): pick any name (e.g.
`amir-traders-app`), set it to **Private** (recommended, since this
contains your business app), leave everything else unchecked (no README,
no .gitignore — this project already has those), click **Create repository**.

### 3. Install GitHub Desktop (easiest way — no command line at all)
Download from [desktop.github.com](https://desktop.github.com), install
it, sign in with your GitHub account.

- **File → Clone Repository** → pick the repo you just created → choose
  any folder on your computer → **Clone**.
- Now copy **everything from inside this `apk-project` folder** (the one
  this SETUP.md is in) into that cloned folder, so the cloned folder ends
  up containing `www/`, `android/`, `.github/`, `capacitor.config.ts`,
  `package.json`, `package-lock.json`, `.gitignore`, etc. — merge it in,
  don't nest it inside a subfolder.
- Back in GitHub Desktop, you'll see a big list of changed files — type
  a summary at the bottom left (e.g. "Initial commit") and click
  **Commit to main**, then click **Push origin** at the top.

That's it — pushing triggers the build automatically.

*(Prefer the command line instead? From inside this folder:
`git init && git add . && git commit -m "Initial commit" && git branch -M main && git remote add origin <your-repo-URL> && git push -u origin main`)*

### 4. Watch it build
On your repo's GitHub page, click the **Actions** tab — you'll see
"Build Amir Traders APK" running (takes ~3-5 minutes the first time,
faster after). Green checkmark = success.

### 5. Download the APK onto your phone
Once it's green, click the **Releases** link on the right side of your
repo's main page (or go to `github.com/<you>/<repo>/releases`) — open
**"Latest debug build"** and tap the `.apk` file to download it. On your
phone's browser this downloads straight to your Downloads folder — open
it from there to install (Android will ask to allow installing from
this source the first time; that's expected for a non-Play-Store app).

---

## Updating the app in the future
Whenever you get a new `index.html` from Claude:
1. Replace `www/index.html` in your cloned folder with the new one.
2. In GitHub Desktop: commit the change, push.
3. Wait ~3-5 minutes, then grab the new APK from the same Releases page
   as before — it updates in place under the same "Latest debug build"
   release each time, so it's always the same link.

You never need to touch `android/`, `package.json`, or the workflow file
for a plain content update — only `www/index.html` changes.

---

## If the build fails on "Publish/update the latest build release"
GitHub sometimes ships new repos with Actions set to read-only by
default. Fix: your repo's **Settings → Actions → General → Workflow
permissions → select "Read and write permissions" → Save**, then re-run
the failed workflow from the Actions tab.

## About the app ID
This project is set up with the package name `com.amirtraders.app`. If
you already have a version of this app installed from a previous
Android-Studio build under a *different* package name, this cloud build
will install as a separate, second app rather than updating the old one
— not a problem, just something to know. If you'd rather match your
existing app's exact package name so this replaces it cleanly, tell
Claude what it is and it can be changed in `capacitor.config.ts` and
`android/app/build.gradle` before your first push.

## Debug vs. release build
This workflow builds a **debug APK** — perfectly fine for installing on
your own phone and daily use. If you ever want a properly signed release
build (e.g. for the Play Store), that's a separate one-time step
involving a signing keystore — ask Claude and it can extend this same
workflow to do that too.

## Voice commands (added 2026-08-29)
Tap the mic icon in the top header to open/navigate ledgers by voice, in
Urdu (primary) or English (secondary). It works two ways:

- **Offline** (works out of the box once the APK is rebuilt with the new
  `package.json` — `@capacitor-community/speech-recognition` was added):
  uses the phone/tablet's own built-in recognizer. Accuracy on
  mixed Urdu/English sentences is decent but not great, since on-device
  recognizers only really do one language well at a time.
- **Online** (better accuracy on mixed Urdu/English, needs internet): uses
  Google Cloud Speech-to-Text. To turn this on, get a free-tier API key
  from Google Cloud Console (APIs & Services → Credentials → enable the
  "Cloud Speech-to-Text API" first) and paste it into `GOOGLE_STT_API_KEY`
  near the top of the "VOICE COMMANDS" section in `www/index.html`. Left
  blank, the app just always uses the offline engine — nothing breaks,
  it's simply less accurate on mixed-language speech.

Note on that key: pasting it directly into `index.html` is fine to try
this out, but it does end up inside the built APK where it could in
theory be extracted — for real day-to-day use later, ask Claude to move
that call behind the Apps Script backend instead (so the key lives on
the server, not the device).

This first version only handles **navigation** ("paint ledger kholo" /
"open sales") — not yet adding orders/expenses or looking up balances by
voice. That's a deliberate first step; ask Claude to extend it once
you've tried navigation for a while on both devices.

## QR code on exports & prints (added 2026-08-29)
Every PDF export, JPG export, and printed document now has a small QR
code in its footer, alongside "Scan for export details" and a short
Export ID. Works fully offline (the QR library is vendored locally, same
as jspdf/html2canvas).

What it currently contains: the app name, the document's title, a unique
export ID, when it was generated, and — when that ledger's export
includes one — its headline total. It does **not** yet link anywhere
online. Turning "Export ID" into a real "scan to open this record on the
web" link needs a small lookup endpoint added to the Apps Script backend
(`Code.gs`) — ask Claude for that next if you want it.
