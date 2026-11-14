import { checkbox } from "@inquirer/prompts";
import { scanOutdated } from "../detectors/index.ts";
import { fetchPaths } from "../utils/paths.ts";
import { logger } from "../ui/logger.ts";
import { showUpdateNotice } from "../ui/banner.ts";
import { glyphs, managerIcon, paint } from "../ui/theme.ts";
import { checkForUpdate } from "../utils/version.ts";
import { resolveManagers } from "./select.ts";
import type { CliOptions } from "../detectors/types.ts";

export async function listCommand(options: CliOptions = {}) {
  const updateInfoPromise = checkForUpdate();

  let managers = await resolveManagers(options.only);
  if (!managers) return;
  if (managers.length === 0) {
    logger.warn("No package managers detected.");
    return;
  }

  if (!options.only && !options.yes && managers.length > 1) {
    const selected = await checkbox({
      message: "Select managers to check:",
      choices: managers.map((pm) => ({ name: `${managerIcon(pm)} ${pm.name}`, value: pm, checked: true })),
    });
    if (selected.length === 0) {
      logger.info("Nothing selected. Exiting.");
      return;
    }
    managers = selected;
  }

  const scans = await scanOutdated(managers);
  await Promise.all(scans.map(async ({ manager, items }) => {
    const missing = items.filter((pkg) => !pkg.path);
    if (missing.length === 0) return;
    const paths = await fetchPaths(manager.name, missing);
    for (const pkg of missing) pkg.path = paths.get(pkg.name) ?? "";
  }));

  const g = glyphs();
  let totalOutdated = 0;
  let skippedManagers = 0;
  for (const { manager: pm, items: outdated, error } of scans) {
    const title = `${managerIcon(pm)} ${pm.name}`;
    if (error) {
      logger.error(`Failed to check ${pm.name}: ${error}`);
      continue;
    }
    if (pm.skipReason) {
      console.log(paint.warning(title) + paint.muted(` · skipped: ${pm.skipReason}\n`));
      skippedManagers++;
      continue;
    }
    if (outdated.length === 0) {
      console.log(paint.success(title) + paint.muted(" · up to date\n"));
      continue;
    }

    const heading = pm.category === "ai" ? paint.ai : paint.accent;
    console.log(heading(title) + paint.muted(` (${outdated.length} outdated)`));
    for (const pkg of outdated) {
      const latest = pkg.uncertain ? paint.muted("latest unknown") : paint.success(pkg.latest);
      const method = pkg.method ? paint.muted(`  ${pkg.method}`) : "";
      console.log(`  ${paint.muted("·")} ${pkg.name} ${paint.muted(pkg.current)} ${paint.warning(g.arrow)} ${latest}${method}`);
      if (pkg.path) console.log(`    ${paint.muted(pkg.path)}`);
    }
    console.log("");
    totalOutdated += outdated.length;
  }

  if (totalOutdated === 0) {
    if (skippedManagers > 0) logger.info("No actionable package updates. Skipped managers are listed above.\n");
    else logger.success("All packages are up to date!\n");
  } else {
    console.log(paint.warning(`  Total: ${totalOutdated} outdated item(s)\n`));
  }

  const updateInfo = await updateInfoPromise;
  if (updateInfo?.hasUpdate) showUpdateNotice(updateInfo);
}
