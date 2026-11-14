import type { InstalledPackage, OutdatedPackage, PackageManager } from "./types.ts";
import { aiAgents } from "./ai-agents/index.ts";
import { homebrew } from "./homebrew.ts";
import { node } from "./node.ts";
import { python } from "./python.ts";
import { cargo } from "./cargo.ts";
import { macos } from "./macos.ts";
import { sanitizeLine } from "../utils/sanitize.ts";

export function getAllDetectors(): PackageManager[] {
  return [aiAgents, homebrew, node, python, cargo, macos];
}

export async function detectInstalled(): Promise<PackageManager[]> {
  const all = getAllDetectors();
  const checks = await Promise.allSettled(
    all.map(async (pm) => ({ pm, found: await pm.detect() }))
  );
  return checks.flatMap((result) =>
    result.status === "fulfilled" && result.value.found ? [result.value.pm] : []
  );
}

export function matchesManager(pm: PackageManager, query: string): boolean {
  const needle = query.trim().toLowerCase();
  if (!needle) return false;
  return pm.command.toLowerCase() === needle
    || pm.category === needle
    || pm.name.toLowerCase().includes(needle);
}

export function findByName(name: string): PackageManager | undefined {
  return getAllDetectors().find((pm) => matchesManager(pm, name));
}

const CLAIM_KEYS: Record<string, string> = { homebrew: "Homebrew", node: "Node" };

function claimedNames(managers: PackageManager[]): Map<string, Set<string>> {
  const claimed = new Map<string, Set<string>>();
  for (const manager of managers) {
    for (const claim of manager.claimed?.() ?? []) {
      const key = CLAIM_KEYS[claim.manager]!;
      if (!claimed.has(key)) claimed.set(key, new Set());
      claimed.get(key)!.add(claim.name);
    }
  }
  return claimed;
}

function isClaimed(claimed: Map<string, Set<string>>, manager: PackageManager, name: string): boolean {
  for (const [prefix, names] of claimed) {
    if (manager.name.startsWith(prefix) && names.has(name)) return true;
  }
  return false;
}

function cleanOutdated(pkg: OutdatedPackage): OutdatedPackage {
  return {
    ...pkg,
    name: sanitizeLine(pkg.name, 200),
    current: sanitizeLine(pkg.current ?? "?", 80) || "?",
    latest: sanitizeLine(pkg.latest ?? "?", 80) || "?",
    path: pkg.path ? sanitizeLine(pkg.path, 1000) : pkg.path,
  };
}

export interface ScanResult<T> {
  manager: PackageManager;
  items: T[];
  error?: string;
}

/**
 * Interroge les gestionnaires en parallèle, nettoie les données affichées
 * et retire ce qu'un autre gestionnaire (les agents IA) prend déjà en charge.
 */
async function scan<T extends { name: string }>(
  managers: PackageManager[],
  read: (manager: PackageManager) => Promise<T[]>,
  clean: (item: T) => T,
  onProgress?: () => void,
): Promise<ScanResult<T>[]> {
  const results = await Promise.all(managers.map(async (manager): Promise<ScanResult<T>> => {
    try {
      return { manager, items: (await read(manager)).map(clean) };
    } catch (error) {
      return { manager, items: [], error: sanitizeLine(String(error)) };
    } finally {
      onProgress?.();
    }
  }));

  const claimed = claimedNames(managers);
  return results.map((result) => ({
    ...result,
    items: result.items.filter((item) => !isClaimed(claimed, result.manager, item.name)),
  }));
}

export function scanOutdated(managers: PackageManager[], onProgress?: () => void) {
  return scan(managers, (manager) => manager.listOutdated(), cleanOutdated, onProgress);
}

export function scanInstalled(managers: PackageManager[], onProgress?: () => void) {
  return scan<InstalledPackage>(
    managers,
    (manager) => manager.listInstalled(),
    (pkg) => ({
      ...pkg,
      name: sanitizeLine(pkg.name, 200),
      version: sanitizeLine(pkg.version ?? "?", 80) || "?",
      blocked: pkg.blocked ? sanitizeLine(pkg.blocked, 300) : undefined,
      detail: pkg.detail ? sanitizeLine(pkg.detail, 300) : undefined,
    }),
    onProgress,
  );
}

export { aiAgents, homebrew, node, python, cargo, macos };
