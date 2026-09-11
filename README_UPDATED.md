# CricketScore Pro — offline team & short-over update

This version adds:

- Match overs selector with quick presets: 4, 5, 6, 8, 10, 12, 15, 20, 25 and 50 overs.
- Custom overs input from 1–90.
- Selecting an over preset automatically switches the match to Limited overs / Custom format.
- Fully interactive touch-friendly match setup screens.
- Create Team directly during New Match.
- Enter Team Name, Short Name, and up to 11 player names in the same team-creation form.
- A team can be selected immediately for Team A or Team B after saving.
- Team/player data remains in the existing local Dexie/IndexedDB database; no login, Firebase, API or online scoring is added.
- Existing scoring/statistics screens remain connected to the same offline database.

## Important

The project is a Vite + React + TypeScript web project. It is not an Android Studio Gradle project yet. To turn this into a native Android APK, it needs an Android wrapper (for example Capacitor) or a native Android implementation.
