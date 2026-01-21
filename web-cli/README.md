## Mesh Terminal

A modern, keyboard-driven CLI interface for peer-to-peer communication. Each visitor receives a unique UID, can register a callsign, and create transient sessions by connecting to another operator's UID. The interface is rendered as a richly styled terminal with command parsing, keybindings, and an interactive manual.

### Core Features

- 🔐 **UID based pairing** — share your UID and run `connect <uid>` from both sides to form a channel.
- 💬 **Live terminal feed** — session transcript lives alongside a system log for command feedback.
- ⌨️ **Keybindings** — focus the prompt with `Ctrl+K`, clear logs with `Ctrl+L`, and launch the manual via `Shift+?`.
- 🧭 **Command-driven** — `help`, `sessions`, `switch`, `name`, and more to navigate multiple peers.
- 📚 **Built-in manual** — contextual documentation with shortcuts and quick start instructions.

### Commands

| Command | Action |
| --- | --- |
| `help` | Open the Mesh Operator Manual. |
| `name <alias>` | Update your callsign for future messages. |
| `connect <uid>` | Initiate a channel with another operator. |
| `sessions` | List all active sessions. |
| `switch <uid|index>` | Focus on a specific session. |
| `clear` | Clear the system log (session messages persist). |
| `uid` | Display your current UID. |
| `[text]` | When no command matches, send the text to the active session. |

### Keybindings

- `Ctrl + K` — focus the command prompt.
- `Ctrl + L` — clear the system log.
- `Shift + ?` — toggle the manual.
- `Esc` — dismiss overlays.

### Development

```bash
npm install
npm run dev
```

The project uses Next.js (App Router + TypeScript) with Tailwind for styling. API routes manage in-memory sessions and Server-Sent Events to deliver real-time updates.

### Production

Build and lint locally before deploying:

```bash
npm run lint
npm run build
```

Then deploy with Vercel (instructions assume `VERCEL_TOKEN` is available):

```bash
vercel deploy --prod --yes --token $VERCEL_TOKEN --name agentic-cfc665f1
```
