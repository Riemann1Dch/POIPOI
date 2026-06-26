# PoiPoi · AI Desktop Pet 🐱

**PoiPoi（派派）** is an AI-powered desktop pet powered by [Pi Agent](https://github.com/earendil-works/pi-coding-agent). It features a Live2D character with real-time emotion expression, an always-on-top transparent window docked to the right edge of your screen, and full AI conversation capabilities.

![PoiPoi](public/icon.png)

## Features ✨

- **Live2D Character** — Animated pet with 8 emotion expressions (smile, blush, sparkle eyes, sleepy, etc.)
- **AI Chat** — Full conversational AI via Pi RPC, with mood-aware expression switching
- **Smart Dock** — Slides into the right sidebar when not in focus; cat-ear tab stays visible
- **Dual Mode** — Chat mode + Background Task mode
- **Multiple Themes** — Starlight, Warm Tea, Aurora
- **System Tray** — Minimize to tray, right-click menu for quick actions
- **Drag & Dock** — Drag vertically along the right edge; auto-docks on blur
- **Tool Integration** — File operations, web search, document processing, and more through Pi's skill system

## Requirements 📋

- [Node.js](https://nodejs.org/) 18+
- [Pi Agent](https://github.com/earendil-works/pi-coding-agent) installed and available in PATH
- Windows 10/11 (Electron + transparent window support)

## Quick Start 🚀

```bash
# Clone the repo
git clone https://github.com/yourusername/poipoi.git
cd poipoi

# Install dependencies
npm install

# Start PoiPoi
npm start
```

Or simply double-click **`launcher.exe`** if you're on Windows.

## Usage 🎮

| Action | How |
|--------|-----|
| Launch | `npm start` or double-click `launcher.exe` |
| Open menu | Right-click the pet or tray icon |
| Dock/Undock | Click the cat-ear tab on the right edge |
| Drag | Hold and drag vertically (X position is fixed to the right edge) |
| Chat | Type messages in the chat bubble; emotions update automatically |
| Dev mode | `npm run dev` (opens DevTools) |
| Browser mode | `node server.js` then open http://localhost:3650 |

## Project Structure 📁

```
poipoi/
├── main.js              # Electron main process
├── server.js            # HTTP + SSE + Pi RPC bridge
├── renderer.js          # Live2D rendering + UI logic
├── preload.js           # Context bridge
├── index.html           # Main page
├── style.css            # Styles
├── launcher.cs          # C# launcher source (compiled to launcher.exe)
├── pet-zorder.cs        # C# Z-order utility source
├── public/
│   ├── icon.png         # App icon
│   ├── pet-icon.ico     # Multi-size ICO (16~256px)
│   └── model/           # Live2D model files
├── vendor/              # Third-party libs (Cubism, Pixi.js)
├── create-shortcut.ps1  # Create desktop shortcut
├── update-shortcut.ps1  # Update shortcut icon
├── verify-shortcut.ps1  # Verify shortcut status
└── restart.ps1          # Kill and restart the pet
```

## Architecture 🏗️

```
Pi Agent (AI engine + memory) ←→ RPC ←→ PoiPoi (Electron desktop UI)
```

PoiPoi connects to Pi Agent via its RPC mode. All AI processing, memory, and tool execution happens in Pi; PoiPoi handles the visual front-end only.

## Themes 🎨

Cycle through themes via the right-click menu:
- **Starlight** — Dark blue tones ✨
- **Warm Tea** — Warm orange/brown 🍵
- **Aurora** — Green/purple gradient 🌌

## License 📄

MIT
