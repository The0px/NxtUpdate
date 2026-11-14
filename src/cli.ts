#!/usr/bin/env bun

import { createProgram } from "./program.ts";
import { showBanner } from "./ui/banner.ts";
import { scanCommand } from "./commands/scan.ts";
import { listCommand } from "./commands/list.ts";
import { updateCommand } from "./commands/update.ts";
import { launchTUI } from "./tui/app.tsx";

const program = createProgram({
  tui: (options) => launchTUI(options),
  update: async (options) => {
    showBanner();
    await updateCommand(options);
  },
  scan: async () => {
    showBanner();
    await scanCommand();
  },
  list: async (options) => {
    showBanner();
    await listCommand(options);
  },
});

await program.parseAsync();
