# WatchDat — TV Show Tracker & Air Date Companion (PWA)

A local-first Progressive Web App (PWA) inspired by **TV Time** for tracking TV shows watched, checking off episodes by season, and seeing live countdowns and calendar schedules for when the next episode of a show will air.

## Features

- **TV Time-Style "Watch Next" Queue**: Automatically surfaces the exact next unwatched aired episode (`S01E04`) for every active show you're watching with 1-tap episode check-offs.
- **Smart Watchlist Categories**:
  - **Watching**: Shows with aired episodes waiting for you to watch.
  - **Upcoming**: Shows you're 100% caught up on that are still running or have upcoming episodes scheduled.
  - **Watch Later**: Shows bookmarked to start later.
  - **Completed**: Ended series where you've watched every episode.
- **Upcoming Air Dates & Calendar**:
  - Chronological **Countdown List** (`Airing Today`, `Airing Tomorrow`, `Next 7 Days`, `Coming Later`) + `Returning Series (TBA)`.
  - Interactive **Monthly Air Date Calendar** showing every episode airing on each day of the month.
- **Season & Episode Progress**:
  - Mark individual episodes watched/unwatched.
  - Prompt to **"Mark previous episodes watched"** when jumping ahead to a later episode.
  - 1-click **"Mark Season Watched"** or **"Mark all aired watched"**.
- **Profile & Viewing Stats**:
  - Iconic **TV Time Clock** (`Months • Days • Hours • Minutes` spent watching TV).
  - Top Genres breakdown, Most Watched Series leaderboard, and Recent Episode Check-ins log.
- **Offline-Ready PWA**:
  - Powered by `vite-plugin-pwa` with runtime caching for TVMaze API schedules & poster artwork, plus local IndexedDB storage and JSON backup export/import.

## Getting Started

```bash
npm install
npm run dev
```

To build the production PWA with Service Worker & Web App Manifest:

```bash
npm run build
npm run preview
```
