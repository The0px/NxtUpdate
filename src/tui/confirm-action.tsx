import { Box, Text } from "ink";
import type { ManagerData } from "./app.tsx";
import { KeyHints } from "./key-hints.tsx";
import { useTerminalSize } from "./use-terminal-size.ts";
import { useKeys } from "./use-keys.ts";
import { borderStyle, colors, glyphs } from "../ui/theme.ts";
import { Header } from "./ui.tsx";

interface Props {
  managers: ManagerData[];
  dryRun?: boolean;
  onConfirm: () => void;
  onBack: () => void;
}

export function ConfirmUninstallScreen({ managers, dryRun = false, onConfirm, onBack }: Props) {
  const { columns, rows } = useTerminalSize();
  const compact = columns < 96 || rows < 28;
  const packages = managers.flatMap((manager) =>
    manager.outdated.map((pkg) => ({ manager: manager.manager.name, name: pkg.name, method: pkg.method, detail: pkg.detail }))
  );
  const withDetail = packages.some((pkg) => pkg.detail);
  const previewLimit = Math.max(3, Math.floor((rows - 14) / (withDetail ? 2 : 1)));
  const preview = packages.slice(0, previewLimit);

  useKeys((input, key) => {
    if (input === "y") {
      onConfirm();
      return;
    }
    if (input === "n" || input === "q" || key.escape || key.leftArrow) {
      onBack();
    }
  });

  const tone = dryRun ? colors.warning : colors.danger;

  return (
    <Box flexDirection="column" paddingX={1}>
      <Header title={dryRun ? "uninstall preview" : "confirm removal"} titleColor={tone} dryRun={dryRun} />
      <Text>
        <Text color={tone} bold>{glyphs().warn} </Text>
        {packages.length} item(s) from {managers.length} source(s)
        {dryRun ? " will be previewed, nothing is removed." : " will be removed."}
      </Text>

      <Box flexDirection="column" borderStyle={borderStyle()} borderColor={tone} paddingX={1} marginTop={1}>
        {preview.map((pkg) => (
          <Box key={`${pkg.manager}-${pkg.name}`} flexDirection="column">
            <Text wrap="truncate-middle">
              {pkg.name}
              <Text color={colors.textMuted}>  {pkg.manager}{pkg.method ? ` · ${pkg.method}` : ""}</Text>
            </Text>
            {pkg.detail && <Text color={colors.textMuted} wrap="truncate-middle">  {pkg.detail}</Text>}
          </Box>
        ))}
        {packages.length > preview.length && (
          <Text color={colors.textMuted}>…and {packages.length - preview.length} more</Text>
        )}
      </Box>

      <KeyHints
        compact={compact}
        hints={[
          { keys: "y", label: dryRun ? "run preview" : "uninstall", onPress: onConfirm },
          { keys: "n", label: "cancel", onPress: onBack },
        ]}
      />
    </Box>
  );
}
