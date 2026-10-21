# FinPocket — Mobile Application (Flutter & Dart + Cross-Platform)

Official mobile application for **FinPocket** built with **Flutter & Dart** (and React/TypeScript cross-platform).

## Website (React + Vite)

The website uses the React client in this folder and the API in `finpocket_server/`.
Start the API on port `3001` and the website on port `5173` in separate terminals:

```powershell
cd finpocket_server
npm ci
npm run build
npm start
```

```powershell
npm ci
npm run dev
```

For real account creation, copy `finpocket_server/.env.example` to
`finpocket_server/.env` and configure an email delivery provider (SMTP, Resend,
or Brevo). Email verification fails closed when no delivery service is configured.
Keep `.env` private and use a production PostgreSQL database and a strong
`JWT_SECRET` before exposing the app publicly.

This workspace's ignored local `.env` enables `DEV_EXPOSE_OTP=true` in
`DEVELOPMENT` mode, so a verification code is shown in the signup form while
testing locally. Remove that flag outside local development; production must
deliver the code through a configured email provider.

Account registration and sign-in use the API. Dashboard entries created in this
web client are saved separately per account in that browser; they are not yet
synchronized across browsers or devices.

---

## 📱 Flutter & Dart Application (`finpocket_app/`)

### 🛠️ Prerequisites
- **Flutter SDK**: `3.47.4` (Installed at `D:\flutter`)
- **Dart SDK**: `3.13.3`

---

## 🖥️ Running the Backend (`finpocket_server/`)

The app reads **real** balances, accounts and goals from the backend. Start it first —
without it the app falls back to cached/demo data.

```powershell
cd "d:\Finpocket Final Mobile\finpocket_server"
npm install
npm run dev          # http://localhost:3001, binds 0.0.0.0 so devices on your LAN can reach it
```

`npm run dev` frees port `3001` automatically if a previous instance is still
holding it (no more `EADDRINUSE` — just run it again and it takes over).

Health check: `http://localhost:3001/health/ready` (readiness, verifies DB; also reports
`aaEnabled` / `aaProvider` so clients know whether the Account Aggregator flow is live)
— liveness is `/health/live`.

Real bank data is driven by the Account Aggregator provider, which is installed at
bootstrap only when **all** of these hold (see `installFinancialDataProvider()` in
`src/index.ts`):

| Variable | Purpose |
|---|---|
| `AA_PROVIDER_ENABLED=true` | Master switch for the real provider |
| `SETU_CLIENT_ID` / `SETU_CLIENT_SECRET` | Setu AA credentials |
| `NODE_ENV` | Must **not** be `TEST` (tests install their own provider) |

When disabled, the server logs which reason it fell back to and serves the mock
provider instead.

Outbound alert delivery (unusual-transaction / budget alerts) is configured with the
`WHATSAPP_*` and `TWILIO_*` variables in `.env`. Left blank, alerts are recorded and
delivered in-app + to the OS notification shade only.

---

### ✅ Running Backend Tests

```powershell
npm test          # 9 suites, ~274 assertions
```

Tests never touch development data. `src/config/database.ts` detects that its entry
point lives under `src/tests/` and opens `data/finpocket.test.sqlite` instead of
`data/finpocket.sqlite`, so fixtures, fake-provider accounts and generated users are
isolated from the database the app actually reads. Override the name with
`FINPOCKET_DB_NAME` if you need a different sandbox.

---

### 📡 Reaching the Backend from a Device

The app targets `http://127.0.0.1:3001` by default. Android blocks cleartext HTTP to
anything but loopback, so `network_security_config.xml` permits plain HTTP **only** to
`localhost` / `127.0.0.1` / `10.0.2.2` / `[::1]` — every other host must be TLS.

**Emulator** — either reverse the port (default config just works):
```powershell
adb reverse tcp:3001 tcp:3001
flutter run -d android
```
…or point the build at the emulator's host alias:
```powershell
flutter run -d android --dart-define=FINPOCKET_API_HOST=10.0.2.2
```

**Physical device on the same Wi-Fi:**
```powershell
flutter run -d android --dart-define=FINPOCKET_API_HOST=192.168.1.7   # your PC's LAN IP
```

---

### 🚀 Running the Flutter App

#### 1. Navigate to the Flutter Project Directory
```powershell
cd "d:\Finpocket Final Mobile\finpocket_app"
```

#### 2. Run on Chrome (Web / Mobile Device Simulation)
```powershell
flutter run -d chrome
```

#### 3. Run on Connected Android Device / Emulator
```powershell
flutter run -d android
```

#### 4. Run on Windows Desktop
```powershell
flutter run -d windows
```

#### 5. Run Flutter Automated Tests
```powershell
flutter test
```

---

## 🌟 Included Flutter Modules & Features

1. **Design System & Theme**: Custom `#14B8A6` Teal brand theme, dark mode (`#0B1120`, `#0F172A`), and light mode in [app_theme.dart](file:///d:/Finpocket%20Final%20Mobile/finpocket_app/lib/theme/app_theme.dart).
2. **5-Tab Navigation**: Persistent bottom navigation for Home, Payments, History, Savings, and Profile in [main.dart](file:///d:/Finpocket%20Final%20Mobile/finpocket_app/lib/main.dart).
3. **Home Dashboard**: Available balance (with eye privacy toggle), Quick Pay action pills (Send, Receive, Scan, Request), emergency fund widget, monthly summary, upcoming obligations, and AI insights in [home_screen.dart](file:///d:/Finpocket%20Final%20Mobile/finpocket_app/lib/screens/home_screen.dart).
4. **Payments Hub**: Send money (with recipient, amount, category, and PIN authorization), connected bank accounts in [payments_screen.dart](file:///d:/Finpocket%20Final%20Mobile/finpocket_app/lib/screens/payments_screen.dart).
5. **Transaction History**: Search, category chips, status, and transaction cards in [transactions_screen.dart](file:///d:/Finpocket%20Final%20Mobile/finpocket_app/lib/screens/transactions_screen.dart).
6. **Savings & Emergency Fund**: Goal trackers, emergency deposits/withdrawals with PIN, and **Emergency Fund Lock Mode** in [savings_screen.dart](file:///d:/Finpocket%20Final%20Mobile/finpocket_app/lib/screens/savings_screen.dart).
7. **Bills & Active EMI Tracker**: Monthly recurring bills with "Mark Paid", active EMI loans in [bills_screen.dart](file:///d:/Finpocket%20Final%20Mobile/finpocket_app/lib/screens/bills_screen.dart).
8. **Document Vault**: Encrypted storage for Aadhaar, PAN, and Driving Licence with PIN unlock and expiry dates in [vault_screen.dart](file:///d:/Finpocket%20Final%20Mobile/finpocket_app/lib/screens/vault_screen.dart).
9. **Child Care Mode**: Complete payment blockage, masked balances, and parent PIN exit protection in [child_care_screen.dart](file:///d:/Finpocket%20Final%20Mobile/finpocket_app/lib/screens/child_care_screen.dart).
10. **AI Financial Assistant**: "Ask FinPocket" chat, query suggestions, and 0–100 Financial Health Score in [ai_assistant_screen.dart](file:///d:/Finpocket%20Final%20Mobile/finpocket_app/lib/screens/ai_assistant_screen.dart).
11. **8 Indian Languages**: Full translation across English, Telugu (తెలుగు), Hindi (हिन्दी), Tamil (தமிழ்), Kannada (ಕನ್ನಡ), Malayalam (മലയാളം), Marathi (मराठी), and Bengali (বাংলা) in [translations.dart](file:///d:/Finpocket%20Final%20Mobile/finpocket_app/lib/l10n/translations.dart).

---

## 🔐 Demo Credentials
- **App Security PIN**: `1234`
- **Parent PIN (Child Care Mode)**: `1234`
- **User**: Jithendra Sureddy (`jithendra@finpocket.com`)
