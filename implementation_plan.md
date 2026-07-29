# EXHALE — Full-Stack IoT Acidity Monitor

## Overview
Extend the EXHALE device from a standalone gadget into a connected health monitoring system. The ESP32-C3 SuperMini will submit acidity readings to Firebase via Wi-Fi. A Next.js web app hosted on Vercel will let authenticated users manage their profile and visualize their acidity logs over time. GitHub Actions will handle CI/CD deployments to both Vercel and Firebase Hosting.

**Decisions locked in:**
- ✅ **Q1 — User Selection:** Active user is selected on the website; the device reads it from Firebase.
- ✅ **Q2 — Single Device:** One EXHALE device (`exhale-device-01`) hardcoded in firmware.
- ✅ **Q3 — Authentication:** Firebase Authentication (email + password). Users sign up with basic profile info (name, age, gender, birthday). Firestore security rules require auth.
- ✅ **Pins (ESP32-C3 SuperMini):** SDA = GPIO 4, SCL = GPIO 5, Button = GPIO 9.

---

## User Review Required

> [!WARNING]
> Firebase API keys will be embedded in the Next.js frontend. Firestore Security Rules will require `request.auth != null` for all reads/writes from the web app. The `/device/config` document will use a **Firebase service account** on the ESP32 side (via REST with an API key scoped to Firestore reads only) so the device can read the active user without a user login.

> [!IMPORTANT]
> The ESP32 reads `/device/config` unauthenticated via the Firebase REST API. This single document will have a relaxed read rule (`allow read: if true`) while all other collections require auth. This is the minimal surface area for unauthenticated access.

---

## Architecture Diagram

```
┌─────────────────────────┐
│  ESP32-C3 SuperMini     │
│  + SCD41 + OLED         │
│                         │
│  1. Reads active_user   │◄──────────────────────────────┐
│     from Firebase        │                               │
│  2. Takes breath sample │                               │
│  3. POSTs reading       │──────────────────────────────►│
└─────────────────────────┘                               │
                                                          ▼
                                              ┌─────────────────────┐
                                              │  Firebase           │
                                              │  (Firestore DB)     │
                                              │                     │
                                              │  /users/{userId}    │
                                              │  /readings/{id}     │
                                              │  /device/config     │
                                              └────────┬────────────┘
                                                       │
                                              GitHub Actions (CI/CD)
                                                       │
                                              ┌────────▼────────────┐
                                              │  Vercel             │
                                              │  (Next.js App)      │
                                              │                     │
                                              │  - User Manager     │
                                              │  - Active User Sel. │
                                              │  - Acidity Graph    │
                                              │  - Calendar Logs    │
                                              │  - Settings / Clear │
                                              └─────────────────────┘
```

---

## Proposed Changes

### Component 1: Firebase Setup (Database Schema)

No code files yet — this is initial configuration.

**Firebase Authentication:**
- Provider: **Email + Password**
- Sign-up captures: `displayName` (used for OLED display and UI)
- Profile details (age, gender, birthday) stored in Firestore, not Firebase Auth

**Firestore Collections:**

```
/users/{uid}                  ← uid matches Firebase Auth UID
  - name: string              (display name)
  - age: number
  - gender: string            ("Male" | "Female" | "Other")
  - birthday: string          (ISO date: "1990-04-15")
  - createdAt: timestamp

/readings/{readingId}
  - userId: string            (Firebase Auth UID)
  - co2: number               (ppm)
  - temperature: number       (°C)
  - humidity: number          (% RH)
  - acidityIndex: number      (0–100)
  - estimatedPh: number
  - timestamp: timestamp
  - deviceId: string          ("exhale-device-01")

/device/config                (single document, no sub-collections)
  - activeUserId: string      (UID of user selected as active on website)
  - activeUserName: string    (display name, for OLED use)
  - deviceId: string          ("exhale-device-01")
```

**Firebase Security Rules:**
```
/users/{uid}     → allow read, write: if request.auth.uid == uid
/readings/{id}   → allow read, write: if request.auth != null
                                        && request.auth.uid == resource.data.userId
/device/config   → allow read: if true          ← ESP32 reads this unauthenticated
                   allow write: if request.auth != null
```

---

### Component 2: ESP32-C3 Firmware Changes

#### [MODIFY] [exhale_acidity_estimator.ino](file:///d:/Projects/Exhale/exhale_acidity_estimator/exhale_acidity_estimator.ino)

**Changes:**
1. **Update pin assignments** — Set `PIN_SDA = 4`, `PIN_SCL = 5`, `PIN_BUTTON = 9` for the C3 SuperMini.
2. **Add Wi-Fi** — Include `WiFi.h`, add SSID/password constants, connect in `setup()`.
3. **Add HTTPClient + ArduinoJson** — Use `HTTPClient.h` and `ArduinoJson` library to call the Firebase REST API.
4. **`fetchActiveUser()`** — New function: reads `/device/config` from Firestore REST API and returns the `activeUserId` string.
5. **`uploadReading()`** — New function: POSTs a new reading document to `/readings` in Firestore.
6. **Update `captureBreath()`** — After computing `lastReading`, call `fetchActiveUser()` then `uploadReading()`. Show "Uploading..." on OLED.
7. **New OLED screen `displayUploading()`** — Shown during the Firebase POST (~1-3s).
8. **New OLED screen `displayUploadSuccess(bool success)`** — Shows ✓ or ✗ result.
9. **Error handling** — If Wi-Fi or upload fails, still show local result on OLED. Device works offline.

**New Libraries needed (Arduino Library Manager):**
- `ArduinoJson` by Benoit Blanchon
- Built-in `WiFi.h` and `HTTPClient.h` (part of ESP32 Arduino core)

**New constants to add:**
```cpp
#define PIN_SDA          4               // I2C SDA — ESP32-C3 SuperMini
#define PIN_SCL          5               // I2C SCL — ESP32-C3 SuperMini
#define PIN_BUTTON       9               // Tactile button
#define WIFI_SSID        "your-ssid"
#define WIFI_PASSWORD    "your-password"
#define FIREBASE_PROJECT "your-project-id"
#define DEVICE_ID        "exhale-device-01"
// Firebase REST base URL derived from project ID
```

---

### Component 3: Next.js Web Application (NEW)

**Framework:** Next.js 14 (App Router) deployed on Vercel.  
**Styling:** Vanilla CSS with CSS variables (dark, medical/clinical aesthetic).  
**Auth:** Firebase Authentication (email + password) via `firebase` JS SDK.  
**Data:** Firebase Firestore via `firebase` JS SDK (client-side).

#### Auth Flow
1. Unauthenticated users land on `/login` — a full-page login form.
2. A "Don't have an account? Sign up" link leads to `/signup`.
3. Sign-up form collects: **email, password, name, age, gender, birthday**.
4. On sign-up, Firebase Auth creates the account and Firestore `/users/{uid}` is written.
5. After login/signup, users are redirected to `/` (Dashboard).
6. A middleware (Next.js `middleware.ts`) protects all routes except `/login` and `/signup`.

#### Project Structure
```
exhale-web/
├── app/
│   ├── layout.tsx           # Root layout, fonts, global nav (auth-aware)
│   ├── page.tsx             # Dashboard — graph + recent logs
│   ├── login/
│   │   └── page.tsx         # Login page (email + password)
│   ├── signup/
│   │   └── page.tsx         # Sign-up page (email, password, name, age, gender, bday)
│   ├── profile/
│   │   └── page.tsx         # Edit own profile + change password
│   └── settings/
│       └── page.tsx         # Clear data logs, device config
├── components/
│   ├── AcidityChart.tsx     # Recharts line chart of AI over time
│   ├── CalendarView.tsx     # Month calendar with day-level acidity heat
│   ├── ReadingCard.tsx      # Single reading summary card
│   ├── ActiveUserPicker.tsx # Dropdown to select active user on device
│   └── Navbar.tsx           # Top nav with user avatar + logout
├── lib/
│   ├── firebase.ts          # Firebase app init + Auth + Firestore instances
│   ├── auth.ts              # signUp(), signIn(), signOut(), onAuthChange()
│   ├── users.ts             # getUser(), updateUser() for /users/{uid}
│   └── readings.ts          # getReadings(), deleteReadings() for /readings
├── middleware.ts             # Route protection — redirects unauthenticated users
├── styles/
│   └── globals.css          # Design system: tokens, dark theme, typography
├── .env.local               # Firebase config keys (not committed)
├── .env.example             # Template for env vars (committed)
└── next.config.js
```

#### [NEW] `lib/firebase.ts`
- Initializes Firebase app with env vars.
- Exports `auth` (Firebase Auth) and `db` (Firestore instance).

#### [NEW] `lib/auth.ts`
- `signUp(email, password, profile)` — creates Auth user + writes `/users/{uid}` doc.
- `signIn(email, password)` — Firebase email/password sign-in.
- `signOut()` — logs out and redirects to `/login`.
- `onAuthChange(callback)` — wraps `onAuthStateChanged` for reactive auth state.

#### [NEW] `lib/users.ts`
- `getUser(uid)` — fetches own `/users/{uid}` doc.
- `updateUser(uid, data)` — updates profile fields.
- `setActiveUser(uid, name)` — writes `activeUserId` + `activeUserName` to `/device/config`.
- `getActiveUser()` — reads `/device/config` (used by Active User Picker).

#### [NEW] `lib/readings.ts`
- `getReadings(userId, dateRange?)` — queries readings for logged-in user with optional date filter.
- `deleteReadings(userId)` — batch-deletes all readings for a user.

#### [NEW] `app/login/page.tsx` — Login Page
- Full-page form: email, password fields.
- "Sign in" button with loading state.
- Link to `/signup`.
- On success: redirect to `/`.

#### [NEW] `app/signup/page.tsx` — Sign-Up Page
- Form fields: **email, password, name, age, gender, birthday**.
- On submit: calls `signUp()` which creates Auth account + Firestore profile in one step.
- On success: redirect to `/`.

#### [NEW] `middleware.ts` — Route Protection
- Checks for Firebase Auth session cookie.
- Redirects unauthenticated users to `/login` for any route except `/login` and `/signup`.

#### [NEW] `app/page.tsx` — Dashboard
- **Active User Picker** — a dropdown listing all registered users (fetched from Firestore); selecting one writes to `/device/config` so the ESP32 knows who to log readings for.
- **Acidity Chart** — a line/area chart using `recharts`, showing `acidityIndex` over time for the active user, with date range filter (Today / 7 Days / 30 Days / All).
- **Calendar View** — a monthly calendar where each day is color-coded by average acidity (green → yellow → red gradient).
- **Recent Readings Table** — last 10 readings with time, CO2, Temp, RH, AI.

#### [NEW] `app/profile/page.tsx` — Profile Page
- Displays and allows editing of: name, age, gender, birthday.
- Change password form (via Firebase Auth `updatePassword()`).

#### [NEW] `app/settings/page.tsx` — Settings
- "Clear my readings" — deletes all readings for the logged-in user.
- "Clear ALL readings" — danger zone with confirmation dialog (for device admin use).
- Current device status (active user displayed, last reading timestamp).

---

### Component 4: GitHub Repository & CI/CD

#### Repository Structure
```
exhale-web/           ← Next.js app (this is the GitHub repo)
├── .github/
│   └── workflows/
│       └── firebase-deploy.yml   ← Deploy Firebase rules on push to main
└── firebase.json                 ← Firebase project config
```

**Workflow: `firebase-deploy.yml`**
- Triggers on push to `main`.
- Deploys Firestore Security Rules via `firebase-tools`.
- Vercel deployment is handled automatically by the Vercel GitHub integration (no workflow needed for frontend).

**Setup Steps:**
1. Create GitHub repo for `exhale-web`.
2. Connect repo to Vercel (Vercel GitHub App auto-deploys on every push to `main`).
3. Add Firebase service account JSON as a GitHub Secret (`FIREBASE_SERVICE_ACCOUNT`).
4. Add Firebase project env vars as Vercel Environment Variables.

---

## Implementation Phases

| # | Phase | Est. Effort |
|---|-------|-------------|
| 1 | Firebase project setup + Auth + Firestore schema + security rules | 1–2 hrs |
| 2 | ESP32-C3 firmware — Wi-Fi + Firebase upload | 2–3 hrs |
| 3 | Next.js project scaffold + design system + middleware | 1–2 hrs |
| 4 | Login + Sign-up pages with Firebase Auth | 1–2 hrs |
| 5 | Firebase lib (auth, users, readings) + Active User Picker | 1–2 hrs |
| 6 | Dashboard — chart + calendar + readings table | 2–3 hrs |
| 7 | Profile page + Settings page | 1 hr |
| 8 | GitHub repo + Vercel + GitHub Actions wiring | 1 hr |
| 9 | End-to-end testing (sign up → select user → device reads → website shows) | 1–2 hrs |

---

## Verification Plan

### Automated Tests
- Next.js build: `npm run build` — must complete with no errors before each deploy.
- Vercel Preview Deployments on every PR for visual review.

### Manual Verification
1. **Device Test:** Power on ESP32-C3, confirm OLED shows calibration, take a breath reading, confirm data appears in Firebase Firestore console.
2. **Website Test:** Open Vercel URL, add a user, set them as active, see their readings appear in the graph and calendar.
3. **Clear Data Test:** Use Settings page to clear readings, verify Firestore is emptied.
4. **Offline Test:** Disconnect Wi-Fi, take a reading — confirm OLED still shows local result with a "No network" message.
