import { useState } from "react";
import { downloadFile } from "../engine/export";
import { useApp } from "../context/AppContext";

type Tab = "structure" | "github" | "instructions";

const GITHUB_ACTIONS_YAML = `name: Build Release APK

on:
  push:
    branches: [ main ]
    tags: [ 'v*' ]
  pull_request:
    branches: [ main ]
  workflow_dispatch:

jobs:
  build:
    runs-on: ubuntu-latest

    steps:
    - name: Checkout repository
      uses: actions/checkout@v4

    - name: Set up JDK 17
      uses: actions/setup-java@v4
      with:
        java-version: '17'
        distribution: 'temurin'
        cache: gradle

    - name: Grant execute permission for gradlew
      run: chmod +x gradlew

    - name: Cache Gradle packages
      uses: actions/cache@v4
      with:
        path: |
          ~/.gradle/caches
          ~/.gradle/wrapper
        key: \${{ runner.os }}-gradle-\${{ hashFiles('**/*.gradle*', '**/gradle-wrapper.properties') }}
        restore-keys: |
          \${{ runner.os }}-gradle-

    - name: Build debug APK
      run: ./gradlew assembleDebug

    - name: Upload Debug APK
      uses: actions/upload-artifact@v4
      with:
        name: app-debug
        path: app/build/outputs/apk/debug/app-debug.apk
        retention-days: 30

    - name: Build Release APK (unsigned)
      run: ./gradlew assembleRelease

    - name: Upload Release APK
      uses: actions/upload-artifact@v4
      with:
        name: app-release-unsigned
        path: app/build/outputs/apk/release/app-release-unsigned.apk
        retention-days: 30

    - name: Sign Release APK
      if: github.ref_type == 'tag'
      uses: r0adkll/sign-android-release@v1
      with:
        releaseDirectory: app/build/outputs/apk/release
        signingKeyBase64: \${{ secrets.SIGNING_KEY }}
        alias: \${{ secrets.ALIAS }}
        keyStorePassword: \${{ secrets.KEY_STORE_PASSWORD }}
        keyPassword: \${{ secrets.KEY_PASSWORD }}

    - name: Create GitHub Release
      if: github.ref_type == 'tag'
      uses: softprops/action-gh-release@v2
      with:
        files: app/build/outputs/apk/release/*.apk
        generate_release_notes: true
`;

const PROJECT_STRUCTURE = `CricketScorePro/
├── .github/
│   └── workflows/
│       └── build.yml          ← GitHub Actions (copy from tab)
├── app/
│   ├── src/main/
│   │   ├── AndroidManifest.xml
│   │   ├── java/com/cricketscorpro/
│   │   │   ├── MainActivity.kt
│   │   │   ├── data/
│   │   │   │   ├── db/
│   │   │   │   │   ├── AppDatabase.kt      (Room DB)
│   │   │   │   │   ├── dao/
│   │   │   │   │   │   ├── PlayerDao.kt
│   │   │   │   │   │   ├── TeamDao.kt
│   │   │   │   │   │   ├── MatchDao.kt
│   │   │   │   │   │   ├── InningsDao.kt
│   │   │   │   │   │   └── DeliveryDao.kt
│   │   │   │   │   └── entities/
│   │   │   │   │       ├── Player.kt
│   │   │   │   │       ├── Team.kt
│   │   │   │   │       ├── Tournament.kt
│   │   │   │   │       ├── Match.kt
│   │   │   │   │       ├── Innings.kt
│   │   │   │   │       └── Delivery.kt
│   │   │   │   └── repository/
│   │   │   │       ├── MatchRepository.kt
│   │   │   │       └── PlayerRepository.kt
│   │   │   ├── domain/
│   │   │   │   ├── ScoringEngine.kt
│   │   │   │   ├── StatisticsEngine.kt
│   │   │   │   └── ExportEngine.kt
│   │   │   └── ui/
│   │   │       ├── theme/
│   │   │       │   ├── Theme.kt
│   │   │       │   ├── Color.kt
│   │   │       │   └── Type.kt
│   │   │       └── screens/
│   │   │           ├── home/HomeScreen.kt
│   │   │           ├── match/LiveScoringScreen.kt
│   │   │           ├── scorecard/ScorecardScreen.kt
│   │   │           ├── players/PlayersScreen.kt
│   │   │           └── stats/StatsScreen.kt
│   │   └── res/
│   │       ├── values/strings.xml
│   │       └── drawable/ic_launcher.xml
│   └── build.gradle.kts
├── build.gradle.kts
├── gradle/
│   └── wrapper/
│       └── gradle-wrapper.properties
├── gradle.properties
└── settings.gradle.kts`;

const SETUP_INSTRUCTIONS = `## Building the Native Android APK

### Step 1: Set Up Android Development Environment
1. Install Android Studio (latest stable)
2. Install JDK 17 (required for Gradle 8+)
3. Install Android SDK (API level 34+)

### Step 2: Create the Android Project
1. Open Android Studio → New Project
2. Select "Empty Compose Activity"
3. Package name: com.cricketscorpro
4. Minimum SDK: API 26 (Android 8.0)
5. Build configuration language: Kotlin DSL (.kts)

### Step 3: Add Dependencies (app/build.gradle.kts)
\`\`\`kotlin
dependencies {
    // Compose
    implementation(platform("androidx.compose:compose-bom:2024.10.00"))
    implementation("androidx.compose.ui:ui")
    implementation("androidx.compose.material3:material3")
    implementation("androidx.compose.ui:ui-tooling-preview")
    implementation("androidx.activity:activity-compose:1.9.3")

    // Navigation
    implementation("androidx.navigation:navigation-compose:2.8.3")

    // Room DB
    implementation("androidx.room:room-runtime:2.6.1")
    implementation("androidx.room:room-ktx:2.6.1")
    kapt("androidx.room:room-compiler:2.6.1")

    // ViewModel + Lifecycle
    implementation("androidx.lifecycle:lifecycle-viewmodel-compose:2.8.7")
    implementation("androidx.lifecycle:lifecycle-runtime-compose:2.8.7")

    // Coroutines
    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-android:1.8.1")

    // DataStore (settings)
    implementation("androidx.datastore:datastore-preferences:1.1.1")

    // PDF generation
    implementation("com.itextpdf:itext7-core:8.0.4")
}
\`\`\`

### Step 4: Push to GitHub
\`\`\`bash
git init
git add .
git commit -m "Initial commit: CricketScore Pro"
git remote add origin https://github.com/YOUR_USERNAME/CricketScorePro.git
git branch -M main
git push -u origin main
\`\`\`

### Step 5: Download APK from GitHub Actions
1. Go to your GitHub repo → Actions tab
2. Click on the latest "Build Release APK" workflow run
3. Scroll down to "Artifacts"
4. Download "app-debug" for testing
5. For signed release: create a keystore, add secrets to repo settings

### Step 6: Install on Android Device
\`\`\`bash
# Via ADB (USB debugging enabled)
adb install app-debug.apk

# Or transfer the APK file to your device
# Enable "Install from unknown sources" in Settings
\`\`\`

### For Signed Release APK (Google Play Store):
1. Generate keystore: \`keytool -genkey -v -keystore release.jks -alias cricketpro -keyalg RSA -keysize 2048 -validity 10000\`
2. Base64 encode: \`base64 -i release.jks | pbcopy\`
3. Add GitHub Secrets:
   - SIGNING_KEY: base64 encoded keystore
   - ALIAS: your key alias
   - KEY_STORE_PASSWORD: keystore password
   - KEY_PASSWORD: key password
4. Push a tag: \`git tag v1.0.0 && git push --tags\`
5. GitHub Actions auto-builds + signs + creates a GitHub Release`;

export default function AndroidInfo() {
  const { navigate } = useApp();
  const [tab, setTab] = useState<Tab>("structure");
  const [copied, setCopied] = useState(false);

  function copyToClipboard(text: string) {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  function downloadYAML() {
    downloadFile(GITHUB_ACTIONS_YAML, "build.yml", "text/yaml");
  }

  return (
    <div className="flex flex-col h-full pb-20">
      <div className="px-4 pt-10 pb-4 bg-[#060e08] border-b border-[#1e3d24]">
        <button onClick={() => navigate("home")} className="text-[#4a6b52] font-mono text-sm mb-3 block">← Home</button>
        <h1 className="text-2xl font-black text-white">Android Project</h1>
        <p className="text-[#4a6b52] font-mono text-xs mt-1">Native Android · Kotlin · Jetpack Compose · Room DB</p>

        <div className="flex gap-1.5 mt-4 overflow-x-auto pb-1">
          {(["structure", "github", "instructions"] as Tab[]).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`shrink-0 px-3 py-2 rounded-lg border font-mono text-xs font-bold uppercase tracking-widest transition-colors ${tab === t ? "bg-[#00d25b] border-[#00d25b] text-black" : "bg-[#0d1f11] border-[#1e3d24] text-[#4a6b52]"}`}
            >
              {t === "structure" ? "File Structure" : t === "github" ? "CI/CD YAML" : "Setup Guide"}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        {tab === "structure" && (
          <div className="px-4 py-4">
            <div className="flex items-center justify-between mb-2">
              <p className="text-[#4a6b52] font-mono text-xs uppercase tracking-widest">Android Project Structure</p>
              <button onClick={() => copyToClipboard(PROJECT_STRUCTURE)} className="text-[#00d25b] font-mono text-xs">
                {copied ? "Copied!" : "Copy"}
              </button>
            </div>
            <pre className="bg-[#0d1f11] border border-[#1e3d24] rounded-xl p-4 font-mono text-xs text-[#7ab587] overflow-x-auto leading-relaxed whitespace-pre">
              {PROJECT_STRUCTURE}
            </pre>

            <div className="mt-4 bg-[#0d1f11] border border-[#1e3d24] rounded-xl p-4">
              <h3 className="text-white font-bold text-sm mb-3">Key Technology Stack</h3>
              <div className="space-y-2">
                {[
                  { name: "Kotlin", desc: "Primary language" },
                  { name: "Jetpack Compose", desc: "Declarative UI framework" },
                  { name: "Material 3", desc: "Design system & components" },
                  { name: "Room Database", desc: "SQLite ORM — ball-by-ball storage" },
                  { name: "Hilt / Koin", desc: "Dependency injection" },
                  { name: "Navigation Compose", desc: "Screen routing" },
                  { name: "ViewModel + Flow", desc: "Reactive state management" },
                  { name: "WorkManager", desc: "Background recalculation" },
                  { name: "DataStore", desc: "Settings persistence" },
                  { name: "iText / PdfDocument", desc: "PDF scorecard export" },
                ].map((item) => (
                  <div key={item.name} className="flex items-center justify-between">
                    <span className="text-[#00d25b] font-mono text-sm font-bold">{item.name}</span>
                    <span className="text-[#4a6b52] font-mono text-xs">{item.desc}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {tab === "github" && (
          <div className="px-4 py-4">
            <div className="flex items-center justify-between mb-2">
              <div>
                <p className="text-[#4a6b52] font-mono text-xs uppercase tracking-widest">.github/workflows/build.yml</p>
                <p className="text-[#4a6b52] font-mono text-[10px] mt-0.5">Auto-builds debug + release APK on every push</p>
              </div>
              <div className="flex gap-2">
                <button onClick={() => copyToClipboard(GITHUB_ACTIONS_YAML)} className="text-[#00d25b] font-mono text-xs border border-[#00d25b]/30 rounded-lg px-2 py-1">
                  {copied ? "✓ Copied" : "Copy"}
                </button>
                <button onClick={downloadYAML} className="text-[#f5c842] font-mono text-xs border border-[#f5c842]/30 rounded-lg px-2 py-1">
                  Download
                </button>
              </div>
            </div>
            <pre className="bg-[#0d1f11] border border-[#1e3d24] rounded-xl p-4 font-mono text-[11px] text-[#7ab587] overflow-x-auto leading-relaxed whitespace-pre">
              {GITHUB_ACTIONS_YAML}
            </pre>

            <div className="mt-4 bg-[#0d1f11] border border-[#1e3d24] rounded-xl p-4 space-y-2">
              <h3 className="text-white font-bold text-sm">What this workflow does:</h3>
              <ul className="text-[#4a6b52] font-mono text-xs space-y-1.5">
                <li>• <span className="text-white">Triggers</span> on push to main, any tag (v*), PRs, manual</li>
                <li>• <span className="text-white">Sets up</span> JDK 17 + Gradle cache for fast builds</li>
                <li>• <span className="text-white">Builds</span> debug APK — available as artifact immediately</li>
                <li>• <span className="text-white">Builds</span> unsigned release APK</li>
                <li>• <span className="text-white">Signs</span> release APK when pushing a version tag (v1.0.0)</li>
                <li>• <span className="text-white">Creates</span> GitHub Release with signed APK attached</li>
              </ul>
            </div>
          </div>
        )}

        {tab === "instructions" && (
          <div className="px-4 py-4">
            <div className="bg-[#0d1f11] border border-[#1e3d24] rounded-xl p-4 mb-3">
              <div className="flex items-center gap-2 mb-2">
                <span className="w-2 h-2 rounded-full bg-[#00d25b]" />
                <span className="text-[#00d25b] font-mono text-xs uppercase tracking-widest">Step-by-step guide</span>
              </div>
              <p className="text-[#4a6b52] font-mono text-xs">Follow these steps to create the native Android app and get your APK via GitHub Actions CI/CD.</p>
            </div>
            <pre className="bg-[#0d1f11] border border-[#1e3d24] rounded-xl p-4 font-mono text-[11px] text-[#7ab587] overflow-x-auto leading-relaxed whitespace-pre-wrap">
              {SETUP_INSTRUCTIONS}
            </pre>

            <div className="mt-4 bg-[#f5c842]/10 border border-[#f5c842]/30 rounded-xl p-4">
              <h3 className="text-[#f5c842] font-bold text-sm mb-2">Note: This Web App</h3>
              <p className="text-[#4a6b52] font-mono text-xs leading-relaxed">
                This is a fully functional PWA (Progressive Web App) implementation of CricketScore Pro, built with React + IndexedDB. It runs entirely offline in your browser with all scoring features. The Android guide above shows how to build the native Kotlin version with Room DB.
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
