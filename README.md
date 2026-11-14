# ⬆️ NxtUpdate

> Universal updater for macOS: AI agent CLIs, package managers and the system, from one command.

[![npm version](https://img.shields.io/npm/v/nxtupdate)](https://www.npmjs.com/package/nxtupdate)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://github.com/The0px/NxtUpdate/blob/main/LICENSE)
[![Requires Bun](https://img.shields.io/badge/runtime-bun-%23f9f1e1)](https://bun.sh)

NxtUpdate detects every package manager installed on your Mac and updates them all in one go — with an interactive TUI or simple CLI commands.

---

## Features

- **AI agents first** — detects Claude Code, Codex, Cursor CLI, Mistral Vibe, OpenCode, Copilot CLI and more, and updates each one the way it was installed
- **Interactive TUI** — full terminal UI to browse, select, and update packages, with mouse support
- **Auto-detection** — finds every package manager you have installed automatically
- **Selective updates** — choose which managers or packages to update
- **Dry-run mode** — preview what would change before touching anything
- **Uninstall support** — remove AI agent CLIs and packages from any manager via the TUI
- **macOS system updates** — includes `softwareupdate` (with sudo support)
- **Zero config** — just run `nxtupdate`

---

## AI Agent CLIs

AI agents get their own category, shown above every other manager. NxtUpdate resolves the real path of each binary to find how it was installed, then uses the matching official update path:

| Install method | Detected from | Update command |
|---|---|---|
| Native installer (curl) | vendor directory (`~/.local/share/claude`, `~/.grok`…) | the agent's own updater (`claude update`, `cursor-agent update`, `grok update`…) |
| Homebrew | `Caskroom/` or `Cellar/` | `brew upgrade [--cask] <name>` |
| npm / bun / pnpm / yarn | global `node_modules/` | `<pm> install -g <package>@latest` |
| uv / pipx | `uv/tools/` or `pipx/venvs/` | `uv tool upgrade <name>` / `pipx upgrade <name>` |

| Agent | Command | Latest version from |
|---|---|---|
| Claude Code | `claude` | npm `@anthropic-ai/claude-code` |
| OpenAI Codex | `codex` | npm `@openai/codex` |
| Gemini CLI | `gemini` | npm `@google/gemini-cli` |
| Mistral Vibe | `vibe` | PyPI `mistral-vibe` |
| Cursor CLI | `cursor-agent` | Cursor install manifest (read as text, never executed) |
| OpenCode | `opencode` | npm `@opencode/cli` |
| GitHub Copilot CLI | `copilot` | npm `@github/copilot` |
| Amp | `amp` | npm `@sourcegraph/amp` |
| Grok Build | `grok` | npm `@xai-official/grok` |
| Factory Droid | `droid` | npm `droid` |
| Goose | `goose` | GitHub releases |
| Qwen Code, Crush, Auggie, Cline, Kilo Code | `qwen`, `crush`, `auggie`, `cline`, `kilocode` | npm |
| Aider, Kimi CLI | `aider`, `kimi` | PyPI |
| Kiro CLI | `kiro-cli` | detected only (no documented updater) |

Safety rules:

- NxtUpdate never pipes a downloaded script into a shell; it only runs package managers or each vendor's own updater, by absolute path.
- A binary installed by a package manager is attributed to an agent only when the package name matches, so an unrelated `goose` or `droid` is left alone.
- An agent whose latest version or identity cannot be verified is listed but left unselected, and `nxtupdate update` skips it.
- A world-writable native binary is never executed.

Uninstall (TUI → **Uninstall**, AI agents listed first):

- Package-manager installs use that manager's own command (`npm uninstall -g`, `brew uninstall --cask`, `uv tool uninstall`, `pipx uninstall`…).
- Native installs are removed only when the vendor documents how: Claude Code removes `~/.local/bin/claude` and `~/.local/share/claude` (your `~/.claude` settings stay), OpenCode runs `opencode uninstall --force --keep-config --keep-data`.
- Other native installs (Cursor, Copilot, Amp, Grok, Droid, Goose, Kiro…) are shown but cannot be selected: remove them with the vendor's instructions.
- Removal paths must resolve inside your home folder and contain the detected binary; symlinked folders are never followed. The confirmation screen shows the exact command or paths, and `--dry-run` changes nothing.

## Supported Package Managers

| Manager | Icon | Command | Notes |
|---|---|---|---|
| Homebrew | 🍺 | `brew` | Formulae + Casks |
| Node.js | 📦 | `npm` / `pnpm` / `yarn` / `bun` | Auto-selects active PM |
| Python | 🐍 | `pip3` / `pip` | Skips virtualenvs and externally managed environments |
| Rust / Cargo | 🦀 | `cargo` | Requires `cargo-install-update` |
| macOS System | 🍎 | `softwareupdate` | Runs with sudo |

---

## Requirements

- **macOS** (this tool is macOS-only)
- **[Bun](https://bun.sh) ≥ 1.0.0** — used as the runtime

Install Bun if you don't have it:

```sh
curl -fsSL https://bun.sh/install | bash
```

---

## Installation

```sh
# Via npm (global)
npm install -g nxtupdate

# Via bun (global)
bun add -g nxtupdate
```

---

## Usage

### Interactive TUI (default)

```sh
nxtupdate
```

Launches a full-screen terminal UI. Use arrow keys (or `j`/`k`, `PgUp`/`PgDn`, `g`/`G`) to navigate, `Enter` to confirm, `Ctrl+C` to quit. Hover moves the focus and a click selects: menu entries, packages, group headers and key hints all respond to the mouse, and the wheel scrolls lists. Pass `--no-mouse` to keep your terminal's native text selection.

**TUI screens:**
- **Scan** — detects managers and checks for outdated packages
- **Main Menu** — choose to update, list packages, or uninstall
- **Select Packages** — pick exactly which packages to update or remove
- **Update** — live progress for each manager

### CLI Commands

```sh
# Detect all installed package managers
nxtupdate scan

# List outdated packages across all managers
nxtupdate list

# Update everything
nxtupdate update

# Update only the AI agent CLIs
nxtupdate update --only ai

# Update only one manager
nxtupdate update --only homebrew
nxtupdate update --only node

# Launch TUI explicitly
nxtupdate tui
```

### Options

| Flag | Description |
|---|---|
| `--only <manager>` | Target one manager: `ai`, `brew`, `node`, `pip3`, `cargo`, `softwareupdate` |
| `-d, --dry-run` | Show what would be updated, make no changes |
| `--no-sudo` | Skip updates that require sudo (macOS system) |
| `-v, --verbose` | Show live updater output |
| `-y, --yes` | Skip all confirmation prompts |
| `--no-mouse` | Disable mouse support in the TUI |
| `--no-animation` | Disable TUI animations (also `NXTUPDATE_REDUCED_MOTION=1`) |
| `--icons <set>` | `emoji` (default), `nerd` for [Nerd Font](https://www.nerdfonts.com) glyphs, or `ascii` |

### Appearance

The TUI uses a quiet truecolor palette with a single accent colour, and short animations (list reveal, progress, focus) that turn off with `--no-animation` or `NXTUPDATE_REDUCED_MOTION=1`. Set `NXTUPDATE_THEME=light` for a light background (iTerm2 is detected automatically through `COLORFGBG`) and `NXTUPDATE_ICONS=nerd` if your terminal font is a Nerd Font.

---

## Rust / Cargo Notes

Cargo does not natively support listing outdated packages. NxtUpdate uses [`cargo-install-update`](https://github.com/nabijaczleweli/cargo-update) for this. Install it once:

```sh
cargo install cargo-install-update
```

---

## Repository

[https://github.com/The0px/NxtUpdate](https://github.com/The0px/NxtUpdate)

---

## License

MIT © [scorpion7slayer](https://github.com/scorpion7slayer)
