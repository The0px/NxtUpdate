import ora from "ora";
import { checkbox, confirm } from "@inquirer/prompts";
import { scanOutdated } from "../detectors/index.ts";
import { setNoSudo } from "../detectors/macos.ts";
import { logger } from "../ui/logger.ts";
import { showUpdateNotice } from "../ui/banner.ts";
import { glyphs, managerIcon, paint } from "../ui/theme.ts";
import { checkForUpdate } from "../utils/version.ts";
import { sanitizeLine } from "../utils/sanitize.ts";
import { resolveManagers } from "./select.ts";
import type { CliOptions, UpdateResult, PackageManager, OutdatedPackage } from "../detectors/types.ts";

const label = (pm: PackageManager) => `${managerIcon(pm)} ${pm.name}`;

export async function updateCommand(options: CliOptions) {
  setNoSudo(Boolean(options.noSudo));
  const updateInfoPromise = checkForUpdate();

  let managers = await resolveManagers(options.only);
  if (!managers) return;
  if (managers.length === 0) {
    logger.warn("No package managers detected. Run `nxtupdate scan` to check.");
    return;
  }

  const spinner = ora({ text: "Scanning AI agents and packages…", prefixText: " " }).start();
  const scans = await scanOutdated(managers);
  spinner.stop();

  const outdatedMap = new Map<PackageManager, OutdatedPackage[]>();
  const unverified: { pm: PackageManager; pkg: OutdatedPackage }[] = [];
  for (const { manager, items } of scans) {
    // Une version distante non vérifiée n'est jamais mise à jour sans passer par le TUI.
    outdatedMap.set(manager, items.filter((pkg) => !pkg.uncertain));
    for (const pkg of items.filter((item) => item.uncertain)) unverified.push({ pm: manager, pkg });
  }

  const withOutdated = managers.filter((pm) => (outdatedMap.get(pm)?.length ?? 0) > 0);
  const skipped = managers.filter((pm) => pm.skipReason);

  if (skipped.length > 0) {
    logger.info(`${skipped.length} package manager(s) skipped:`);
    for (const pm of skipped) logger.dim(`  · ${pm.name}: ${pm.skipReason}`);
    console.log("");
  }
  if (unverified.length > 0) {
    logger.info(`${unverified.length} item(s) without a verifiable latest version (use the TUI to update them):`);
    for (const { pkg } of unverified) logger.dim(`  · ${pkg.name} ${pkg.current}`);
    console.log("");
  }

  if (withOutdated.length === 0) {
    if (skipped.length > 0 || unverified.length > 0) logger.info("No actionable updates.\n");
    else logger.success("Everything is already up to date!\n");
    const updateInfo = await updateInfoPromise;
    if (updateInfo?.hasUpdate) showUpdateNotice(updateInfo);
    return;
  }

  const totalOutdated = withOutdated.reduce((sum, pm) => sum + (outdatedMap.get(pm)?.length ?? 0), 0);
  console.log(paint.warning(`  ${totalOutdated} update(s) across ${withOutdated.length} manager(s)\n`));
  for (const pm of withOutdated) {
    console.log(`  ${paint.accent(label(pm))}`);
    for (const pkg of outdatedMap.get(pm) ?? []) {
      const method = pkg.method ? paint.muted(`  ${pkg.method}`) : "";
      console.log(`    ${paint.muted("·")} ${pkg.name} ${paint.muted(pkg.current)} ${paint.warning(glyphs().arrow)} ${paint.success(pkg.latest)}${method}`);
    }
  }
  console.log("");

  if (!options.yes && withOutdated.length > 1) {
    const selected = await checkbox({
      message: "Select which managers to update:",
      choices: withOutdated.map((pm) => ({
        name: `${label(pm)} (${outdatedMap.get(pm)?.length ?? 0})`,
        value: pm,
        checked: true,
      })),
    });
    if (selected.length === 0) {
      logger.info("Nothing selected. Exiting.");
      return;
    }
    const count = selected.reduce((sum, pm) => sum + (outdatedMap.get(pm)?.length ?? 0), 0);
    const ok = await confirm({ message: `Update ${count} item(s) across ${selected.length} manager(s)?`, default: true });
    if (!ok) {
      logger.info("Cancelled.");
      return;
    }
    managers = selected;
  } else if (!options.yes) {
    const ok = await confirm({ message: `Update all ${totalOutdated} outdated item(s)?`, default: true });
    if (!ok) {
      logger.info("Cancelled.");
      return;
    }
  }

  if (options.dryRun) console.log(paint.warning(`\n  ${glyphs().warn} Dry run: nothing will be modified\n`));

  console.log("");
  const results: UpdateResult[] = [];

  for (const pm of managers) {
    const outdated = outdatedMap.get(pm) ?? [];
    if (outdated.length === 0) continue;

    const updSpinner = ora({ text: `Updating ${pm.name} (${outdated.length})…`, prefixText: " " }).start();
    const onProgress = options.verbose
      ? (line: string) => { updSpinner.text = `${pm.name} · ${sanitizeLine(line, 120)}`; }
      : undefined;

    try {
      const result = await pm.update(options.dryRun, outdated.map((pkg) => pkg.name), onProgress);
      results.push(result);

      if (result.success) {
        updSpinner.succeed(
          options.dryRun
            ? paint.warning(label(pm)) + paint.muted(` · ${outdated.length} item(s) would be updated`)
            : paint.success(label(pm)) + paint.muted(` · ${result.updated} item(s) updated`)
        );
      } else {
        updSpinner.fail(paint.danger(label(pm)) + paint.muted(` · failed: ${sanitizeLine(result.error ?? "unknown")}`));
      }
    } catch (err) {
      const message = sanitizeLine(err instanceof Error ? err.message : String(err));
      updSpinner.fail(paint.danger(label(pm)) + paint.muted(` · error: ${message}`));
      results.push({ manager: pm.name, success: false, updated: 0, output: "", error: message });
    }
  }

  console.log("");
  const successful = results.filter((r) => r.success);
  const failed = results.filter((r) => !r.success);
  const totalUpdated = results.reduce((sum, r) => sum + r.updated, 0);

  if (options.dryRun) logger.info("Dry run complete. Run without --dry-run to apply updates.");
  else if (totalUpdated > 0) logger.success(`Done! Updated ${totalUpdated} item(s) across ${successful.length} manager(s).`);
  else if (failed.length === 0) logger.success("Everything is already up to date!");

  if (failed.length > 0) {
    logger.warn(`${failed.length} manager(s) reported failures:`);
    for (const f of failed) logger.dim(`  · ${f.manager}: ${sanitizeLine(f.error ?? "unknown")}`);
  }

  console.log("");
  const updateInfo = await updateInfoPromise;
  if (updateInfo?.hasUpdate) showUpdateNotice(updateInfo);
}
