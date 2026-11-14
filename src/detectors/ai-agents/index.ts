import { lstatSync, readFileSync, realpathSync, rmSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { basename, dirname, join, sep } from "node:path";
import type {
  ClaimedPackage,
  InstalledPackage,
  OutdatedPackage,
  PackageManager,
  ProgressReporter,
  UpdateResult,
} from "../types.ts";
import { exec } from "../../utils/exec.ts";
import { fetchLatestVersion } from "./latest.ts";
import { AGENTS, type AgentDefinition } from "./catalog.ts";
import { METHOD_LABEL, resolveInstallMethod, type InstallMethod } from "./install-method.ts";
import { isVersionNewer } from "../../utils/version.ts";
import { assertSafePackageNames, extractVersion, type PackageKind } from "../../utils/validate.ts";
import { sanitizeLine } from "../../utils/sanitize.ts";

export interface DetectedAgent {
  definition: AgentDefinition;
  /** Chemin trouvé dans le PATH, utilisé tel quel pour lancer l'updater officiel. */
  binPath: string;
  realPath: string;
  method: InstallMethod;
  current: string | null;
  /** Raison pour laquelle l'agent ne peut pas être mis à jour automatiquement. */
  blocked?: string;
  /** Problème à signaler qui n'empêche pas la mise à jour. */
  warning?: string;
  /** Binaire natif dont le chemin ne prouve pas l'identité : jamais coché par défaut. */
  unverified?: boolean;
}

const MANAGER_NAME = "AI agents";
const UPDATE_TIMEOUT = 600_000;

type Which = (bin: string) => string | null;

function findBinary(definition: AgentDefinition, which: Which): { binPath: string; realPath: string } | null {
  for (const bin of definition.bins) {
    const binPath = which(bin);
    if (!binPath) continue;
    let realPath: string;
    try {
      realPath = realpathSync(binPath);
    } catch {
      continue;
    }
    if (definition.pathHint && !definition.pathHint.test(realPath)) continue;
    return { binPath, realPath };
  }
  return null;
}

function isWorldWritable(path: string): boolean {
  try {
    return (statSync(path).mode & 0o002) !== 0;
  } catch {
    return true;
  }
}

function readPackageVersion(realPath: string, packageName: string): string | null {
  const marker = `/node_modules/${packageName}/`;
  const index = realPath.lastIndexOf(marker);
  if (index < 0) return null;
  const manifest = join(realPath.slice(0, index + marker.length), "package.json");
  try {
    const data = JSON.parse(readFileSync(manifest, "utf8")) as { version?: unknown };
    return typeof data.version === "string" ? extractVersion(data.version) : null;
  } catch {
    return null;
  }
}

/** Lit la version dans le chemin d'installation quand c'est possible, pour éviter de lancer le binaire. */
export function versionFromPath(realPath: string, method: InstallMethod): string | null {
  if (method.kind === "brew-cask" || method.kind === "brew-formula") {
    const root = method.kind === "brew-cask" ? "Caskroom" : "Cellar";
    const match = realPath.match(new RegExp(`/${root}/[^/]+/([^/]+)/`));
    return match?.[1] ? extractVersion(match[1]) : null;
  }
  if (method.kind === "npm" || method.kind === "bun" || method.kind === "pnpm" || method.kind === "yarn") {
    return readPackageVersion(realPath, method.name);
  }
  const versioned = realPath.match(/\/versions\/([^/]+)(?:\/|$)/);
  return versioned?.[1] ? extractVersion(versioned[1]) : null;
}

async function readVersion(binPath: string, realPath: string, method: InstallMethod): Promise<string | null> {
  const fromPath = versionFromPath(realPath, method);
  if (fromPath) return fromPath;
  if (isWorldWritable(realPath)) return null;
  try {
    const result = await exec([binPath, "--version"], { timeout: 10_000 });
    return extractVersion(`${result.stdout}\n${result.stderr}`);
  } catch {
    return null;
  }
}

// Seule une installation native exécute le binaire détecté : c'est là qu'un fichier modifiable par tous est dangereux.
function blockedReason(definition: AgentDefinition, method: InstallMethod, realPath: string): string | undefined {
  if (method.kind !== "native") return undefined;
  if (!definition.selfUpdate) return definition.manualHint ?? "no official updater for this install";
  if (isWorldWritable(realPath)) return "binary is world-writable; refusing to run it";
  if (isWorldWritable(dirname(realPath))) return "install directory is world-writable; refusing to run it";
  return undefined;
}

function warningFor(method: InstallMethod, realPath: string): string | undefined {
  if (method.kind === "native" || !isWorldWritable(realPath)) return undefined;
  return `binary is world-writable, consider: chmod o-w "${realPath}"`;
}

function packageFamily(method: InstallMethod): "npm" | "pypi" | "brew" | null {
  switch (method.kind) {
    case "brew-cask":
    case "brew-formula": return "brew";
    case "uv":
    case "pipx": return "pypi";
    case "native": return null;
    default: return "npm";
  }
}

/** Un binaire installé par un gestionnaire n'est attribué à l'agent que si le nom du paquet correspond. */
function ownsPackage(definition: AgentDefinition, method: InstallMethod): boolean {
  const family = packageFamily(method);
  if (!family || !("name" in method)) return true;
  return definition.packages?.[family]?.includes(method.name) ?? false;
}

export interface AgentDetectionDependencies {
  which?: Which;
  /** Dossier personnel où les chemins `~/` documentés sont résolus. */
  home?: string;
  definitions?: AgentDefinition[];
}

export async function detectAgents({
  which = (bin) => Bun.which(bin),
  definitions = AGENTS,
}: AgentDetectionDependencies = {}): Promise<DetectedAgent[]> {
  const found = await Promise.all(definitions.map(async (definition): Promise<DetectedAgent | null> => {
    const binary = findBinary(definition, which);
    if (!binary) return null;
    const method = resolveInstallMethod(binary.realPath);
    if (!ownsPackage(definition, method)) return null;
    return {
      definition,
      ...binary,
      method,
      current: await readVersion(binary.binPath, binary.realPath, method),
      blocked: blockedReason(definition, method, binary.realPath),
      warning: warningFor(method, binary.realPath),
      unverified: method.kind === "native" && Boolean(definition.nativeHint) && !definition.nativeHint!.test(binary.realPath),
    };
  }));
  return found.filter((agent): agent is DetectedAgent => agent !== null);
}

function packageKind(method: InstallMethod): PackageKind | null {
  switch (method.kind) {
    case "brew-cask":
    case "brew-formula": return "brew";
    case "npm":
    case "bun":
    case "pnpm":
    case "yarn": return "npm";
    case "uv":
    case "pipx": return "pypi";
    case "native": return null;
  }
}

export function updateCommand(agent: DetectedAgent): string[] {
  const { method } = agent;
  const kind = packageKind(method);
  if (kind && "name" in method) assertSafePackageNames(kind, [method.name]);

  switch (method.kind) {
    case "brew-cask": return ["brew", "upgrade", "--cask", method.name];
    case "brew-formula": return ["brew", "upgrade", method.name];
    case "npm": return ["npm", "install", "-g", `${method.name}@latest`];
    case "bun": return ["bun", "add", "-g", `${method.name}@latest`];
    case "pnpm": return ["pnpm", "add", "-g", `${method.name}@latest`];
    case "yarn": return ["yarn", "global", "add", `${method.name}@latest`];
    case "uv": return ["uv", "tool", "upgrade", method.name];
    case "pipx": return ["pipx", "upgrade", method.name];
    case "native": {
      if (!agent.definition.selfUpdate) throw new Error(agent.blocked ?? "No updater available");
      // Chemin absolu : on relance exactement le binaire détecté, pas un homonyme du PATH.
      return [agent.binPath, ...agent.definition.selfUpdate];
    }
  }
}

export function uninstallCommand(agent: DetectedAgent): string[] {
  const { method } = agent;
  const kind = packageKind(method);
  if (kind && "name" in method) assertSafePackageNames(kind, [method.name]);

  switch (method.kind) {
    case "brew-cask": return ["brew", "uninstall", "--cask", method.name];
    case "brew-formula": return ["brew", "uninstall", method.name];
    case "npm": return ["npm", "uninstall", "-g", method.name];
    case "bun": return ["bun", "remove", "-g", method.name];
    case "pnpm": return ["pnpm", "remove", "-g", method.name];
    case "yarn": return ["yarn", "global", "remove", method.name];
    case "uv": return ["uv", "tool", "uninstall", method.name];
    case "pipx": return ["pipx", "uninstall", method.name];
    case "native": {
      const spec = agent.definition.nativeUninstall;
      if (!spec || !("args" in spec)) throw new Error(NO_UNINSTALLER);
      assertRunnable(agent);
      return [agent.binPath, ...spec.args];
    }
  }
}

const NO_UNINSTALLER = "no documented uninstaller, remove it with the vendor's instructions";

function assertRunnable(agent: DetectedAgent): void {
  if (isWorldWritable(agent.realPath) || isWorldWritable(dirname(agent.realPath))) {
    throw new Error("binary or install directory is world-writable; refusing to touch it");
  }
}

function isInside(child: string, parent: string): boolean {
  return child === parent || child.startsWith(parent.endsWith(sep) ? parent : parent + sep);
}

/**
 * Résout les chemins documentés par l'éditeur avant suppression.
 * Chaque chemin doit rester sous le dossier personnel, et l'installation détectée doit s'y trouver.
 */
export function removalPaths(agent: DetectedAgent, documented: string[], home = homedir()): string[] {
  const realHome = realpathSync(home);
  const resolved: string[] = [];
  for (const entry of documented) {
    if (!entry.startsWith("~/") || entry.split("/").includes("..")) throw new Error(`unsafe removal path ${entry}`);
    const target = join(home, entry.slice(2));
    try {
      lstatSync(target);
    } catch {
      continue;
    }
    // Le parent est résolu, pas la cible : un lien symbolique est supprimé lui-même, jamais suivi.
    const parent = realpathSync(dirname(target));
    const safeTarget = join(parent, basename(target));
    if (!isInside(safeTarget, realHome) || safeTarget === realHome) throw new Error(`refusing to remove ${target} outside the home folder`);
    resolved.push(safeTarget);
  }
  const ownsBinary = resolved.some((path) => {
    const real = lstatSync(path).isSymbolicLink() ? path : realpathSync(path);
    return isInside(agent.realPath, real);
  });
  const ownsCommand = resolved.some((path) => path === join(realpathSync(dirname(agent.binPath)), basename(agent.binPath)));
  if (!ownsBinary || !ownsCommand) throw new Error(`${agent.definition.name} is not installed at its documented location`);
  return resolved;
}

export type RemovalPlan =
  | { kind: "exec"; command: string[] }
  | { kind: "remove"; paths: string[] };

export function uninstallPlan(agent: DetectedAgent, home = homedir()): RemovalPlan {
  const spec = agent.definition.nativeUninstall;
  if (agent.method.kind === "native" && spec && "paths" in spec) {
    assertRunnable(agent);
    return { kind: "remove", paths: removalPaths(agent, spec.paths, home) };
  }
  return { kind: "exec", command: uninstallCommand(agent) };
}

function tildify(path: string, home = homedir()): string {
  const realHome = (() => {
    try {
      return realpathSync(home);
    } catch {
      return home;
    }
  })();
  for (const root of [realHome, home]) {
    if (isInside(path, root)) return `~${path.slice(root.length)}`;
  }
  return path;
}

function displayCommand(agent: DetectedAgent, command: string[]): string {
  return [command[0] === agent.binPath ? agent.definition.bins[0] : command[0], ...command.slice(1)].join(" ");
}

export function describePlan(agent: DetectedAgent, plan: RemovalPlan, home = homedir()): string {
  return plan.kind === "exec"
    ? displayCommand(agent, plan.command)
    : `remove ${plan.paths.map((path) => tildify(path, home)).join(", ")}`;
}

function claimFor(method: InstallMethod): ClaimedPackage[] {
  switch (method.kind) {
    case "brew-cask": return [
      { manager: "homebrew", name: method.name },
      { manager: "homebrew", name: `${method.name} (cask)` },
    ];
    case "brew-formula": return [{ manager: "homebrew", name: method.name }];
    case "npm":
    case "pnpm":
    case "yarn":
    case "bun": return [{ manager: "node", name: method.name }];
    default: return [];
  }
}

export type AiAgentsManager = PackageManager & {
  /** Tous les agents détectés, y compris à jour ou bloqués. */
  agents(): Promise<DetectedAgent[]>;
};

export function createAiAgentsManager(dependencies: AgentDetectionDependencies = {}): AiAgentsManager {
  const home = dependencies.home ?? homedir();
  let detection: Promise<DetectedAgent[]> | undefined;
  let detected: DetectedAgent[] = [];

  const agents = (): Promise<DetectedAgent[]> => {
    detection ??= detectAgents(dependencies).then((list) => {
      detected = list;
      return list;
    });
    return detection;
  };

  const byName = async (names: string[] | undefined): Promise<DetectedAgent[]> => {
    const list = await agents();
    if (!names?.length) return list;
    const wanted = new Set(names);
    return list.filter((agent) => wanted.has(agent.definition.name));
  };

  const runEach = async (
    targets: DetectedAgent[],
    dryRun: boolean,
    action: "update" | "uninstall",
    onProgress?: ProgressReporter,
  ): Promise<UpdateResult> => {
    const failed: string[] = [];
    const errors: string[] = [];
    const outputs: string[] = [];
    const fail = (label: string, message: string) => {
      failed.push(label);
      errors.push(`${label}: ${sanitizeLine(message)}`);
    };

    for (const agent of targets) {
      const label = agent.definition.name;
      let plan: RemovalPlan;
      try {
        if (action === "update") {
          if (agent.blocked) throw new Error(agent.blocked);
          plan = { kind: "exec", command: updateCommand(agent) };
        } else {
          plan = uninstallPlan(agent, home);
        }
      } catch (error) {
        fail(label, error instanceof Error ? error.message : String(error));
        continue;
      }

      onProgress?.(`${label} · ${dryRun ? "would run" : "running"} ${describePlan(agent, plan, home)}`);
      if (dryRun) continue;

      if (plan.kind === "remove") {
        try {
          for (const path of plan.paths) rmSync(path, { recursive: true, force: true });
        } catch (error) {
          fail(label, error instanceof Error ? error.message : String(error));
        }
        continue;
      }

      const result = await exec(plan.command, { onLine: onProgress, timeout: UPDATE_TIMEOUT });
      if (result.stdout) outputs.push(result.stdout);
      if (result.exitCode !== 0) fail(label, result.stderr || result.stdout || `exit code ${result.exitCode}`);
    }

    return {
      manager: MANAGER_NAME,
      success: failed.length === 0,
      updated: targets.length - failed.length,
      output: outputs.join("\n"),
      error: errors.length > 0 ? errors.join("\n") : undefined,
      failedPackages: failed,
    };
  };

  return {
    name: MANAGER_NAME,
    command: "ai",
    icon: "✦",
    category: "ai",
    agents,

    async detect() {
      return (await agents()).length > 0;
    },

    async listOutdated(): Promise<OutdatedPackage[]> {
      const list = await agents();
      const checks = await Promise.all(list.map(async (agent): Promise<OutdatedPackage | null> => {
        if (agent.blocked) return null;
        const latest = await fetchLatestVersion(agent.method, agent.definition.latest);
        const base = {
          name: agent.definition.name,
          path: agent.realPath,
          method: `${METHOD_LABEL[agent.method.kind]}${agent.unverified ? "?" : ""}`,
        };
        if (!latest || !agent.current || agent.unverified) {
          return { ...base, current: agent.current ?? "?", latest: latest ?? "?", uncertain: true };
        }
        return isVersionNewer(latest, agent.current)
          ? { ...base, current: agent.current, latest }
          : null;
      }));
      return checks.filter((pkg): pkg is OutdatedPackage => pkg !== null);
    },

    async listInstalled(): Promise<InstalledPackage[]> {
      return (await agents()).map((agent) => {
        const base = { name: agent.definition.name, version: agent.current ?? "?", method: METHOD_LABEL[agent.method.kind] };
        try {
          return { ...base, detail: describePlan(agent, uninstallPlan(agent, home), home) };
        } catch (error) {
          return { ...base, blocked: error instanceof Error ? error.message : String(error) };
        }
      });
    },

    async update(dryRun = false, packages, onProgress) {
      return runEach(await byName(packages), dryRun, "update", onProgress);
    },

    async uninstall(dryRun = false, packages, onProgress) {
      if (!packages?.length) return { manager: MANAGER_NAME, success: true, updated: 0, output: "Nothing to uninstall" };
      return runEach(await byName(packages), dryRun, "uninstall", onProgress);
    },

    claimed() {
      return detected.flatMap((agent) => claimFor(agent.method));
    },
  };
}

export const aiAgents = createAiAgentsManager();
