# FinPocket OTP Authentication: Local Setup & Testing Guide

This guide provides step-by-step instructions for running and testing FinPocket's email and mobile OTP authentication system locally on Windows 10/11 using VS Code, Node.js, and Flutter.

---

## 1. Prerequisites & Environment Verification

Verify installed tools via PowerShell:

```powershell
# 1. Node.js (v20.x or v22.x LTS recommended)
node -v
npm -v

# 2. Flutter & Dart SDK
flutter --version
dart --version

# 3. Git
git --version
```

If Flutter or Node are not installed, install them using `winget`:
```powershell
winget install OpenJS.NodeJS.LTS
winget install Google.Flutter
```

---

## 2. Backend Configuration (`finpocket_server`)

### Step 2.1: Navigate to Server Directory
```powershell
cd "d:\Finpocket Final Mobile\finpocket_server"
```

### Step 2.2: Configure `.env` File
Copy `.env.example` to `.env` (if not already present):
```powershell
Copy-Item .env.example .env
```

Open `.env` in VS Code and set the following parameters for local testing:

```ini
NODE_ENV=DEVELOPMENT
PORT=3001
CORS_ORIGIN=*

# Cryptographic secret (minimum 32 characters)
JWT_SECRET=finpocket-local-dev-jwt-secret-key-32chars-min!!

# Database (SQLite is default and recommended for local development)
DATABASE_URL=sqlite:./finpocket.db
```

---

## 3. Configuring Real Email (Gmail SMTP) & SMS Providers

### Step 3.1: Generate a Google App Password (for Gmail SMTP)
Standard Google account passwords **will not work** for SMTP authentication. You must generate an App Password:
1. Log in to your Google Account at [https://myaccount.google.com/](https://myaccount.google.com/).
2. Navigate to **Security** -> **How you sign in to Google**.
3. Ensure **2-Step Verification** is turned **ON**.
4. In the search bar at top of Google Account, search for **App passwords**.
5. Set app name to `FinPocket Local Dev` and click **Create**.
6. Copy the generated 16-character password (e.g., `abcd efgh ijkl mnop`).
7. Update `.env` in `finpocket_server`:
   ```ini
   SMTP_HOST=smtp.gmail.com
   SMTP_PORT=587
   SMTP_SECURE=false
   SMTP_USER=your_email@gmail.com
   SMTP_APP_PASSWORD=abcdefghijklmnop
   SMTP_FROM="FinPocket Security" <no-reply@finpocket.com>
   ```

### Step 3.2: Configure SMS Provider (Fast2SMS for India)
1. Sign up for a free developer account at [https://www.fast2sms.com/](https://www.fast2sms.com/).
2. Go to the **Dev API** tab and copy your **API Authorization Key**.
3. Update `.env` in `finpocket_server`:
   ```ini
   SMS_PROVIDER=fast2sms
   FAST2SMS_API_KEY=your_copied_api_key_here
   FAST2SMS_ROUTE=otp
   ```
4. **Offline / Mock Mode:** If you do not have an active Fast2SMS API key or wish to develop offline, configure:
   ```ini
   SMS_PROVIDER=mock
   ```
   In mock mode, SMS messages are accepted immediately and logged in the console without incurring carrier fees or requiring network connectivity.

---

## 4. Running Database Migrations

FinPocket uses a unified schema engine supporting SQLite (local dev) and PostgreSQL (production).

To run migrations:
```powershell
cd "d:\Finpocket Final Mobile\finpocket_server"
npm install
npm run db:migrate
```

*Note: For SQLite, `npm run dev` automatically creates tables and runs non-destructive schema migrations on startup.*

---

## 5. Starting the Node.js Backend

Start the development server with live reload:
```powershell
cd "d:\Finpocket Final Mobile\finpocket_server"
npm run dev
```

Expected startup output:
```
[Config] Environment: DEVELOPMENT | Demo Mode: false | Mock Provider: false
[Database] SQLite connected: ./finpocket.db
[EmailService] SMTP configured via Gmail: your_email@gmail.com
[SmsService] SMS Provider configured: Fast2SMS (route: otp)
[Server] FinPocket API listening on port 3001
```

---

## 6. Configuring & Running the Flutter Mobile App

### Step 6.1: API Base URL & Network Addressing
The Flutter app needs to reach the backend on port 3001. Different test targets require different IP addresses:

| Platform / Target | Correct API Base URL | Why? |
| :--- | :--- | :--- |
| **Windows Desktop App** | `http://localhost:3001` | Same machine host loopback. |
| **Android Emulator** | `http://10.0.2.2:3001` | Android emulator loopback alias to host machine. `localhost` inside emulator refers to emulator itself. |
| **Physical Android Device** | `http://192.168.x.x:3001` | Your computer's local Wi-Fi IP address. Device must be on the same Wi-Fi network. |
| **iOS Simulator** (macOS) | `http://localhost:3001` | Shares host network interface. |

To find your computer's local Wi-Fi IP on Windows:
```powershell
ipconfig
# Look for 'IPv4 Address' under 'Wireless LAN adapter Wi-Fi' (e.g. 192.168.1.15)
```

In `finpocket_app/lib/services/api_client.dart`, ensure `baseUrl` corresponds to your target environment.

### Step 6.2: Run Flutter App
```powershell
cd "d:\Finpocket Final Mobile\finpocket_app"
flutter pub get
flutter run
```

---

## 7. End-to-End Verification Walkthrough

### Test A: Registration with Email & Mobile OTP
1. Launch the app and tap **Register** on the welcome/login screen.
2. Fill in:
   - **Full Name**: `Priya Sharma`
   - **Email Address**: Your configured Gmail or test email
   - **Mobile Number**: A 10-digit Indian phone number (`9876543210`)
   - **Password**: `SecurePass123!`
   - Complete the Math Captcha challenge.
3. Tap **Create Account**:
   - The **Email Verification Sheet** automatically opens.
   - Enter the 6-digit OTP received in your inbox.
   - Upon success, the sheet seamlessly switches to **Mobile Number Verification**.
   - Enter the 6-digit SMS OTP received on your phone (or console output in mock mode).
4. Tap **Verify & Activate**:
   - The account is registered, both `email_verified` and `phone_verified` are set to `1`.
   - The user is automatically logged in and redirected to the main dashboard.

### Test B: 30-Second Resend Cooldown
1. Request a code.
2. Notice the **Resend Code** button displays a 30-second live countdown: `Resend code in 29s`.
3. The button is disabled until the countdown reaches 0.
4. If an external client attempts to call `POST /auth/email/send-otp` before 30 seconds expire, the backend rejects it with `HTTP 429 Too Many Requests`.

### Test C: Failed Attempt Lockout
1. Request an OTP.
2. Enter an incorrect 6-digit code (e.g., `000000`).
3. Notice attempt counter: `Invalid verification code. 4 attempts remaining.`
4. Enter 4 more incorrect codes.
5. On the 5th failed attempt, the code is locked out:
   `Too many failed attempts. This code has been invalidated. Please request a new code.`

---

## 8. Troubleshooting Common Issues

### Issue 1: `BadCredentialsException` or Gmail SMTP Authentication Error
- **Cause**: Standard Google account password was used or 2-Step Verification is disabled.
- **Solution**: Follow Section 3.1 to generate a 16-character **Google App Password**. Paste it into `.env` without spaces.

### Issue 2: Android Emulator `SocketException: Connection refused (errno = 111)`
- **Cause**: Using `http://localhost:3001` or `http://127.0.0.1:3001` inside an Android emulator.
- **Solution**: Use `http://10.0.2.2:3001`. Also verify Windows Firewall allows inbound connections on port 3001 for private networks:
  ```powershell
  New-NetFirewallRule -DisplayName "FinPocket Backend 3001" -Direction Inbound -LocalPort 3001 -Protocol TCP -Action Allow
  ```

### Issue 3: Fast2SMS Returns HTTP 400 or "Invalid Mobile Number"
- **Cause**: Phone number formatting.
- **Solution**: FinPocket normalizes phone numbers automatically. Indian phone numbers must start with `6`, `7`, `8`, or `9` and contain exactly 10 digits after the country code. Example: `9876543210` or `+919876543210`.

### Issue 4: Running Automated Test Suites
Run the full automated test suites to ensure everything is operating cleanly:
```powershell
# Backend (330 tests covering SSO, OTP, fast2sms, rate limits, PostgreSQL, RLS)
cd "d:\Finpocket Final Mobile\finpocket_server"
npm test

# Mobile App (148 tests covering authentication, OTP modal, widgets, secure vault)
cd "d:\Finpocket Final Mobile\finpocket_app"
flutter test
flutter analyze
```
