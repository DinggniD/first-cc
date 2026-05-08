# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
# Development (hot-reload)
cd pomodoro && npm run tauri dev

# Build release DMG
cd pomodoro && npm run tauri build

# Frontend only (browser dev)
cd pomodoro && npm run dev

# TypeScript check
cd pomodoro && npx tsc --noEmit

# Rust check
cd pomodoro/src-tauri && cargo check
```

## Project Structure

```
first-cc/                        # Monorepo root
├── pomodoro/                    # Tauri 2.0 desktop app
│   ├── src/                     # React frontend
│   │   ├── App.tsx              # Main component (timer logic + UI)
│   │   ├── main.tsx             # React entry point
│   │   └── index.css            # Tailwind CSS v4 + glass styles
│   ├── src-tauri/               # Rust backend
│   │   ├── src/lib.rs           # Tauri setup (tray, notifications, window)
│   │   ├── src/main.rs          # Rust binary entry
│   │   ├── tauri.conf.json      # Window config (borderless, transparent, vibrancy)
│   │   ├── capabilities/        # Tauri 2.0 permission capabilities
│   │   └── Cargo.toml           # Rust deps (tray-icon, macos-private-api, notification)
│   ├── package.json             # Node deps (React, Tailwind, Tauri CLI)
│   └── vite.config.ts           # Vite + React + Tailwind CSS v4
├── pomodoro.py                  # Python/tkinter prototype (legacy)
└── *.md                         # Chinese requirement docs
```

## Architecture

### Tauri 2.0 Desktop App

**Frontend** (React 19 + TypeScript + Tailwind CSS v4):
- Single component `App.tsx` manages all state
- Timer state machine: `idle → running → paused → running → idle`
- Timer types: `focus` (25m) → `short_break` (5m) → `long_break` (15m after 4 pomodoros)
- SVG circular progress ring using `stroke-dasharray`/`stroke-dashoffset`
- Ref-based stale-closure avoidance pattern for timer callbacks

**Backend** (Rust / Tauri 2.11):
- `lib.rs` — window setup, system tray (Show/Quit menu), notification plugin
- `tauri.conf.json` — borderless window, `NSVisualEffectView` vibrancy (`WindowBackground`), transparent background

**Key Tauri Permissions** (capabilities/default.json):
- `core:window:allow-set-always-on-top` — pin button
- `notification:default` — macOS native notifications
- `tray-icon` Cargo feature for system tray

### macOS Specifics
- `decorations: false` + `transparent: true` for borderless frosted glass
- `NSVisualEffectView` configured via `windowEffects` in tauri.conf.json
- CSS class `drag-region` / `no-drag` for custom title bar dragging
- `macos-private-api` Cargo feature + `macOSPrivateApi: true` for transparency

### State Flow
```
User presses Start → appState = "running" → interval decrements timeRemaining
  → timeRemaining hits 0 → handleComplete:
      appState = "idle", notify + beep
      if focus: cycleCount++, switchTo(short_break) or switchTo(long_break) at 4
      if break:  switchTo(focus)
User presses Pause → clearInterval, appState = "paused"
User presses Reset → appState = "idle", timeRemaining = full duration
```

## Key Patterns
- **No testing setup** — project is experimental/learning
- **No routing** — single-page, no router needed
- **Tailwind CSS v4** — uses `@tailwindcss/vite` plugin, no PostCSS config
- **Notification fallback** — Tauri plugin first, Web Notification API as fallback
- **Sound** — Web Audio API (AudioContext singleton, two-tone beep)
