# Absolute Cinema

A Tauri desktop application for synchronized movie watching with friends in real-time.

## Tech Stack

- **Frontend**: React 19 + TypeScript 5.8 + Vite 7
- **Backend**: Convex (real-time database/backend)
- **Desktop**: Tauri 2 (Rust)
- **Video**: Plyr player, FFmpeg/FFprobe for codec handling
- **API**: TMDB for movie metadata

## Project Structure

```
src/                    # React frontend
  components/           # UI components (VideoPlayer, modals, etc.)
  pages/                # HomePage, RoomPage, LoginPage, RegisterPage
  context/              # AuthContext (token-based auth)
  lib/                  # Utilities (tmdb.ts, subtitleUtils.ts)
  types/                # TypeScript type definitions
convex/                 # Convex backend (schema, mutations, queries)
src-tauri/              # Tauri/Rust backend (media processing commands)
```

## Commands

```bash
npm run dev             # Vite dev server only
npm run tauri dev       # Full Tauri app in dev mode
npx convex dev          # Convex backend (run separately)
npm run build           # Build frontend
npm run tauri build     # Production build (creates installer)
npm run typecheck       # TypeScript type checking
```

## Environment

- `VITE_CONVEX_URL` - Convex deployment URL (set by `npx convex dev`)
- TMDB API key is in `src/lib/tmdb.ts`

## Key Patterns

- **Auth**: Token-based sessions stored in Convex, tokens in localStorage, `useAuth()` hook
- **Data**: Convex hooks (`useQuery`, `useMutation`, `useAction`) for all data operations
- **Sync**: Real-time playback sync via Convex subscriptions, 1.5s drift threshold, admin as source of truth
- **Tauri commands**: Rust `#[tauri::command]` functions invoked from React via `invoke()`
- **Components**: Modal-based UI interactions, forwarded refs for VideoPlayer

## Conventions

- Components: PascalCase filenames matching component name
- Constants: UPPER_SNAKE_CASE
- Event handlers: `on` + Action (onPlay, onPause)
- Strict TypeScript enabled
- Convex types auto-generated in `convex/_generated/`

## Database (Convex)

Tables: `users`, `rooms`, `roomMembers`, `syncState`, `sessions`, `watchLogs`, `subtitles`

Schema defined in `convex/schema.ts`.

## Dev Server Ports

- Vite: 1420
- HMR: 1421
