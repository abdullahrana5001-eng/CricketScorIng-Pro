# CricketScore Pro - Fixed GitHub Actions Workflow

## Critical Issues Found in Your Setup:

| Problem | Why It Happens |
|---------|---------------|
| No `pnpm-lock.yaml` | You haven't committed it, or you use `npm` |
| `corepack enable` fails | No `packageManager` field in `package.json` |
| No `packageManager` specified | GitHub doesn't know which package manager to use |
| Build fails at step 3-4 | Wrong package manager / missing lockfile |

---

## SOLUTION 1: Use NPM (Easiest - Matches Your Project)

Replace your entire `.github/workflows/build-apk.yml`:

```yaml
name: Build CricketScore Pro APK

on:
  workflow_dispatch:
  push:
    branches:
      - main

permissions:
  contents: read

jobs:
  build-apk:
    runs-on: ubuntu-latest

    steps:
      # ==========================================
      # 1. CHECKOUT
      # ==========================================
      - name: Checkout repository
        uses: actions/checkout@v4

      # ==========================================
      # 2. SETUP NODE.JS 20
      # ==========================================
      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: 'npm'  # Uses package-lock.json

      # ==========================================
      # 3. INSTALL DEPENDENCIES (using npm)
      # ==========================================
      - name: Install dependencies
        run: npm ci  # 'ci' is faster and more reliable than 'npm install' for CI

      # ==========================================
      # 4. BUILD WEB APP
      # ==========================================
      - name: Build web app
        run: npm run build

      # ==========================================
      # 5. SETUP CAPACITOR ANDROID
      # ==========================================
      - name: Check and add Android platform
        run: |
          if [ ! -d "android" ]; then
            echo "Android directory not found. Adding platform..."
            npx cap add android
          else
            echo "Android directory already exists. Skipping add."
          fi

      - name: Sync Capacitor with Android
        run: npx cap sync android

      # ==========================================
      # 6. SETUP JAVA 17 + ANDROID SDK
      # ==========================================
      - name: Setup Java 17
        uses: actions/setup-java@v4
        with:
          distribution: temurin
          java-version: 17
          cache: gradle

      - name: Setup Android SDK
        uses: android-actions/setup-android@v3

      # ==========================================
      # 7. BUILD DEBUG APK
      # ==========================================
      - name: Grant execute permission for gradlew
        working-directory: android
        run: chmod +x gradlew

      - name: Build debug APK with stacktrace
        working-directory: android
        run: ./gradlew assembleDebug --stacktrace

      # ==========================================
      # 8. VERIFY & PREPARE ARTIFACT
      # ==========================================
      - name: Verify APK exists
        run: |
          echo "Listing APK output directory:"
          ls -la android/app/build/outputs/apk/debug/ || echo "Directory not found!"

      - name: Copy and rename APK
        run: |
          mkdir -p $GITHUB_WORKSPACE/artifacts
          cp android/app/build/outputs/apk/debug/app-debug.apk $GITHUB_WORKSPACE/artifacts/CricketScore-Pro.apk

      # ==========================================
      # 9. UPLOAD ARTIFACT
      # ==========================================
      - name: Upload APK artifact
        uses: actions/upload-artifact@v4
        with:
          name: CricketScore-Pro-APK
          path: artifacts/CricketScore-Pro.apk
          retention-days: 30
```

---

## SOLUTION 2: Use PNPM (If You Prefer)

First, run these commands locally in your project folder:

```bash
# Install pnpm globally (one time)
npm install -g pnpm

# Generate pnpm-lock.yaml
pnpm install

# Commit the lockfile
git add pnpm-lock.yaml
git commit -m "Add pnpm lockfile"
git push
```

Then add to your `package.json`:
```json
{
  "packageManager": "pnpm@9.12.0"
}
```

Then use this workflow:

```yaml
name: Build CricketScore Pro APK

on:
  workflow_dispatch:
  push:
    branches:
      - main

permissions:
  contents: read

jobs:
  build-apk:
    runs-on: ubuntu-latest

    steps:
      - name: Checkout repository
        uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: 20

      - name: Setup pnpm
        uses: pnpm/action-setup@v2
        with:
          version: 9
          run_install: false

      - name: Get pnpm store directory
        id: pnpm-cache
        shell: bash
        run: |
          echo "STORE_PATH=$(pnpm store path)" >> $GITHUB_OUTPUT

      - name: Setup pnpm cache
        uses: actions/cache@v4
        with:
          path: ${{ steps.pnpm-cache.outputs.STORE_PATH }}
          key: ${{ runner.os }}-pnpm-store-${{ hashFiles('**/pnpm-lock.yaml') }}
          restore-keys: |
            ${{ runner.os }}-pnpm-store-

      - name: Install dependencies
        run: pnpm install --frozen-lockfile

      - name: Build web app
        run: pnpm run build

      - name: Check and add Android platform
        run: |
          if [ ! -d "android" ]; then
            npx cap add android
          else
            echo "Android already exists, skipping add"
          fi

      - name: Sync Capacitor with Android
        run: npx cap sync android

      - name: Setup Java 17
        uses: actions/setup-java@v4
        with:
          distribution: temurin
          java-version: 17
          cache: gradle

      - name: Setup Android SDK
        uses: android-actions/setup-android@v3

      - name: Grant execute permission for gradlew
        working-directory: android
        run: chmod +x gradlew

      - name: Build debug APK
        working-directory: android
        run: ./gradlew assembleDebug --stacktrace

      - name: Verify APK exists
        run: |
          ls -la android/app/build/outputs/apk/debug/ || echo "APK not found!"

      - name: Copy and rename APK
        run: |
          mkdir -p $GITHUB_WORKSPACE/artifacts
          cp android/app/build/outputs/apk/debug/app-debug.apk $GITHUB_WORKSPACE/artifacts/CricketScore-Pro.apk

      - name: Upload APK artifact
        uses: actions/upload-artifact@v4
        with:
          name: CricketScore-Pro-APK
          path: artifacts/CricketScore-Pro.apk
          retention-days: 30
```

---

## IMPORTANT: Check Your `capacitor.config.ts`

Make sure your `capacitor.config.ts` has the correct `webDir`:

```typescript
import { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.yourcompany.cricketscore',  // Change this to your app ID
  appName: 'CricketScore Pro',
  webDir: 'dist',  // MUST match Vite's output folder (check your vite.config.ts)
};

export default config;
```

**To check your output folder:**
- Look in `vite.config.ts` for `build.outDir`
- Default is `dist` for Vite
- Run `npm run build` locally and see what folder is created

---

## IMPORTANT: Check `android` Folder

If you already have an `android` folder in your repo:
- The workflow will skip `npx cap add android` ✓
- Make sure it's committed to git

If you DON'T have an `android` folder:
- The workflow will create it with `npx cap add android`
- Make sure to commit it after first successful run

---

## MOST LIKELY CAUSE OF YOUR ERROR

Your workflow failed because:
1. `corepack enable` → tries to use `pnpm`
2. `pnpm install` → fails because no `pnpm-lock.yaml` exists
3. **You probably use `npm` locally, not `pnpm`**

### Quick Fix (Recommended):
Use **SOLUTION 1 (npm)** above - it's the easiest and matches your project setup.

---

## After Pushing the Fix

1. Go to GitHub → Your repo → Actions
2. Click "Build CricketScore Pro APK"
3. Click "Run workflow" → Select branch → Run
4. Wait 3-5 minutes
5. Download your APK from the Artifacts section

---

## If It Still Fails

Copy and paste the **exact error message** from the failed step's logs. Look for:
- Red ❌ icon in the step
- Click the step to expand logs
- Copy the first 20-30 lines of the error

I'll fix it immediately once you share the error! 🏏