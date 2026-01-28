# macOS Code Signing and Notarization

This guide explains how to sign and notarize the Android Debugger app for macOS distribution.

## Prerequisites

- Apple Developer Program membership ($99/year)
- macOS with Xcode Command Line Tools installed
- Keychain Access app

## Step 1: Create Developer ID Certificate

### 1a. Generate a Certificate Signing Request (CSR)

1. Open **Keychain Access** (Applications → Utilities → Keychain Access)
2. Menu: **Keychain Access → Certificate Assistant → Request a Certificate From a Certificate Authority**
3. Fill in:
   - **User Email Address**: Your Apple ID email
   - **Common Name**: Your name
   - **CA Email Address**: Leave blank
   - **Request is**: Select "Saved to disk"
4. Click **Continue** and save the `.certSigningRequest` file

### 1b. Create Certificate in Apple Developer Portal

1. Go to https://developer.apple.com/account/resources/certificates/list
2. Click the **+** button to create a new certificate
3. Under "Software", select **"Developer ID Application"**
4. Click **Continue**
5. Upload the `.certSigningRequest` file you created
6. Click **Continue**
7. **Download** the certificate (`.cer` file)

### 1c. Install the Certificate

1. Double-click the downloaded `.cer` file
2. It will open in Keychain Access and install automatically
3. The certificate should appear under "My Certificates" in Keychain Access

### 1d. Verify Installation

Run this in Terminal:

```bash
security find-identity -v -p codesigning
```

You should see output like:

```
1) ABCD1234... "Developer ID Application: Your Name (TEAM_ID)"
```

Note your **Team ID** - the 10-character code in parentheses.

## Step 2: Create App-Specific Password

1. Go to https://appleid.apple.com/account/manage
2. Under "Sign-In and Security" → "App-Specific Passwords"
3. Generate a new password, name it "electron-notarize"
4. Save this password securely

## Step 3: Configure Environment Variables

Copy the example environment file:

```bash
cp .env.example .env
```

Edit `.env` with your credentials:

```
APPLE_ID=your-apple-id@example.com
APPLE_APP_SPECIFIC_PASSWORD=xxxx-xxxx-xxxx-xxxx
APPLE_TEAM_ID=YOUR_TEAM_ID
```

## Step 4: Build and Package

```bash
# Build the app
pnpm run build

# Package with signing and notarization
pnpm run package:signed
```

The build process will:
1. Sign the app with your Developer ID certificate
2. Submit to Apple for notarization
3. Staple the notarization ticket to the app

First notarization takes 5-15 minutes. Subsequent builds are faster.

## Verification

After building, verify the app is properly signed and notarized:

```bash
# Check code signature
codesign -dv --verbose=4 "dist/mac-arm64/Android Debugger.app"

# Verify notarization
spctl -a -vvv -t install "dist/mac-arm64/Android Debugger.app"
```

Expected output should include `source=Notarized Developer ID`.

## Troubleshooting

### "No identity found"

Your Developer ID certificate is not installed. Check Keychain Access or re-download from Apple Developer Portal.

### Notarization fails

- Verify `APPLE_ID` and `APPLE_APP_SPECIFIC_PASSWORD` are correct
- Ensure the app-specific password is still valid
- Check Apple's notarization service status at https://developer.apple.com/system-status/

### "App is damaged" error

The app wasn't notarized or the notarization ticket wasn't stapled. Rebuild with `pnpm run package:signed`.

## Files

| File | Purpose |
|------|---------|
| `.env` | Your credentials (git-ignored) |
| `.env.example` | Template for credentials |
| `build/entitlements.mac.plist` | Entitlements for hardened runtime |

## Resources

- [Apple Developer Portal](https://developer.apple.com/account)
- [Apple ID App-Specific Passwords](https://appleid.apple.com/account/manage)
- [electron-builder Code Signing](https://www.electron.build/code-signing)
- [Apple Notarization Documentation](https://developer.apple.com/documentation/security/notarizing_macos_software_before_distribution)
