import type { LatestSource } from "./catalog.ts";
import type { InstallMethod } from "./install-method.ts";
import { exec } from "../../utils/exec.ts";
import { VERSION } from "../../utils/version.ts";
import { extractVersion, isSafePackageName, isSafeVersion } from "../../utils/validate.ts";

const FETCH_TIMEOUT = 5_000;
const MAX_BODY = 8 * 1024 * 1024;

async function fetchText(url: string, accept = "application/json"): Promise<string | null> {
  try {
    const response = await fetch(url, {
      signal: AbortSignal.timeout(FETCH_TIMEOUT),
      redirect: "follow",
      headers: { "User-Agent": `nxtupdate/${VERSION}`, Accept: accept },
    });
    if (!response.ok) return null;
    const length = Number(response.headers.get("content-length") ?? 0);
    if (length > MAX_BODY) return null;
    const text = await response.text();
    return text.length > MAX_BODY ? null : text;
  } catch {
    return null;
  }
}

async function fetchJson<T>(url: string): Promise<T | null> {
  const text = await fetchText(url);
  if (!text) return null;
  try {
    return JSON.parse(text) as T;
  } catch {
    return null;
  }
}

function safe(version: unknown): string | null {
  if (typeof version !== "string") return null;
  const trimmed = version.trim().replace(/^v/, "");
  return isSafeVersion(trimmed) ? trimmed : null;
}

export async function npmLatest(name: string): Promise<string | null> {
  if (!isSafePackageName("npm", name)) return null;
  const encoded = name.startsWith("@") ? `@${encodeURIComponent(name.slice(1))}` : encodeURIComponent(name);
  const data = await fetchJson<{ version?: unknown }>(`https://registry.npmjs.org/${encoded}/latest`);
  return safe(data?.version);
}

export async function pypiLatest(name: string): Promise<string | null> {
  if (!isSafePackageName("pypi", name)) return null;
  const data = await fetchJson<{ info?: { version?: unknown } }>(`https://pypi.org/pypi/${encodeURIComponent(name)}/json`);
  return safe(data?.info?.version);
}

async function githubLatest(repo: string): Promise<string | null> {
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repo)) return null;
  const data = await fetchJson<{ tag_name?: unknown }>(`https://api.github.com/repos/${repo}/releases/latest`);
  return typeof data?.tag_name === "string" ? extractVersion(data.tag_name) : null;
}

const CURSOR_BUILD = /downloads\.cursor\.com\/lab\/(\d{4}\.\d{2}\.\d{2}-[0-9a-f]{6,40})\//;

/** Lit la version publiée dans le script d'installation de Cursor, comme du texte : il n'est jamais exécuté. */
export async function cursorLatest(): Promise<string | null> {
  const script = await fetchText("https://cursor.com/install", "text/plain");
  return script?.match(CURSOR_BUILD)?.[1] ?? null;
}

async function brewLatest(name: string, cask: boolean): Promise<string | null> {
  if (!isSafePackageName("brew", name)) return null;
  const result = await exec(["brew", "info", "--json=v2", cask ? "--cask" : "--formula", name], { timeout: 30_000 });
  if (result.exitCode !== 0) return null;
  try {
    const data = JSON.parse(result.stdout) as {
      formulae?: { versions?: { stable?: unknown } }[];
      casks?: { version?: unknown }[];
    };
    const raw = cask ? data.casks?.[0]?.version : data.formulae?.[0]?.versions?.stable;
    return typeof raw === "string" ? extractVersion(raw.split(",")[0] ?? "") : null;
  } catch {
    return null;
  }
}

export async function fetchLatestVersion(method: InstallMethod, source?: LatestSource): Promise<string | null> {
  switch (method.kind) {
    case "brew-cask": return brewLatest(method.name, true);
    case "brew-formula": return brewLatest(method.name, false);
    case "npm":
    case "bun":
    case "pnpm":
    case "yarn": return npmLatest(method.name);
    case "uv":
    case "pipx": return pypiLatest(method.name);
    case "native": break;
  }
  switch (source?.type) {
    case "npm": return npmLatest(source.package);
    case "pypi": return pypiLatest(source.package);
    case "github": return githubLatest(source.repo);
    case "cursor": return cursorLatest();
    default: return null;
  }
}
