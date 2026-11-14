import { Box, Text } from "ink";
import { colors, glyphs } from "../ui/theme.ts";
import { useTween } from "./motion.ts";

interface Props {
  current: number;
  total: number;
  width?: number;
  label?: string;
}

export function ProgressBar({ current, total, width = 28, label }: Props) {
  const target = total > 0 ? Math.min(1, current / total) : 0;
  const ratio = useTween(target, 260);
  const pct = Math.round(target * 100);
  const ascii = glyphs().ok === "v";
  const full = Math.round(ratio * width);
  const filled = (ascii ? "#" : "━").repeat(full);
  const rest = width - full;
  const color = pct === 100 ? colors.success : colors.accent;

  return (
    <Box gap={1}>
      <Text>
        <Text color={color}>{filled}</Text>
        <Text color={colors.border}>{(ascii ? "-" : "─").repeat(rest)}</Text>
      </Text>
      <Text color={colors.textMuted}>{String(pct).padStart(3)}%</Text>
      {label && <Text color={colors.textMuted}>{label}</Text>}
    </Box>
  );
}
