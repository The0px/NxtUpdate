import { Box, Text } from "ink";
import { useState } from "react";
import { colors } from "../ui/theme.ts";
import { Clickable } from "./mouse.tsx";
import { useTerminalSize } from "./use-terminal-size.ts";

export interface KeyHint {
  keys: string;
  label: string;
  /** Rend l'indice cliquable à la souris. */
  onPress?: () => void;
}

const GAP = 2;

function hintWidth(hint: KeyHint): number {
  return Bun.stringWidth(`${hint.keys} ${hint.label}`);
}

export function KeyHints({ hints, compact = false }: { hints: KeyHint[]; compact?: boolean }) {
  const { columns } = useTerminalSize();
  // En mode compact, on garde une seule ligne : les indices qui ne tiennent pas sont omis.
  const budget = columns - 2;
  let used = 0;
  const visible = compact
    ? hints.filter((hint) => {
        const width = hintWidth(hint) + (used > 0 ? GAP : 0);
        if (used + width > budget) return false;
        used += width;
        return true;
      })
    : hints;

  const [hovered, setHovered] = useState<string | null>(null);

  return (
    <Box marginTop={1} columnGap={GAP} flexWrap={compact ? "nowrap" : "wrap"}>
      {visible.map((hint) => {
        const id = `${hint.keys}-${hint.label}`;
        const lit = hint.onPress && hovered === id;
        return (
          <Clickable
            key={id}
            onClick={hint.onPress}
            onHover={hint.onPress ? () => setHovered(id) : undefined}
            onLeave={hint.onPress ? () => setHovered((current) => current === id ? null : current) : undefined}
            flexShrink={0}
          >
            <Text>
              <Text bold={Boolean(lit)} color={hint.onPress ? colors.accent : colors.text}>{hint.keys}</Text>
              <Text color={lit ? colors.text : colors.textMuted} underline={Boolean(lit)}> {hint.label}</Text>
            </Text>
          </Clickable>
        );
      })}
    </Box>
  );
}
