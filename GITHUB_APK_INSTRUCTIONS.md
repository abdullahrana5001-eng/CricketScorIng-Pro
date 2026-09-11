# CricketScore Pro — GitHub APK Build

This repository is configured to build the Android APK online using GitHub Actions.
No Android Studio, Node.js, Java, or Git installation is required on your PC.

## Browser-only setup

1. Create a GitHub repository named `CricketScore-Pro`.
2. Upload all files from this project to the repository.
3. Open **Actions**.
4. Select **Build CricketScore Pro APK**.
5. Click **Run workflow** (or push to `main` to trigger it automatically).
6. When the workflow finishes, open the successful run.
7. Under **Artifacts**, download `CricketScore-Pro-APK`.
8. Extract the downloaded ZIP to get `CricketScore-Pro.apk`.

## Important

This workflow produces a debug APK suitable for direct installation/testing and free distribution.
For a Google Play Store release, a signed release build and Play App Signing setup are recommended.

The app is intended to remain offline for scoring and local data storage.
