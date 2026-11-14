import chalk from "chalk";

type Tone = "dark" | "light";

interface Palette {
  text: string;
  textMuted: string;
  /** Filets et séparateurs : décoratifs, jamais porteurs d'information seuls. */
  border: string;
  accent: string;
  ai: string;
  info: string;
  success: string;
  warning: string;
  danger: string;
}

// Une seule couleur d'accent. Contrastes mesurés (WCAG 2) : au moins 4.5:1 sur #1e1e1e (sombre) et #ffffff (clair).
const PALETTES: Record<Tone, Palette> = {
  dark: {
    text: "#c0caf5",
    textMuted: "#8b93a7",
    border: "#3b4261",
    accent: "#7aa2f7",
    ai: "#7aa2f7",
    info: "#8b93a7",
    success: "#9ece6a",
    warning: "#e0af68",
    danger: "#f7768e",
  },
  light: {
    text: "#1f2335",
    textMuted: "#5a6170",
    border: "#c8cdda",
    accent: "#2f5bd3",
    ai: "#2f5bd3",
    info: "#5a6170",
    success: "#2f7d32",
    warning: "#8a5a00",
    danger: "#c62839",
  },
};

/** Devine le fond du terminal : NXTUPDATE_THEME, puis COLORFGBG (iTerm2, rxvt), sinon sombre. */
export function detectTone(env: NodeJS.ProcessEnv = process.env): Tone {
  const forced = env.NXTUPDATE_THEME?.toLowerCase();
  if (forced === "light" || forced === "dark") return forced;
  const background = Number(env.COLORFGBG?.split(";").at(-1));
  if (Number.isInteger(background) && (background === 7 || background === 15)) return "light";
  return "dark";
}

export const tone: Tone = detectTone();
export const colors: Palette = PALETTES[tone];

export type IconSet = "emoji" | "nerd" | "ascii";

interface Glyphs {
  managers: Record<string, string>;
  ok: string;
  fail: string;
  pending: string;
  running: string;
  warn: string;
  skip: string;
  arrow: string;
  pointer: string;
  checked: string;
  unchecked: string;
  partial: string;
  expanded: string;
  collapsed: string;
  update: string;
  uninstall: string;
  list: string;
  app: string;
  quit: string;
}

const SHARED = {
  ok: "✔", fail: "✖", pending: "○", running: "◐", warn: "▲", skip: "◌", arrow: "→", pointer: "›",
  checked: "◉", unchecked: "○", partial: "◎", expanded: "▾", collapsed: "▸",
};

const GLYPHS: Record<IconSet, Glyphs> = {
  emoji: {
    ...SHARED,
    managers: { ai: "✦", brew: "🍺", node: "📦", pip3: "🐍", cargo: "🦀", softwareupdate: "🍎" },
    update: "↑", uninstall: "−", list: "≡", app: "◇", quit: "⏻",
  },
  nerd: {
    ...SHARED,
    managers: { ai: "\u{F06A9}", brew: "\u{F0FC}", node: "\u{E718}", pip3: "\u{E73C}", cargo: "\u{E7A8}", softwareupdate: "\u{F179}" },
    update: "\u{F0552}", uninstall: "\u{F0A7A}", list: "\u{F0279}", app: "\u{F0D7C}", quit: "\u{F0425}",
  },
  ascii: {
    managers: { ai: "AI", brew: "BR", node: "JS", pip3: "PY", cargo: "RS", softwareupdate: "OS" },
    ok: "v", fail: "x", pending: "o", running: "*", warn: "!", skip: "-", arrow: "->", pointer: ">",
    checked: "[x]", unchecked: "[ ]", partial: "[~]", expanded: "v", collapsed: ">",
    update: "^", uninstall: "-", list: "=", app: "#", quit: "q",
  },
};

let iconSet: IconSet = "emoji";

export function setIconSet(value: string | undefined): void {
  if (value === "nerd" || value === "ascii" || value === "emoji") iconSet = value;
}

export function glyphs(): Glyphs {
  return GLYPHS[iconSet];
}

export function managerIcon(manager: { command: string; icon: string }): string {
  return GLYPHS[iconSet].managers[manager.command] ?? manager.icon;
}

export function borderStyle(): "round" | "classic" {
  return iconSet === "ascii" ? "classic" : "round";
}

export function hexToRgb(hex: string): [number, number, number] {
  const value = Number.parseInt(hex.slice(1), 16);
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
}

/** Mélange deux couleurs hexadécimales ; sert aux fondus des animations. */
export function mixColor(from: string, to: string, ratio: number): string {
  const a = hexToRgb(from);
  const b = hexToRgb(to);
  const t = Math.max(0, Math.min(1, ratio));
  return `#${a.map((channel, i) => Math.round(channel + (b[i]! - channel) * t).toString(16).padStart(2, "0")).join("")}`;
}

export const paint = {
  muted: (text: string) => chalk.hex(colors.textMuted)(text),
  accent: (text: string) => chalk.hex(colors.accent)(text),
  ai: (text: string) => chalk.hex(colors.ai)(text),
  info: (text: string) => chalk.hex(colors.info)(text),
  success: (text: string) => chalk.hex(colors.success)(text),
  warning: (text: string) => chalk.hex(colors.warning)(text),
  danger: (text: string) => chalk.hex(colors.danger)(text),
};
