import { Box, Text } from "ink";
import { useMemo, useState } from "react";
import type { ManagerData } from "./app.tsx";
import type { ManagerCategory, OutdatedPackage } from "../detectors/types.ts";
import { getVersionDelta } from "../utils/version.ts";
import { colors, glyphs, managerIcon } from "../ui/theme.ts";
import { KeyHints } from "./key-hints.tsx";
import { getViewportRows, useTerminalSize } from "./use-terminal-size.ts";
import { usePackagePath } from "./use-package-path.ts";
import { useKeys } from "./use-keys.ts";
import { orderByCategory, useListNav } from "./use-list-nav.ts";
import { DeltaTag, Header, Row, SectionLabel, Tag } from "./ui.tsx";

interface Props {
  managers: ManagerData[];
  onBack: () => void;
}

type FlatItem =
  | { type: "section"; category: ManagerCategory | undefined }
  | { type: "manager"; index: number; manager: ManagerData }
  | { type: "package"; managerIdx: number; pkgIdx: number; pkg: OutdatedPackage };

export function ListScreen({ managers, onBack }: Props) {
  const g = glyphs();
  const { columns, rows } = useTerminalSize();
  const compact = columns < 96 || rows < 28;

  const withOutdated = useMemo(
    () => orderByCategory(managers.filter((manager) => manager.outdated.length > 0)),
    [managers]
  );
  const skipped = useMemo(
    () => managers.filter((manager) => manager.manager.skipReason),
    [managers]
  );
  const [expanded, setExpanded] = useState<Set<number>>(
    () => new Set(withOutdated.map((_, index) => index))
  );
  const skippedPanelRows = skipped.length > 0 ? skipped.length + 3 : 0;
  const visibleCount = getViewportRows(rows, (compact ? 7 : 8) + skippedPanelRows, 20);
  const totalOutdated = withOutdated.reduce((sum, manager) => sum + manager.outdated.length, 0);
  const showSections = withOutdated.some((manager) => manager.manager.category === "ai")
    || new Set(withOutdated.map((manager) => manager.manager.category ?? "packages")).size > 1;

  const flatItems: FlatItem[] = useMemo(() => {
    const items: FlatItem[] = [];
    let lastCategory: string | undefined;
    withOutdated.forEach((manager, index) => {
      const category = manager.manager.category ?? "packages";
      if (showSections && category !== lastCategory) {
        items.push({ type: "section", category });
        lastCategory = category;
      }
      items.push({ type: "manager", index, manager });
      if (expanded.has(index)) {
        manager.outdated.forEach((pkg, pkgIdx) => items.push({ type: "package", managerIdx: index, pkgIdx, pkg }));
      }
    });
    return items;
  }, [withOutdated, expanded, showSections]);

  const nav = useListNav(flatItems.length, visibleCount, (index) => flatItems[index]?.type !== "section");

  const activeItem = flatItems[nav.cursor];
  const activeManager = activeItem?.type === "package" ? withOutdated[activeItem.managerIdx] : undefined;
  const activePath = usePackagePath(
    activeManager?.manager.name,
    activeItem?.type === "package" ? activeItem.pkg.name : undefined,
    activeItem?.type === "package" ? activeItem.pkg.path ?? "" : ""
  );

  const toggleExpanded = (index: number) => {
    setExpanded((previous) => {
      const next = new Set(previous);
      next.has(index) ? next.delete(index) : next.add(index);
      return next;
    });
  };

  useKeys((input, key) => {
    const item = flatItems[nav.cursor];

    if (key.escape || input === "q") return onBack();
    if (nav.handleNavKey(input, key)) return;
    if (key.leftArrow) {
      if (item?.type === "package") {
        const header = flatItems.findIndex((entry) => entry.type === "manager" && entry.index === item.managerIdx);
        if (header >= 0) nav.moveTo(header);
        return;
      }
      if (item?.type === "manager" && expanded.has(item.index)) return toggleExpanded(item.index);
      return onBack();
    }
    if ((key.return || key.rightArrow || input === " ") && item?.type === "manager") {
      const willExpand = !expanded.has(item.index);
      toggleExpanded(item.index);
      if (willExpand) nav.moveTo(nav.cursor + 1);
    }
  });

  const visible = flatItems.slice(nav.scroll, nav.scroll + visibleCount);
  const showUp = nav.scroll > 0;
  const showDown = nav.scroll + visibleCount < flatItems.length;

  const focus = (index: number) => () => { if (index !== nav.cursor) nav.moveTo(index); };

  return (
    <Box flexDirection="column" paddingX={1}>
      <Header
        title="Outdated"
        right={(
          <Text>
            <Text bold color={colors.warning}>{totalOutdated}</Text>
            <Text color={colors.textMuted}> across {withOutdated.length} source(s)</Text>
          </Text>
        )}
      />

      {withOutdated.length === 0 && skipped.length === 0 && (
        <Text color={colors.success}>  {g.ok} Everything is up to date!</Text>
      )}

      {skipped.length > 0 && (
        <Box flexDirection="column">
          {withOutdated.length === 0 && <Text color={colors.success}>  {g.ok} No actionable updates</Text>}
          {skipped.map((manager) => (
            <Text key={manager.manager.name} color={colors.textMuted} wrap="truncate-end">
              {"  "}<Text color={colors.warning}>{g.skip}</Text> {manager.manager.name} skipped · {manager.manager.skipReason}
            </Text>
          ))}
        </Box>
      )}

      {flatItems.length > 0 && <Text color={colors.textMuted}>{showUp ? `  ↑ ${nav.scroll} more` : " "}</Text>}

      {flatItems.length > 0 && (
        <Box flexDirection="column">
          {visible.map((item, visibleIndex) => {
            const index = nav.scroll + visibleIndex;
            const active = index === nav.cursor;

            if (item.type === "section") {
              return (
                <Box key={`s-${item.category}`} marginTop={visibleIndex === 0 ? 0 : 1} marginLeft={2}>
                  <SectionLabel category={item.category} />
                </Box>
              );
            }

            if (item.type === "manager") {
              const manager = item.manager;
              const hasMajor = manager.outdated.some(
                (pkg) => !pkg.uncertain && getVersionDelta(pkg.current, pkg.latest) === "MAJOR"
              );
              return (
                <Row
                  key={`m-${item.index}`}
                  active={active}
                  onHover={focus(index)}
                  onClick={() => { nav.moveTo(index); toggleExpanded(item.index); }}
                >
                  <Text wrap="truncate-end">
                    <Text color={colors.textMuted}>{expanded.has(item.index) ? g.expanded : g.collapsed} {managerIcon(manager.manager)} </Text>
                    <Text bold color={active ? colors.accent : colors.text}>{manager.manager.name}</Text>
                    <Text color={colors.textMuted}>  {manager.outdated.length}</Text>
                    {hasMajor && <Text color={colors.danger}>  {g.warn} major</Text>}
                  </Text>
                </Row>
              );
            }

            const delta = item.pkg.uncertain ? null : getVersionDelta(item.pkg.current, item.pkg.latest);
            return (
              <Row
                key={`p-${item.managerIdx}-${item.pkgIdx}`}
                active={active}
                onHover={focus(index)}
                onClick={() => nav.moveTo(index)}
                marginLeft={2}
              >
                <Text wrap="truncate-middle">
                  <Text bold={active} color={active ? colors.accent : colors.text}>{item.pkg.name}</Text>
                  <Text color={colors.textMuted}>  {item.pkg.current} {g.arrow} {item.pkg.uncertain ? "latest unknown" : item.pkg.latest}</Text>
                  {item.pkg.method && <Text>  </Text>}
                  {item.pkg.method && <Tag>{item.pkg.method}</Tag>}
                  <DeltaTag delta={delta} />
                </Text>
                {active && (activePath.loading || activePath.path) && (
                  <Text color={colors.textMuted} wrap="truncate-middle">
                    {activePath.loading ? "Resolving install location…" : activePath.path}
                  </Text>
                )}
              </Row>
            );
          })}
        </Box>
      )}

      {flatItems.length > 0 && <Text color={colors.textMuted}>{showDown ? `  ↓ ${flatItems.length - nav.scroll - visibleCount} more` : " "}</Text>}

      <KeyHints
        compact={compact}
        hints={flatItems.length > 0
          ? [
              { keys: "enter", label: "fold" },
              { keys: "↑↓", label: "move" },
              { keys: "pgup/pgdn", label: "page" },
              { keys: "esc", label: "back", onPress: onBack },
            ]
          : [{ keys: "esc", label: "back", onPress: onBack }]}
      />
    </Box>
  );
}
