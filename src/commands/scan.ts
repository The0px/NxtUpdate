import { aiAgents, getAllDetectors } from "../detectors/index.ts";
import { METHOD_LABEL } from "../detectors/ai-agents/install-method.ts";
import { logger } from "../ui/logger.ts";
import { showUpdateNotice } from "../ui/banner.ts";
import { glyphs, managerIcon, paint } from "../ui/theme.ts";
import { checkForUpdate } from "../utils/version.ts";

export async function scanCommand() {
  const updateInfoPromise = checkForUpdate();
  const g = glyphs();

  const [agents, checks] = await Promise.all([
    aiAgents.agents(),
    Promise.all(getAllDetectors().filter((pm) => pm.category !== "ai").map(async (pm) => {
      try {
        return { pm, found: await pm.detect() };
      } catch {
        return { pm, found: false };
      }
    })),
  ]);

  console.log(paint.ai(`${g.managers.ai} AI agents`) + paint.muted(` · ${agents.length} found`));
  for (const agent of agents) {
    const version = agent.current ?? "?";
    const method = paint.muted(` ${METHOD_LABEL[agent.method.kind]}`);
    const problem = agent.blocked ?? agent.warning;
    const note = problem ? paint.warning(` ${g.warn} ${problem}`) : "";
    console.log(`  ${paint.muted("·")} ${agent.definition.name} ${paint.muted(version)} ${method}${note}`);
  }
  console.log("");

  const detected = checks.filter((check) => check.found);
  const notFound = checks.filter((check) => !check.found).map(({ pm }) => pm.name);
  if (detected.length > 0) {
    logger.success(`Found ${detected.length} package manager(s):`);
    logger.list(detected.map(({ pm }) =>
      `${managerIcon(pm)} ${pm.name} ${paint.muted(`(${pm.command})`)}${pm.skipReason ? paint.muted(` · skipped: ${pm.skipReason}`) : ""}`
    ));
  } else {
    logger.warn("No package managers detected.");
  }
  if (notFound.length > 0) logger.dim(`\nNot installed: ${notFound.join(", ")}`);
  console.log("");

  const updateInfo = await updateInfoPromise;
  if (updateInfo?.hasUpdate) showUpdateNotice(updateInfo);
}
