const ANSI_OSC_PATTERN = /\u001B\][^\u0007\u001B]*(?:\u0007|\u001B\\)?/g;
const ANSI_CSI_PATTERN = /\u001B\[[0-?]*[ -/]*[@-~]/g;
const ANSI_SINGLE_PATTERN = /\u001B[@-Z\\-_]/g;
const CONTROL_PATTERN = /[\u0000-\u0008\u000B-\u001F\u007F-\u009F]/g;
const BIDI_PATTERN = /[‪-‮⁦-⁩]/g;

/**
 * Retire les séquences de terminal d'un texte venu d'un outil ou d'un registre
 * (une sortie piégée pourrait sinon déplacer le curseur ou réécrire l'écran).
 */
export function stripTerminalControls(value: string): string {
  return value
    .replace(ANSI_OSC_PATTERN, "")
    .replace(ANSI_CSI_PATTERN, "")
    .replace(ANSI_SINGLE_PATTERN, "")
    .replace(CONTROL_PATTERN, "")
    .replace(BIDI_PATTERN, "");
}

export function sanitizeLine(value: string, maxLength = 400): string {
  const clean = stripTerminalControls(value).replace(/\s+/g, " ").trim();
  return clean.length > maxLength ? `${clean.slice(0, maxLength - 1)}…` : clean;
}

export function sanitizeText(value: string | undefined, maxLength = 4000): string {
  if (!value) return "";
  const clean = stripTerminalControls(value.replace(/\r\n?/g, "\n")).trim();
  return clean.length > maxLength ? `${clean.slice(0, maxLength - 1)}…` : clean;
}
