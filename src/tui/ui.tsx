import { Box, Spacer, Text } from "ink";
import type { ComponentProps, ReactNode } from "react";
import type { ManagerCategory } from "../detectors/types.ts";
import { colors, glyphs, mixColor } from "../ui/theme.ts";
import { VERSION } from "../utils/version.ts";
import { Clickable, type PointerHandlers } from "./mouse.tsx";
import { usePulse } from "./motion.ts";
import { useTerminalSize } from "./use-terminal-size.ts";

export function Rule({ color = colors.border }: { color?: string }) {
  const { columns } = useTerminalSize();
  return <Text color={color}>{(glyphs().ok === "v" ? "-" : "─").repeat(Math.max(10, columns - 2))}</Text>;
}

interface HeaderProps {
  title?: string;
  titleColor?: string;
  right?: ReactNode;
  dryRun?: boolean;
}

/** En-tête commun : marque, titre de l'écran, état à droite, puis un filet discret. */
export function Header({ title, titleColor = colors.text, right, dryRun }: HeaderProps) {
  return (
    <Box flexDirection="column" marginBottom={1}>
      <Box>
        <Text bold color={colors.accent}>nxtupdate</Text>
        {title && (
          <>
            <Text color={colors.border}> / </Text>
            <Text bold color={titleColor}>{title}</Text>
          </>
        )}
        {dryRun && <Text color={colors.warning}>  dry run</Text>}
        <Spacer />
        {right ?? <Text color={colors.textMuted}>v{VERSION}</Text>}
      </Box>
      <Rule />
    </Box>
  );
}

const SECTION_LABEL: Record<ManagerCategory, string> = {
  ai: "AI AGENTS",
  packages: "PACKAGES",
  system: "SYSTEM",
};

export function sectionColor(category: ManagerCategory | undefined): string {
  return category === "ai" ? colors.accent : colors.textMuted;
}

export function SectionLabel({ category }: { category: ManagerCategory | undefined }) {
  const key = category ?? "packages";
  return (
    <Text wrap="truncate-end">
      {key === "ai" && <Text color={colors.accent}>{glyphs().managers.ai} </Text>}
      <Text bold color={colors.textMuted}>{SECTION_LABEL[key]}</Text>
    </Text>
  );
}

/** Étiquette discrète (méthode d'installation, état) : du texte atténué, sans cadre. */
export function Tag({ children, color = colors.textMuted }: { children: string; color?: string }) {
  return <Text color={color}>{children}</Text>;
}

const DELTA_COLOR = { MAJOR: colors.danger, minor: colors.warning, patch: colors.success } as const;

export function DeltaTag({ delta }: { delta: keyof typeof DELTA_COLOR | null }) {
  if (!delta) return null;
  return <Text color={DELTA_COLOR[delta]}> {delta}</Text>;
}

/** Pointeur de la ligne active : il apparaît en fondu depuis la couleur du filet. */
export function Pointer({ active }: { active: boolean }) {
  const t = usePulse(active, 160);
  if (!active) return <Text>  </Text>;
  return <Text bold color={mixColor(colors.border, colors.accent, t)}>{glyphs().pointer} </Text>;
}

type RowProps = PointerHandlers & {
  active: boolean;
  children: ReactNode;
} & Omit<ComponentProps<typeof Box>, "ref">;

/** Ligne focusable partagée par les listes et le menu : pointeur animé, clic et survol. */
export function Row({ active, children, onClick, onHover, onLeave, ...boxProps }: RowProps) {
  return (
    <Clickable onClick={onClick} onHover={onHover} onLeave={onLeave} {...boxProps}>
      <Pointer active={active} />
      <Box flexGrow={1} flexDirection="column">{children}</Box>
    </Clickable>
  );
}

/** Case à cocher : passe brièvement par l'état intermédiaire quand on la coche ou la décoche. */
export function Check({ state, color }: { state: "on" | "off" | "partial"; color: string }) {
  const g = glyphs();
  const t = usePulse(state, 140);
  const glyph = t < 1 && state !== "partial" ? g.partial : state === "on" ? g.checked : state === "partial" ? g.partial : g.unchecked;
  return <Text color={state === "off" ? colors.textMuted : color}>{glyph} </Text>;
}
