import { Box, Text } from "ink";
import { useState } from "react";
import { KeyHints } from "./key-hints.tsx";
import { useTerminalSize } from "./use-terminal-size.ts";
import { useKeys } from "./use-keys.ts";
import { Clickable } from "./mouse.tsx";
import { colors, glyphs } from "../ui/theme.ts";
import { Header } from "./ui.tsx";

export const MOLE_APP_AFFILIATE_URL = "https://mole.fit/?atp=SCo7Qr4nXn";
export const MOLE_CLI_URL = "https://github.com/tw93/Mole";

type LinkState = "idle" | "opening" | "opened" | "error";

export function MoleTipScreen({ onBack }: { onBack: () => void }) {
  const { columns, rows } = useTerminalSize();
  const [linkState, setLinkState] = useState<LinkState>("idle");
  const compact = columns < 96 || rows < 28;

  const openMoleApp = async () => {
    if (linkState === "opening") return;
    setLinkState("opening");
    try {
      const process = Bun.spawn(["open", MOLE_APP_AFFILIATE_URL], {
        stdin: "ignore",
        stdout: "ignore",
        stderr: "ignore",
      });
      setLinkState((await process.exited) === 0 ? "opened" : "error");
    } catch {
      setLinkState("error");
    }
  };

  useKeys((input, key) => {
    if (key.escape || input === "q" || key.leftArrow) {
      onBack();
      return;
    }
    if (key.return || key.rightArrow || input === "o") {
      void openMoleApp();
    }
  });

  return (
    <Box flexDirection="column" paddingX={1}>
      <Header title="mole" />

      <Box flexDirection="column">
        <Text wrap="wrap">
          Mole uninstalls .app bundles and cleans their related files (caches, preferences, and logs).
        </Text>

        <Box marginTop={1} flexDirection="column">
          <Text bold>Mole CLI — install:</Text>
          <Text color={colors.accent}>  brew install mole</Text>
          <Text bold>Mole CLI — run:</Text>
          <Text color={colors.accent}>  mole</Text>
        </Box>

        <Box marginTop={1} flexDirection="column">
          <Text bold>Mole application website (affiliate link):</Text>
          <Clickable onClick={() => void openMoleApp()}>
            <Text color={colors.accent} underline wrap="truncate-end">  {MOLE_APP_AFFILIATE_URL}</Text>
          </Clickable>
        </Box>

        <Box marginTop={1} flexDirection="column">
          <Text bold>Mole CLI source:</Text>
          <Text color={colors.textMuted} wrap="truncate-end">  {MOLE_CLI_URL}</Text>
        </Box>
      </Box>

      {linkState === "opening" && (
        <Box marginTop={1}><Text color={colors.warning}>Opening Mole application website…</Text></Box>
      )}
      {linkState === "opened" && (
        <Box marginTop={1}><Text color={colors.success}>{glyphs().ok} Mole application website opened in your browser.</Text></Box>
      )}
      {linkState === "error" && (
        <Box marginTop={1}><Text color={colors.danger}>{glyphs().fail} Could not open the browser. Copy the URL above.</Text></Box>
      )}

      <KeyHints
        compact={compact}
        hints={[
          { keys: "enter", label: "open app", onPress: () => void openMoleApp() },
          { keys: "esc", label: "back", onPress: onBack },
        ]}
      />
    </Box>
  );
}
