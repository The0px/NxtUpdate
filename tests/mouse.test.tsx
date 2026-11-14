import { describe, expect, test } from "bun:test";
import { PassThrough } from "node:stream";
import { render } from "ink";
import { MainMenu } from "../src/tui/main-menu.tsx";
import { MouseProvider } from "../src/tui/mouse.tsx";
import type { PackageManager } from "../src/detectors/types.ts";

function fakeTerminal(columns = 80, rows = 24) {
  const stdout = new PassThrough() as PassThrough & NodeJS.WriteStream;
  Object.assign(stdout, { columns, rows, isTTY: false });
  const stdin = new PassThrough() as PassThrough & NodeJS.ReadStream;
  Object.assign(stdin, {
    isTTY: true,
    isRaw: false,
    setRawMode(value: boolean) { this.isRaw = value; return this; },
    ref() { return this; },
    unref() { return this; },
  });
  return { stdout, stdin };
}

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

describe("mouse support", () => {
  test("clicking a menu entry runs its action", async () => {
    const { stdout, stdin } = fakeTerminal();
    let lastFrame = "";
    stdout.on("data", (chunk) => { lastFrame = chunk.toString(); });
    let agentsOpened = 0;

    const instance = render(
      <MouseProvider enabled>
        <MainMenu
          managers={[{ manager: ai, outdated: [{ name: "Claude Code", current: "1.0.0", latest: "1.1.0", method: "native" }] }]}
          options={{}}
          updateInfo={null}
          selected={0}
          onSelectionChange={() => {}}
          onStartUpdate={() => {}}
          onUpdateAgents={() => { agentsOpened++; }}
          onUninstall={() => {}}
          onViewList={() => {}}
          onViewMoleTip={() => {}}
        />
      </MouseProvider>,
      { stdout, stdin, debug: true, patchConsole: false },
    );

    try {
      await Bun.sleep(30);
      const lines = lastFrame.split("\n");
      const row = lines.findIndex((line) => line.includes("Update AI agents"));
      const column = lines[row]!.indexOf("Update AI agents");
      expect(row).toBeGreaterThan(-1);

      stdin.write(`\u001b[<0;${column + 3};${row + 1}M`);
      await Bun.sleep(30);
      expect(agentsOpened).toBe(1);

      stdin.write(`\u001b[<0;${column + 3};${row + 1}m`);
      stdin.write("\u001b[<0;1;1M");
      await Bun.sleep(30);
      expect(agentsOpened).toBe(1);
    } finally {
      instance.unmount();
      instance.cleanup();
    }
  });
});
