import { describe, expect, test } from "bun:test";
import { createProgram } from "../src/program.ts";
import type { CliOptions } from "../src/detectors/types.ts";

async function parse(args: string[]): Promise<{ action: string; options: CliOptions }> {
  let seen: { action: string; options: CliOptions } | undefined;
  const record = (action: string) => async (options: CliOptions) => { seen = { action, options }; };
  const program = createProgram({ tui: record("tui"), update: record("update"), scan: record("scan"), list: record("list") });
  program.exitOverride();
  await program.parseAsync(args, { from: "user" });
  return seen!;
}

describe("command line options", () => {
  test("keeps --dry-run on the update subcommand", async () => {
    const { action, options } = await parse(["update", "--only", "ai", "--dry-run", "-y"]);
    expect(action).toBe("update");
    expect(options.dryRun).toBe(true);
    expect(options.only).toBe("ai");
  });

  test("applies --no-sudo instead of silently ignoring it", async () => {
    expect((await parse(["update", "--no-sudo"])).options.noSudo).toBe(true);
    expect((await parse(["update"])).options.noSudo).toBe(false);
  });

  test("passes root options to the default TUI", async () => {
    const { action, options } = await parse(["--dry-run", "--no-mouse"]);
    expect(action).toBe("tui");
    expect(options.dryRun).toBe(true);
    expect(options.mouse).toBe(false);
  });

  test("accepts root options before a subcommand", async () => {
    expect((await parse(["--dry-run", "update"])).options.dryRun).toBe(true);
  });
});
