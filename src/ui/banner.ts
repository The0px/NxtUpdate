import chalk from "chalk";
import { VERSION } from "../utils/version.ts";
import type { UpdateInfo } from "../utils/version.ts";
import { glyphs, paint } from "./theme.ts";

export function showBanner() {
  console.log("");
  console.log(`  ${chalk.bold(paint.accent("nxtupdate"))} ${paint.muted(`v${VERSION} · AI agents, packages and macOS`)}\n`);
}

export function showUpdateNotice(info: UpdateInfo) {
  console.log(
    paint.warning(`${glyphs().warn} NxtUpdate v${info.latest} is available `) +
    paint.muted(`(current: v${info.current})`)
  );
  console.log(paint.muted("  Run: ") + paint.accent("npm i -g nxtupdate") + "\n");
}
