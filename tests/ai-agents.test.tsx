import { describe, expect, test } from "bun:test";
import { mkdtempSync, mkdirSync, symlinkSync, writeFileSync, chmodSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { renderToString } from "ink";
import { resolveInstallMethod } from "../src/detectors/ai-agents/install-method.ts";
import {
  createAiAgentsManager,
  detectAgents,
  updateCommand,
  versionFromPath,
} from "../src/detectors/ai-agents/index.ts";
import { scanOutdated } from "../src/detectors/index.ts";
import { SelectPackagesScreen } from "../src/tui/select-packages.tsx";
import { parseMouse, isMouseInput } from "../src/tui/mouse.tsx";
import type { PackageManager } from "../src/detectors/types.ts";

describe("install method resolution", () => {
  test.each([
    ["/Users/me/.local/share/claude/versions/2.1.323", { kind: "native" }],
    ["/opt/homebrew/Caskroom/codex/0.168.0/bin/codex", { kind: "brew-cask", name: "codex" }],
    ["/opt/homebrew/Cellar/gemini-cli/0.68.0/libexec/lib/node_modules/@google/gemini-cli/dist/index.js", { kind: "brew-formula", name: "gemini-cli" }],
    ["/Users/me/.local/share/uv/tools/mistral-vibe/bin/vibe", { kind: "uv", name: "mistral-vibe" }],
    ["/Users/me/.local/pipx/venvs/aider-chat/bin/aider", { kind: "pipx", name: "aider-chat" }],
    ["/Users/me/.bun/install/global/node_modules/@opencode/cli/bin/opencode.exe", { kind: "bun", name: "@opencode/cli" }],
    ["/opt/homebrew/lib/node_modules/@github/copilot/npm-loader.js", { kind: "npm", name: "@github/copilot" }],
    ["/Users/me/Library/pnpm/global/5/node_modules/cline/bin/cline", { kind: "pnpm", name: "cline" }],
  ] as const)("%s", (path, expected) => {
    expect(resolveInstallMethod(path)).toEqual(expected);
  });

  test("reads versions from install paths without running the binary", () => {
    expect(versionFromPath("/opt/homebrew/Caskroom/codex/0.168.0/bin/codex", { kind: "brew-cask", name: "codex" })).toBe("0.168.0");
    expect(versionFromPath("/Users/me/.local/share/claude/versions/2.1.323", { kind: "native" })).toBe("2.1.323");
    expect(versionFromPath("/Users/me/.local/share/cursor-agent/versions/2026.11.05-86047df/cursor-agent", { kind: "native" })).toBe("2026.11.05-86047df");
  });
});

describe("agent detection", () => {
  const withFakeBinaries = (setup: (root: string) => Record<string, string>) => {
    const root = mkdtempSync(join(tmpdir(), "nxtupdate-agents-"));
    const bins = setup(root);
    return { root, which: (bin: string) => bins[bin] ?? null, cleanup: () => rmSync(root, { recursive: true, force: true }) };
  };

  test("runs the native updater by absolute path and refuses world-writable binaries", async () => {
    const fake = withFakeBinaries((root) => {
      const versions = join(root, "share/claude/versions");
      mkdirSync(versions, { recursive: true });
      const real = join(versions, "2.1.323");
      writeFileSync(real, "#!/bin/sh\n");
      chmodSync(real, 0o755);
      const link = join(root, "claude");
      symlinkSync(real, link);

      const unsafe = join(root, "share/amp");
      mkdirSync(unsafe, { recursive: true });
      const ampReal = join(unsafe, "amp");
      writeFileSync(ampReal, "#!/bin/sh\n");
      chmodSync(ampReal, 0o777);
      return { claude: link, amp: ampReal };
    });

    try {
      const agents = await detectAgents({ which: fake.which });
      const claude = agents.find((agent) => agent.definition.id === "claude")!;
      const amp = agents.find((agent) => agent.definition.id === "amp")!;

      expect(claude.method).toEqual({ kind: "native" });
      expect(claude.current).toBe("2.1.323");
      expect(updateCommand(claude)).toEqual([join(fake.root, "claude"), "update"]);
      expect(amp.blocked).toContain("world-writable");
      expect(updateCommand.bind(null, amp)).not.toThrow();
    } finally {
      fake.cleanup();
    }
  });

  test("ignores generic command names outside the expected install path", async () => {
    const agents = await detectAgents({
      which: (bin) => bin === "agent" ? "/usr/bin/true" : null,
    });
    expect(agents.find((agent) => agent.definition.id === "cursor")).toBeUndefined();
  });

  test("hides packages owned by the AI agent category from other managers", async () => {
    const fake = withFakeBinaries((root) => {
      const pkg = join(root, "lib/node_modules/@github/copilot");
      mkdirSync(pkg, { recursive: true });
      writeFileSync(join(pkg, "package.json"), JSON.stringify({ version: "1.0.110" }));
      writeFileSync(join(pkg, "npm-loader.js"), "");
      return { copilot: join(pkg, "npm-loader.js") };
    });

    const ai = createAiAgentsManager({ which: fake.which });
    const node: PackageManager = {
      name: "Node (npm)",
      command: "node",
      icon: "N",
      async detect() { return true; },
      async listOutdated() {
        return [
          { name: "@github/copilot", current: "1.0.110", latest: "1.0.112" },
          { name: "typescript\u001b[2J", current: "5.0.0", latest: "5.1.0" },
        ];
      },
      async listInstalled() { return []; },
      async update() { return { manager: "Node", success: true, updated: 0, output: "" }; },
      async uninstall() { return { manager: "Node", success: true, updated: 0, output: "" }; },
    };
    // La détection doit avoir eu lieu pour connaître les paquets revendiqués.
    await ai.agents();

    try {
      const results = await scanOutdated([{ ...ai, listOutdated: async () => [] }, node]);
      const nodeItems = results.find((result) => result.manager === node)!.items;
      expect(nodeItems.map((pkg) => pkg.name)).toEqual(["typescript"]);
    } finally {
      fake.cleanup();
    }
  });

  test("refuses option-like package names before running a command", () => {
    expect(() => updateCommand({
      definition: { id: "x", name: "X", bins: ["x"] },
      binPath: "/x",
      realPath: "/x",
      method: { kind: "npm", name: "--registry=https://evil.test" },
      current: "1.0.0",
    })).toThrow("unsafe");
  });
});

describe("AI agents in the selection screen", () => {
  const ai: PackageManager = {
    name: "AI agents",
    command: "ai",
    icon: "A",
    category: "ai",
    async detect() { return true; },
    async listOutdated() { return []; },
    async listInstalled() { return []; },
    async update() { return { manager: "AI agents", success: true, updated: 0, output: "" }; },
    async uninstall() { return { manager: "AI agents", success: true, updated: 0, output: "" }; },
  };
  const brew: PackageManager = { ...ai, name: "Homebrew", command: "brew", category: "packages" };

  test("lists AI agents first, under their own section, and leaves unverified ones unselected", () => {
    const output = renderToString(
      <SelectPackagesScreen
        managers={[
          { manager: brew, outdated: [{ name: "wget", current: "1.0", latest: "1.1" }] },
          {
            manager: ai,
            outdated: [
              { name: "Claude Code", current: "2.1.323", latest: "2.1.325", method: "native" },
              { name: "Kiro CLI", current: "1.0.0", latest: "?", method: "native", uncertain: true },
            ],
          },
        ]}
        title="Select packages to update"
        onConfirm={() => {}}
        onBack={() => {}}
      />,
      { columns: 80 },
    );

    const lines = output.split("\n");
    const aiSection = lines.findIndex((line) => line.includes("AI AGENTS"));
    const packagesSection = lines.findIndex((line) => line.includes("PACKAGES"));
    expect(aiSection).toBeGreaterThan(-1);
    expect(packagesSection).toBeGreaterThan(aiSection);
    expect(output).toContain("2/3 selected");
    expect(output).toContain("◉ Claude Code");
    expect(output).toContain("○ Kiro CLI");
    expect(output).toContain("latest unknown");
    expect(output).toContain("native");
    for (const line of lines) expect(Bun.stringWidth(line)).toBeLessThanOrEqual(80);
  });
});

describe("mouse input", () => {
  test("decodes SGR clicks and wheel events with zero-based cells", () => {
    expect(parseMouse("\u001b[<0;10;5M")).toEqual({ x: 9, y: 4, button: "left", release: false });
    expect(parseMouse("[<0;10;5m")).toEqual({ x: 9, y: 4, button: "left", release: true });
    expect(parseMouse("\u001b[<64;1;1M")?.button).toBe("wheel-up");
    expect(parseMouse("\u001b[<65;1;1M")?.button).toBe("wheel-down");
    expect(parseMouse("\u001b[<35;4;2M")).toEqual({ x: 3, y: 1, button: "move", release: false });
    expect(parseMouse("a")).toBeNull();
  });

  test("recognises mouse sequences that Ink forwards as text", () => {
    expect(isMouseInput("[<0;10;5M")).toBe(true);
    expect(isMouseInput("q")).toBe(false);
  });
});

describe("agent identity", () => {
  test("does not claim an unrelated package that shares a command name", async () => {
    const agents = await detectAgents({
      which: (bin) => bin === "goose" ? "/opt/homebrew/Cellar/goose/3.24.0/bin/goose" : null,
      definitions: (await import("../src/detectors/ai-agents/catalog.ts")).AGENTS,
    });
    expect(agents).toEqual([]);
  });

  test("lists a native binary outside its known install path as unverified and unselected", async () => {
    const manager = createAiAgentsManager({
      which: (bin) => bin === "goose" ? "/usr/bin/true" : null,
    });
    const [goose] = await manager.agents();
    expect(goose?.unverified).toBe(true);
  });
});
