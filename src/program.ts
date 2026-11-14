import { Command } from "commander";
import { setIconSet } from "./ui/theme.ts";
import { VERSION } from "./utils/version.ts";
import type { CliOptions } from "./detectors/types.ts";

type RawOptions = Omit<CliOptions, "noSudo"> & { sudo?: boolean };

export interface ProgramActions {
  tui(options: CliOptions): Promise<void>;
  update(options: CliOptions): Promise<void>;
  scan(options: CliOptions): Promise<void>;
  list(options: CliOptions): Promise<void>;
}

// Commander range `--no-sudo` dans `sudo: false` : sans cette conversion, l'option est ignorée.
function normalize(raw: RawOptions): CliOptions {
  const { sudo, ...rest } = raw;
  setIconSet(rest.icons ?? process.env.NXTUPDATE_ICONS);
  return { ...rest, noSudo: sudo === false };
}

/** Options de la sous-commande, complétées par celles tapées avant elle (jamais par les valeurs par défaut de la racine). */
function collectOptions(command: Command): RawOptions {
  const options: Record<string, unknown> = { ...command.opts() };
  for (let parent = command.parent; parent; parent = parent.parent) {
    for (const [key, value] of Object.entries(parent.opts())) {
      if (parent.getOptionValueSource(key) === "cli" && command.getOptionValueSource(key) !== "cli") {
        options[key] = value;
      }
    }
  }
  return options as RawOptions;
}

function withSharedOptions(command: Command, { mouse = false } = {}): Command {
  command
    .option("-d, --dry-run", "Show what would change without modifying anything")
    .option("--no-sudo", "Skip updates that require sudo")
    .option("--icons <set>", "Icon set: emoji, nerd or ascii");
  if (mouse) {
    command.option("--no-mouse", "Disable mouse support (keeps native text selection)");
    command.option("--no-animation", "Disable interface animations");
  }
  return command;
}

export function createProgram(actions: ProgramActions): Command {
  const program = new Command();

  // Options positionnelles : sinon la racine capte `update --dry-run` et la sous-commande lance de vraies mises à jour.
  program
    .name("nxtupdate")
    .description("Universal macOS updater for AI agent CLIs, package managers and the system")
    .version(VERSION)
    .enablePositionalOptions();
  withSharedOptions(program, { mouse: true });

  withSharedOptions(program.command("tui").description("Launch interactive TUI"), { mouse: true })
    .action((_opts, command: Command) => actions.tui(normalize(collectOptions(command))));

  withSharedOptions(program.command("update").description("Auto-detect and update AI agents and packages"))
    .option("-o, --only <manager>", "Update only one manager (e.g. ai, brew, node)")
    .option("-v, --verbose", "Show live updater output")
    .option("-y, --yes", "Skip confirmation prompts")
    .action((_opts, command: Command) => actions.update(normalize(collectOptions(command))));

  program.command("scan")
    .description("Detect installed AI agents and package managers")
    .option("--icons <set>", "Icon set: emoji, nerd or ascii")
    .action((_opts, command: Command) => actions.scan(normalize(collectOptions(command))));

  program.command("list")
    .description("List outdated AI agents and packages")
    .option("-o, --only <manager>", "List only one manager (e.g. ai, brew)")
    .option("-y, --yes", "Skip interactive selection")
    .option("--icons <set>", "Icon set: emoji, nerd or ascii")
    .action((_opts, command: Command) => actions.list(normalize(collectOptions(command))));

  program.action((_opts, command: Command) => actions.tui(normalize(collectOptions(command))));

  return program;
}
