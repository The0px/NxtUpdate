export type InstallMethod =
  | { kind: "brew-cask"; name: string }
  | { kind: "brew-formula"; name: string }
  | { kind: "npm" | "bun" | "pnpm" | "yarn"; name: string }
  | { kind: "uv"; name: string }
  | { kind: "pipx"; name: string }
  | { kind: "native" };

export const METHOD_LABEL: Record<InstallMethod["kind"], string> = {
  "brew-cask": "brew cask",
  "brew-formula": "brew",
  npm: "npm",
  bun: "bun",
  pnpm: "pnpm",
  yarn: "yarn",
  uv: "uv",
  pipx: "pipx",
  native: "native",
};

const SEGMENT = "[^/]+";

/** Déduit le gestionnaire qui a installé un binaire à partir de son chemin réel (symlinks résolus). */
export function resolveInstallMethod(realPath: string): InstallMethod {
  const path = realPath.replaceAll("\\", "/");

  // Une formule Homebrew peut embarquer un node_modules : Homebrew reste le propriétaire.
  const cask = path.match(new RegExp(`/Caskroom/(${SEGMENT})/`));
  if (cask?.[1]) return { kind: "brew-cask", name: cask[1] };
  const formula = path.match(new RegExp(`/Cellar/(${SEGMENT})/`));
  if (formula?.[1]) return { kind: "brew-formula", name: formula[1] };

  const uv = path.match(new RegExp(`/uv/tools/(${SEGMENT})/`));
  if (uv?.[1]) return { kind: "uv", name: uv[1] };
  const pipx = path.match(new RegExp(`/pipx/venvs/(${SEGMENT})/`));
  if (pipx?.[1]) return { kind: "pipx", name: pipx[1] };

  const modules = [...path.matchAll(new RegExp(`/node_modules/((?:@${SEGMENT}/)?${SEGMENT})`, "g"))];
  const pkg = modules.at(-1)?.[1];
  if (pkg) {
    if (path.includes("/.bun/install/global/")) return { kind: "bun", name: pkg };
    if (/\/pnpm\/|\/\.pnpm-global\//.test(path)) return { kind: "pnpm", name: pkg };
    if (/\/\.yarn\/|\/yarn\/global\//.test(path)) return { kind: "yarn", name: pkg };
    return { kind: "npm", name: pkg };
  }

  return { kind: "native" };
}
