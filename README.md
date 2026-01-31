# 🎬 Absolute Cinema

A desktop application for watching movies in sync with friends. Create rooms, invite friends, and enjoy synchronized movie watching from anywhere!

## Features

- **🔐 User Authentication**: Create accounts and login to access rooms
- **🎭 Room Management**: Create public or private rooms with movie assignments
- **🎥 Synchronized Playback**: Real-time play, pause, and seek synchronization
- **👥 User Presence**: See who's in the room and their ready status
- **📁 Local File Playback**: Use your own local movie files
- **🔒 Admin Controls**: Only room admins can control playback

## Tech Stack

- **Frontend**: React + TypeScript
- **Desktop Framework**: Tauri v2 (Rust backend)
- **Database**: Convex (real-time backend)
- **Video Player**: Plyr
- **Styling**: Custom CSS with modern design tokens

## Prerequisites

Before getting started, make sure you have installed:

1. **Node.js** (v18 or later)
2. **Rust** (latest stable)
3. **Tauri CLI** (`npm install -g @tauri-apps/cli`)

## Getting Started

### 1. Clone the repository

```bash
cd "Absolute Cinema"
```

### 2. Install dependencies

```bash
npm install
```

### 3. Set up Convex

Create a Convex account at [convex.dev](https://convex.dev) if you haven't already.

```bash
# This will prompt you to log in and create/connect a Convex project
npx convex dev
```

This will:
- Create a `.env.local` file with your Convex deployment URL
- Generate the TypeScript types in `convex/_generated/`
- Start the Convex development server

### 4. Run the development server

In a new terminal (keep Convex running):

```bash
npm run tauri dev
```

This will start both the Vite frontend dev server and the Tauri desktop app.

## Project Structure

```
absolute-cinema/
├── src/                          # React frontend
│   ├── components/               # Reusable UI components
│   │   ├── Header.tsx
│   │   └── CreateRoomModal.tsx
│   ├── context/                  # React contexts
│   │   └── AuthContext.tsx
│   ├── pages/                    # Page components
│   │   ├── HomePage.tsx
│   │   ├── LoginPage.tsx
│   │   ├── RegisterPage.tsx
│   │   └── RoomPage.tsx
│   ├── types/                    # TypeScript type definitions
│   │   └── index.ts
│   ├── App.tsx                   # Main app with routing
│   ├── main.tsx                  # Entry point
│   └── index.css                 # Global styles
├── convex/                       # Convex backend functions
│   ├── _generated/               # Auto-generated types
│   ├── schema.ts                 # Database schema
│   ├── users.ts                  # User authentication
│   ├── rooms.ts                  # Room management
│   ├── roomMembers.ts            # Room membership
│   └── sync.ts                   # Playback synchronization
├── src-tauri/                    # Tauri (Rust) backend
│   ├── src/
│   │   └── lib.rs                # Tauri setup
│   ├── capabilities/
│   │   └── default.json          # App permissions
│   ├── Cargo.toml                # Rust dependencies
│   └── tauri.conf.json           # Tauri configuration
├── index.html                    # HTML template
├── package.json
└── README.md
```

## How It Works

### Room Flow

1. **Create a Room**: Admin creates a room and assigns a movie (by title and filename)
2. **Join Room**: Users join the room and are prompted to select their local copy of the movie
3. **File Validation**: The app validates that the selected file matches the expected filename
4. **Watch Together**: Once everyone is ready, the admin controls playback for everyone

### Synchronization

- The room admin is the "source of truth" for playback state
- When the admin plays, pauses, or seeks, the action is sent to Convex
- All other viewers subscribe to the sync state and apply changes locally
- A 1.5-second drift threshold prevents unnecessary seeking

### Architecture

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│   User A (Admin)│     │     Convex      │     │   User B        │
│   ┌─────────┐   │     │   ┌─────────┐   │     │   ┌─────────┐   │
│   │  Plyr   │───┼────▶│   │ syncState│◀──┼─────│   │  Plyr   │   │
│   │ Player  │   │     │   │ (realtime)│   │     │   │ Player  │   │
│   └─────────┘   │     │   └─────────┘   │     │   └─────────┘   │
│                 │     │                 │     │                 │
│   Local Movie   │     │   Convex DB     │     │   Local Movie   │
│   File (MP4)    │     │                 │     │   File (MP4)    │
└─────────────────┘     └─────────────────┘     └─────────────────┘
```

## Building for Production

```bash
npm run tauri build
```

This creates an installer for your platform in `src-tauri/target/release/bundle/`.

## Environment Variables

Create a `.env` file based on `.env.example`:

```env
VITE_CONVEX_URL=https://your-deployment.convex.cloud
```

The Convex URL is automatically set when you run `npx convex dev`.

## Troubleshooting

### "Cannot find module 'convex/_generated/api'"

Run `npx convex dev` to generate the TypeScript types.

### Video file doesn't play

Make sure:
1. The file format is supported (MP4, WebM, MKV, AVI, MOV)
2. The video codecs are compatible with your system
3. Tauri has permission to access the file location

### Sync is off

- Check that you're connected to the internet
- The admin's playback state is the source of truth
- There's a 1.5 second threshold for seeking

## Contributing

1. Fork the repository
2. Create a feature branch
3. Commit your changes
4. Push to the branch
5. Open a Pull Request

## License

MIT License - feel free to use this project for your own purposes!

## Acknowledgments

- [Tauri](https://tauri.app/) - Desktop framework
- [Convex](https://convex.dev/) - Real-time backend
- [Plyr](https://plyr.io/) - Video player
- [React](https://reactjs.org/) - UI framework
