export type PackageKind = "npm" | "pypi" | "brew" | "cargo" | "softwareupdate";

const PATTERNS: Record<PackageKind, RegExp> = {
  npm: /^(?:@[a-z0-9][a-z0-9._~-]*\/)?[a-z0-9][a-z0-9._~-]*$/i,
  pypi: /^[A-Za-z0-9](?:[A-Za-z0-9._-]*[A-Za-z0-9])?(?:\[[A-Za-z0-9,._-]+\])?$/,
  brew: /^[A-Za-z0-9@+_.-]+(?:\/[A-Za-z0-9@+_.-]+){0,2}$/,
  cargo: /^[A-Za-z0-9_-]+$/,
  softwareupdate: /^[^\u0000-\u001F\u007F]+$/,
};

const MAX_LENGTH = 214;

export function isSafePackageName(kind: PackageKind, name: string): boolean {
  return name.length > 0
    && name.length <= MAX_LENGTH
    && !name.startsWith("-")
    && !name.includes("..")
    && PATTERNS[kind].test(name);
}

export class UnsafePackageNameError extends Error {
  constructor(kind: PackageKind, names: string[]) {
    super(`Refusing unsafe ${kind} package name(s): ${names.map((name) => JSON.stringify(name)).join(", ")}`);
  }
}

/** Bloque un nom qui serait lu comme une option par l'outil appelé (argument injection). */
export function assertSafePackageNames(kind: PackageKind, names: string[]): void {
  const unsafe = names.filter((name) => !isSafePackageName(kind, name));
  if (unsafe.length > 0) throw new UnsafePackageNameError(kind, unsafe);
}

const VERSION_PATTERN = /^v?\d+(?:\.\d+){0,3}(?:[-+][0-9A-Za-z.-]{1,64})?$/;

export function isSafeVersion(value: string): boolean {
  return value.length <= 80 && VERSION_PATTERN.test(value);
}

const VERSION_IN_TEXT = /v?(\d+(?:\.\d+){1,3}(?:-[0-9A-Za-z]+(?:\.[0-9A-Za-z]+)*)?)/;

export function extractVersion(text: string): string | null {
  const match = text.match(VERSION_IN_TEXT);
  return match?.[1] && isSafeVersion(match[1]) ? match[1] : null;
}
