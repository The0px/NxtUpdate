import { Box, Text, useApp } from "ink";
import { useEffect } from "react";
import type { ManagerData } from "./app.tsx";
import type { CliOptions } from "../detectors/types.ts";
import type { UpdateInfo } from "../utils/version.ts";
import { getVersionDelta } from "../utils/version.ts";
import { colors, glyphs, managerIcon } from "../ui/theme.ts";
import { KeyHints } from "./key-hints.tsx";
import { useTerminalSize } from "./use-terminal-size.ts";
import { useKeys } from "./use-keys.ts";
import { orderByCategory } from "./use-list-nav.ts";
import { Clickable } from "./mouse.tsx";
import { useReveal } from "./motion.ts";
import { DeltaTag, Header, Row, SectionLabel, Tag } from "./ui.tsx";

interface Props {
  managers: ManagerData[];
  options: CliOptions;
  updateInfo: UpdateInfo | null;
  selected: number;
  onSelectionChange: (index: number) => void;
  onStartUpdate: () => void;
  onUpdateAgents?: () => void;
  onUninstall: () => void;
  onViewList: () => void;
  onViewMoleTip: () => void;
}

export type MenuAction = "update" | "agents" | "uninstall" | "mole-tip" | "list" | "quit";

export function isMenuActionDisabled(
  action: MenuAction | undefined,
  totalOutdated: number,
  agentsOutdated = 0,
): boolean {
  if (action === "update") return totalOutdated === 0;
  if (action === "agents") return agentsOutdated === 0;
  return false;
}

type IconKey = "update" | "uninstall" | "list" | "app" | "quit" | "ai";

const menuItems: { label: string; action: MenuAction; icon: IconKey; hint: string; key: string }[] = [
  { label: "Update everything",    action: "update",    icon: "update",    hint: "Select and update outdated agents and packages", key: "u" },
  { label: "Update AI agents",     action: "agents",    icon: "ai",        hint: "Claude, Codex, Cursor, Vibe and more", key: "i" },
  { label: "Uninstall",            action: "uninstall", icon: "uninstall", hint: "Remove AI agents or packages after review", key: "x" },
  { label: "View outdated list",   action: "list",      icon: "list",      hint: "Browse every outdated package", key: "l" },
  { label: "Mole for macOS apps",  action: "mole-tip",  icon: "app",       hint: "Open Mole CLI instructions and application link", key: "m" },
  { label: "Quit",                 action: "quit",      icon: "quit",      hint: "Exit NxtUpdate", key: "q" },
];

export function MainMenu({
  managers,
  options,
  updateInfo,
  selected,
  onSelectionChange,
  onStartUpdate,
  onUpdateAgents,
  onUninstall,
  onViewList,
  onViewMoleTip,
}: Props) {
  const g = glyphs();
  const { exit } = useApp();
  const { columns, rows } = useTerminalSize();
  const compact = columns < 96 || rows < 28;
  const ordered = orderByCategory(managers);
  const withOutdated = ordered.filter((manager) => manager.outdated.length > 0);
  const skipped = ordered.filter((manager) => manager.manager.skipReason);
  const upToDate = ordered.filter((manager) => manager.outdated.length === 0 && !manager.manager.skipReason);
  const totalOutdated = withOutdated.reduce((sum, manager) => sum + manager.outdated.length, 0);
  const agents = withOutdated.find((manager) => manager.manager.category === "ai");
  const agentsOutdated = agents?.outdated.length ?? 0;
  const packageManagers = withOutdated.filter((manager) => manager.manager.category !== "ai");

  const isDisabled = (index: number) =>
    isMenuActionDisabled(menuItems[index]?.action, totalOutdated, agentsOutdated)
    || (menuItems[index]?.action === "agents" && !onUpdateAgents);

  const moveSelection = (direction: -1 | 1) => {
    for (let step = 1; step <= menuItems.length; step++) {
      const next = (selected + direction * step + menuItems.length) % menuItems.length;
      if (!isDisabled(next)) {
        onSelectionChange(next);
        return;
      }
    }
  };

  const doSelect = (index: number) => {
    if (isDisabled(index)) return;
    switch (menuItems[index]!.action) {
      case "update":    onStartUpdate(); break;
      case "agents":    onUpdateAgents?.(); break;
      case "uninstall": onUninstall(); break;
      case "mole-tip":  onViewMoleTip(); break;
      case "list":      onViewList(); break;
      case "quit":      exit(); break;
    }
  };

  useEffect(() => {
    if (isDisabled(selected)) {
      const firstAvailable = menuItems.findIndex((_, index) => !isDisabled(index));
      if (firstAvailable >= 0) onSelectionChange(firstAvailable);
    }
  }, [totalOutdated, agentsOutdated, selected]);

  useKeys((input, key) => {
    if (key.upArrow || input === "k") return moveSelection(-1);
    if (key.downArrow || input === "j") return moveSelection(1);
    if (key.return || key.rightArrow) return doSelect(selected);
    const byKey = menuItems.findIndex((item) => item.key === input);
    if (byKey >= 0 && !isDisabled(byKey)) {
      onSelectionChange(byKey);
      doSelect(byKey);
    }
  });

  const agentPreview = agents?.outdated.slice(0, compact ? 2 : 4) ?? [];
  const previewManagers = packageManagers.slice(0, compact ? 2 : Math.max(3, rows - 22));
  const iconFor = (icon: IconKey) => icon === "ai" ? g.managers.ai! : g[icon];
  const revealed = useReveal(menuItems.length);

  const actions = (
    <Box flexDirection="column" width={compact ? "100%" : 34} flexShrink={0}>
      {menuItems.slice(0, revealed).map((item, index) => {
        const active = index === selected;
        const disabled = isDisabled(index);
        const color = disabled ? colors.textMuted : active ? colors.accent : colors.text;
        return (
          <Row
            key={item.action}
            active={active}
            onHover={disabled ? undefined : () => { if (index !== selected) onSelectionChange(index); }}
            onClick={() => {
              if (disabled) return;
              onSelectionChange(index);
              doSelect(index);
            }}
          >
            <Text wrap="truncate-end">
              <Text color={disabled ? colors.textMuted : item.action === "agents" ? colors.accent : colors.textMuted}>{iconFor(item.icon)} </Text>
              <Text bold={active} color={color} dimColor={disabled}>{item.label}</Text>
              <Text color={colors.border}>  {item.key}</Text>
            </Text>
          </Row>
        );
      })}
      <Box marginTop={1} marginLeft={2}>
        <Text color={colors.textMuted} wrap="wrap">{menuItems[selected]?.hint ?? ""}</Text>
      </Box>
    </Box>
  );

  const status = (
    <Box flexDirection="column" flexGrow={1} marginTop={compact ? 1 : 0}>
      {totalOutdated > 0 ? (
        <Text>
          <Text bold color={colors.warning}>{totalOutdated}</Text>
          <Text color={colors.textMuted}> update(s) available across {withOutdated.length} source(s)</Text>
        </Text>
      ) : (
        <Text color={colors.success}>
          {g.ok} {skipped.length > 0 ? "No actionable updates" : "Everything is up to date"}
        </Text>
      )}

      {agents && (
        <Clickable flexDirection="column" marginTop={1} onClick={onUpdateAgents}>
          <SectionLabel category="ai" />
          {agentPreview.map((pkg) => (
            <Text key={pkg.name} wrap="truncate-middle">
              {"  "}{pkg.name}
              <Text color={colors.textMuted}>  {pkg.current} {g.arrow} {pkg.uncertain ? "?" : pkg.latest}  </Text>
              {pkg.method && <Tag>{pkg.method}</Tag>}
            </Text>
          ))}
          {agentsOutdated > agentPreview.length && (
            <Text color={colors.textMuted}>  …and {agentsOutdated - agentPreview.length} more</Text>
          )}
        </Clickable>
      )}

      {previewManagers.length > 0 && (
        <Box flexDirection="column" marginTop={1}>
          <SectionLabel category="packages" />
          {previewManagers.map((manager) => (
            <Box key={manager.manager.name} flexDirection="column">
              <Text wrap="truncate-end">
                {"  "}<Text color={colors.textMuted}>{managerIcon(manager.manager)} </Text>
                {manager.manager.name}
                <Text color={colors.warning}>  {manager.outdated.length}</Text>
              </Text>
              {!compact && manager.outdated.slice(0, 2).map((pkg) => (
                <Text key={pkg.name} wrap="truncate-middle" color={colors.textMuted}>
                  {"     "}{pkg.name}  {pkg.current} {g.arrow} {pkg.latest}
                  <DeltaTag delta={getVersionDelta(pkg.current, pkg.latest)} />
                </Text>
              ))}
            </Box>
          ))}
          {packageManagers.length > previewManagers.length && (
            <Text color={colors.textMuted}>  …and {packageManagers.length - previewManagers.length} more</Text>
          )}
        </Box>
      )}

      {(upToDate.length > 0 || skipped.length > 0) && (
        <Box flexDirection="column" marginTop={1}>
          {upToDate.length > 0 && (
            <Text color={colors.textMuted} wrap="truncate-end">
              <Text color={colors.success}>{g.ok}</Text> {upToDate.map((manager) => manager.manager.name).join(", ")} up to date
            </Text>
          )}
          {skipped.map((manager) => (
            <Text key={manager.manager.name} color={colors.textMuted} wrap="truncate-end">
              <Text color={colors.warning}>{g.skip}</Text> {manager.manager.name} skipped · {manager.manager.skipReason}
            </Text>
          ))}
        </Box>
      )}
    </Box>
  );

  return (
    <Box flexDirection="column" paddingX={1}>
      <Header dryRun={options.dryRun} />

      {updateInfo?.hasUpdate && (
        <Box marginBottom={1}>
          <Text>
            <Text color={colors.warning}>{g.warn} NxtUpdate v{updateInfo.latest} is available</Text>
            <Text color={colors.textMuted}> (v{updateInfo.current}){compact ? "" : " · npm i -g nxtupdate"}</Text>
          </Text>
        </Box>
      )}

      <Box flexDirection={compact ? "column" : "row"} columnGap={4}>
        {actions}
        {status}
      </Box>

      <KeyHints
        compact={compact}
        hints={[
          { keys: "enter", label: "select", onPress: () => doSelect(selected) },
          { keys: "↑↓", label: "move" },
          { keys: "u i x l m", label: "shortcuts" },
          { keys: "q", label: "quit", onPress: exit },
        ]}
      />
    </Box>
  );
}
