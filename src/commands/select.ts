import { detectInstalled, getAllDetectors, matchesManager } from "../detectors/index.ts";
import type { PackageManager } from "../detectors/types.ts";
import { logger } from "../ui/logger.ts";

/** Gestionnaires visés par `--only`, ou null avec un message si rien ne correspond. */
export async function resolveManagers(only: string | undefined): Promise<PackageManager[] | null> {
  const installed = await detectInstalled();
  if (!only) return installed;

  const selected = installed.filter((pm) => matchesManager(pm, only));
  if (selected.length > 0) return selected;

  const known = getAllDetectors().some((pm) => matchesManager(pm, only));
  logger.error(known ? `"${only}" is not installed on this Mac.` : `Unknown manager "${only}".`);
  logger.dim(`Available: ${installed.map((pm) => `${pm.command} (${pm.name})`).join(", ") || "none"}`);
  return null;
}
