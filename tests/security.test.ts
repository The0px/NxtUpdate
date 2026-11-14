import { describe, expect, test } from "bun:test";
import { sanitizeLine, stripTerminalControls } from "../src/utils/sanitize.ts";
import { assertSafePackageNames, extractVersion, isSafePackageName, isSafeVersion } from "../src/utils/validate.ts";

describe("terminal output sanitising", () => {
  test("removes escape sequences, control characters and bidi overrides", () => {
    expect(stripTerminalControls("ok\u001b[2J\u001b]0;pwned\u0007‮done\u0000")).toBe("okdone");
    expect(sanitizeLine("  a\n\tb  ")).toBe("a b");
    expect(sanitizeLine("x".repeat(500), 10)).toHaveLength(10);
  });
});

describe("package name validation", () => {
  test.each([
    ["npm", "@github/copilot", true],
    ["npm", "--registry=https://evil.test", false],
    ["npm", "../../etc", false],
    ["pypi", "mistral-vibe", true],
    ["pypi", "-e", false],
    ["brew", "charmbracelet/tap/crush", true],
    ["brew", "--force", false],
    ["cargo", "cargo-update", true],
    ["softwareupdate", "macOS Tahoe 26.2-25C56", true],
    ["softwareupdate", "--all", false],
  ] as const)("%s %s", (kind, name, ok) => {
    expect(isSafePackageName(kind, name)).toBe(ok);
  });

  test("throws before a command is built", () => {
    expect(() => assertSafePackageNames("npm", ["ok", "-g"])).toThrow("unsafe");
  });

  test("accepts only plain version strings from remote sources", () => {
    expect(isSafeVersion("2.1.325")).toBe(true);
    expect(isSafeVersion("2026.11.13-eacade1")).toBe(true);
    expect(isSafeVersion("1.0\u001b[2J")).toBe(false);
    expect(extractVersion("codex-cli 0.168.0")).toBe("0.168.0");
    expect(extractVersion("opencode v2.2.7")).toBe("2.2.7");
    expect(extractVersion("grok 1.0.70 (f50904eaee6c) [stable]")).toBe("1.0.70");
  });
});
