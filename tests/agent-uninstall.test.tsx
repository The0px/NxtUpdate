import { afterEach, describe, expect, test } from "bun:test";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PassThrough } from "node:stream";
import { render } from "ink";
import {
  createAiAgentsManager,
  detectAgents,
  removalPaths,
  uninstallCommand,
  uninstallPlan,
} from "../src/detectors/ai-agents/index.ts";
import { motionEnabled, setAnimation } from "../src/tui/motion.ts";
import { MainMenu } from "../src/tui/main-menu.tsx";
import { MouseProvider } from "../src/tui/mouse.tsx";

const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function executable(path: string) {
  mkdirSync(join(path, ".."), { recursive: true });
  writeFileSync(path, "#!/bin/sh\n");
  chmodSync(path, 0o755);
}

/** Dossier personnel jetable avec une installation native de Claude Code à l'emplacement documenté. */
function fakeHome() {
  const home = mkdtempSync(join(tmpdir(), "nxtupdate-home-"));
  roots.push(home);
  const real = join(home, ".local/share/claude/versions/2.1.325");
  executable(real);
  mkdirSync(join(home, ".local/bin"), { recursive: true });
  symlinkSync(real, join(home, ".local/bin/claude"));
  return home;
}

describe("agent uninstall", () => {
  test("uses each package manager's own uninstall command", async () => {
    const home = fakeHome();
    const vibe = join(home, ".local/share/uv/tools/mistral-vibe/bin/vibe");
    const codex = join(home, "brew/Caskroom/codex/0.169.0/bin/codex");
    const copilot = join(home, "npm/lib/node_modules/@github/copilot/npm-loader.js");
    [vibe, codex, copilot].forEach(executable);
    const bins: Record<string, string> = { vibe, codex, copilot };
    const agents = await detectAgents({ which: (bin) => bins[bin] ?? null });
    const command = (id: string) => uninstallCommand(agents.find((agent) => agent.definition.id === id)!);

    expect(command("vibe")).toEqual(["uv", "tool", "uninstall", "mistral-vibe"]);
    expect(command("codex")).toEqual(["brew", "uninstall", "--cask", "codex"]);
    expect(command("copilot")).toEqual(["npm", "uninstall", "-g", "@github/copilot"]);
  });

  test("runs OpenCode's documented uninstaller by absolute path and blocks undocumented natives", async () => {
    const home = fakeHome();
    const opencode = join(home, ".opencode/bin/opencode");
    const cursor = join(home, ".local/share/cursor-agent/versions/2026.11.13-abc1234/cursor-agent");
    executable(opencode);
    executable(cursor);
    const bins: Record<string, string> = { opencode, "cursor-agent": cursor };
    const manager = createAiAgentsManager({ which: (bin) => bins[bin] ?? null, home });

    const agents = await manager.agents();
    const open = agents.find((agent) => agent.definition.id === "opencode")!;
    expect(uninstallCommand(open)).toEqual([opencode, "uninstall", "--force", "--keep-config", "--keep-data"]);

    const installed = await manager.listInstalled();
    expect(installed.find((pkg) => pkg.name === "OpenCode")?.detail).toBe("opencode uninstall --force --keep-config --keep-data");
    expect(installed.find((pkg) => pkg.name === "Cursor CLI")?.blocked).toContain("no documented uninstaller");

    const result = await manager.uninstall(false, ["Cursor CLI"]);
    expect(result.failedPackages).toEqual(["Cursor CLI"]);
  });

  test("removes only the documented Claude Code paths, and nothing in dry run", async () => {
    const home = fakeHome();
    const manager = createAiAgentsManager({ which: (bin) => bin === "claude" ? join(home, ".local/bin/claude") : null, home });

    const installed = await manager.listInstalled();
    expect(installed[0]?.detail).toBe("remove ~/.local/bin/claude, ~/.local/share/claude");

    const preview = await manager.uninstall(true, ["Claude Code"]);
    expect(preview.success).toBe(true);
    expect(existsSync(join(home, ".local/share/claude/versions/2.1.325"))).toBe(true);

    writeFileSync(join(home, "keep.txt"), "user data");
    const result = await manager.uninstall(false, ["Claude Code"]);
    expect(result.success).toBe(true);
    expect(existsSync(join(home, ".local/bin/claude"))).toBe(false);
    expect(existsSync(join(home, ".local/share/claude"))).toBe(false);
    expect(existsSync(join(home, "keep.txt"))).toBe(true);
  });

  test("refuses removal when the detected binary is not at the documented location", async () => {
    const home = fakeHome();
    const elsewhere = join(home, "custom/.claude/claude");
    executable(elsewhere);
    const [agent] = await detectAgents({ which: (bin) => bin === "claude" ? elsewhere : null });

    expect(() => uninstallPlan(agent!, home)).toThrow("not installed at its documented location");
  });

  test("never follows a documented folder that links outside the home folder", async () => {
    const home = mkdtempSync(join(tmpdir(), "nxtupdate-home-"));
    const outside = mkdtempSync(join(tmpdir(), "nxtupdate-outside-"));
    roots.push(home, outside);
    const real = join(outside, "versions/2.1.325");
    executable(real);
    mkdirSync(join(home, ".local/share"), { recursive: true });
    mkdirSync(join(home, ".local/bin"), { recursive: true });
    symlinkSync(outside, join(home, ".local/share/claude"));
    symlinkSync(join(home, ".local/share/claude/versions/2.1.325"), join(home, ".local/bin/claude"));
    const [agent] = await detectAgents({ which: (bin) => bin === "claude" ? join(home, ".local/bin/claude") : null });

    expect(() => removalPaths(agent!, ["~/.local/bin/claude", "~/.local/share/claude"], home)).toThrow();
    expect(() => removalPaths(agent!, ["~/../etc"], home)).toThrow("unsafe removal path");
  });
});

describe("motion preferences", () => {
  test("stays off until the TUI enables it, and honours reduced motion", () => {
    expect(motionEnabled({})).toBe(false);
    setAnimation(true);
    try {
      expect(motionEnabled({})).toBe(true);
      expect(motionEnabled({ NXTUPDATE_REDUCED_MOTION: "1" })).toBe(false);
    } finally {
      setAnimation(false);
    }
  });
});

describe("mouse hover", () => {
  test("moving over a menu entry focuses it without running it", async () => {
    const stdout = new PassThrough() as PassThrough & NodeJS.WriteStream;
    Object.assign(stdout, { columns: 80, rows: 24, isTTY: false });
    const stdin = new PassThrough() as PassThrough & NodeJS.ReadStream;
    Object.assign(stdin, {
      isTTY: true,
      isRaw: false,
      setRawMode(value: boolean) { this.isRaw = value; return this; },
      ref() { return this; },
      unref() { return this; },
    });
    let lastFrame = "";
    stdout.on("data", (chunk) => { lastFrame = chunk.toString(); });
    const focused: number[] = [];
    let opened = 0;

    const instance = render(
      <MouseProvider enabled>
        <MainMenu
          managers={[]}
          options={{}}
          updateInfo={null}
          selected={0}
          onSelectionChange={(index) => focused.push(index)}
          onStartUpdate={() => {}}
          onUninstall={() => { opened++; }}
          onViewList={() => {}}
          onViewMoleTip={() => {}}
        />
      </MouseProvider>,
      { stdout, stdin, debug: true, patchConsole: false },
    );

    try {
      await Bun.sleep(30);
      const lines = lastFrame.split("\n");
      const row = lines.findIndex((line) => line.includes("Uninstall"));
      const column = lines[row]!.indexOf("Uninstall");
      focused.length = 0;

      stdin.write(`\u001b[<35;${column + 2};${row + 1}M`);
      stdin.write(`\u001b[<35;${column + 4};${row + 1}M`);
      await Bun.sleep(30);
      expect(focused).toEqual([2]);
      expect(opened).toBe(0);
    } finally {
      instance.unmount();
      instance.cleanup();
    }
  });
});
