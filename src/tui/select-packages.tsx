import { Box, Text, Spacer } from "ink";
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
import { Clickable } from "./mouse.tsx";
import { Check, DeltaTag, Header, Row, SectionLabel, Tag } from "./ui.tsx";

interface Props {
  managers: ManagerData[];
  title: string;
  mode?: "update" | "uninstall";
  initialSelected?: ManagerData[];
  dryRun?: boolean;
  onConfirm: (selected: ManagerData[]) => void;
  onBack: () => void;
}

type FlatItem =
  | { type: "section"; category: ManagerCategory | undefined }
  | { type: "header"; managerIdx: number; manager: ManagerData; selectedCount: number }
  | { type: "package"; managerIdx: number; pkgIdx: number; pkg: OutdatedPackage; checked: boolean };

const keyOf = (managerIdx: number, pkgIdx: number) => `${managerIdx}-${pkgIdx}`;

export function SelectPackagesScreen({
  managers,
  title,
  mode = "update",
  initialSelected = [],
  dryRun,
  onConfirm,
  onBack,
}: Props) {
  const g = glyphs();
  const { columns, rows } = useTerminalSize();
  const compact = columns < 96 || rows < 28;
  const visibleCount = getViewportRows(rows, compact ? 10 : 11, 18);
  const withPackages = useMemo(
    () => orderByCategory(managers.filter((manager) => manager.outdated.length > 0)),
    [managers]
  );
  const showSections = new Set(withPackages.map((manager) => manager.manager.category ?? "packages")).size > 1
    || withPackages.some((manager) => manager.manager.category === "ai");

  const [expanded, setExpanded] = useState<Set<number>>(
    () => new Set(withPackages.map((_, index) => index))
  );
  const [checked, setChecked] = useState<Set<string>>(() => {
    const selected = new Set<string>();
    if (mode === "uninstall") {
      const byManager = new Map(
        initialSelected.map((manager) => [manager.manager.name, new Set(manager.outdated.map((pkg) => pkg.name))])
      );
      withPackages.forEach((manager, managerIdx) => {
        manager.outdated.forEach((pkg, pkgIdx) => {
          if (!pkg.blocked && byManager.get(manager.manager.name)?.has(pkg.name)) selected.add(keyOf(managerIdx, pkgIdx));
        });
      });
      return selected;
    }
    // Une version distante non vérifiée ne se met pas à jour sans choix explicite.
    withPackages.forEach((manager, managerIdx) => {
      manager.outdated.forEach((pkg, pkgIdx) => {
        if (!pkg.uncertain && !pkg.blocked) selected.add(keyOf(managerIdx, pkgIdx));
      });
    });
    return selected;
  });
  const [filterMode, setFilterMode] = useState(false);
  const [filterText, setFilterText] = useState("");

  const flatItems: FlatItem[] = useMemo(() => {
    const query = filterText.toLowerCase();
    const items: FlatItem[] = [];
    let lastCategory: string | undefined;

    withPackages.forEach((manager, managerIdx) => {
      if (filterText) {
        manager.outdated.forEach((pkg, pkgIdx) => {
          if (pkg.name.toLowerCase().includes(query)) {
            items.push({ type: "package", managerIdx, pkgIdx, pkg, checked: checked.has(keyOf(managerIdx, pkgIdx)) });
          }
        });
        return;
      }

      const category = manager.manager.category ?? "packages";
      if (showSections && category !== lastCategory) {
        items.push({ type: "section", category });
        lastCategory = category;
      }
      const selectedCount = manager.outdated.reduce(
        (count, _, pkgIdx) => count + (checked.has(keyOf(managerIdx, pkgIdx)) ? 1 : 0),
        0
      );
      items.push({ type: "header", managerIdx, manager, selectedCount });
      if (expanded.has(managerIdx)) {
        manager.outdated.forEach((pkg, pkgIdx) => {
          items.push({ type: "package", managerIdx, pkgIdx, pkg, checked: checked.has(keyOf(managerIdx, pkgIdx)) });
        });
      }
    });

    return items;
  }, [withPackages, checked, expanded, filterText, showSections]);

  const nav = useListNav(flatItems.length, visibleCount, (index) => flatItems[index]?.type !== "section");

  const activeItem = flatItems[nav.cursor];
  const activeManager = activeItem?.type === "package" ? withPackages[activeItem.managerIdx] : undefined;
  const activePath = usePackagePath(
    activeManager?.manager.name,
    activeItem?.type === "package" ? activeItem.pkg.name : undefined,
    activeItem?.type === "package" ? activeItem.pkg.path ?? "" : ""
  );

  const selectableKeys = (managerIdx: number) =>
    (withPackages[managerIdx]?.outdated ?? []).flatMap((pkg, pkgIdx) => pkg.blocked ? [] : [keyOf(managerIdx, pkgIdx)]);
  const allKeys = withPackages.flatMap((_, managerIdx) => selectableKeys(managerIdx));
  const totalChecked = checked.size;
  const totalPackages = allKeys.length;

  const togglePackage = (key: string) => {
    if (!allKeys.includes(key)) return;
    setChecked((previous) => {
      const next = new Set(previous);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  };

  const toggleManager = (managerIdx: number) => {
    const keys = selectableKeys(managerIdx);
    if (keys.length === 0) return;
    const allSelected = keys.every((key) => checked.has(key));
    setChecked((previous) => {
      const next = new Set(previous);
      keys.forEach((key) => allSelected ? next.delete(key) : next.add(key));
      return next;
    });
  };

  const toggleExpanded = (managerIdx: number) => {
    setExpanded((previous) => {
      const next = new Set(previous);
      next.has(managerIdx) ? next.delete(managerIdx) : next.add(managerIdx);
      return next;
    });
  };

  const selectAll = () => {
    if (totalChecked === totalPackages) {
      setChecked(new Set());
      return;
    }
    setChecked(new Set(allKeys));
  };

  const confirm = () => {
    if (totalChecked === 0) return;
    const selected: ManagerData[] = [];
    withPackages.forEach((manager, managerIdx) => {
      const packages = manager.outdated.filter((_, pkgIdx) => checked.has(keyOf(managerIdx, pkgIdx)));
      if (packages.length > 0) selected.push({ manager: manager.manager, outdated: packages });
    });
    onConfirm(selected);
  };

  const clearFilter = () => {
    setFilterMode(false);
    setFilterText("");
    nav.moveTo(0);
  };

  useKeys((input, key) => {
    if (filterMode) {
      if (key.escape) return clearFilter();
      if (key.return) return setFilterMode(false);
      if (key.backspace || key.delete) {
        setFilterText((text) => text.slice(0, -1));
        nav.moveTo(0);
        return;
      }
      if (input && !key.ctrl && !key.meta && !key.tab) {
        setFilterText((text) => (text + input).slice(0, 64));
        nav.moveTo(0);
      }
      return;
    }

    if (input === "/") return setFilterMode(true);
    if (key.escape) return filterText ? clearFilter() : onBack();
    if (input === "q") return onBack();
    if (nav.handleNavKey(input, key)) return;

    const item = flatItems[nav.cursor];

    if (key.leftArrow) {
      if (item?.type === "package" && !filterText) {
        const header = flatItems.findIndex((entry) => entry.type === "header" && entry.managerIdx === item.managerIdx);
        if (header >= 0) nav.moveTo(header);
        return;
      }
      if (item?.type === "header" && expanded.has(item.managerIdx)) return toggleExpanded(item.managerIdx);
      return onBack();
    }
    if (input === "a") return selectAll();
    if (key.rightArrow && item?.type === "header") {
      if (!expanded.has(item.managerIdx)) {
        toggleExpanded(item.managerIdx);
        nav.moveTo(nav.cursor + 1);
      }
      return;
    }
    if (input === " ") {
      if (item?.type === "header") toggleManager(item.managerIdx);
      else if (item?.type === "package") togglePackage(keyOf(item.managerIdx, item.pkgIdx));
      return;
    }
    if (key.return || input === "c") confirm();
  });

  const visible = flatItems.slice(nav.scroll, nav.scroll + visibleCount);
  const showUp = nav.scroll > 0;
  const showDown = nav.scroll + visibleCount < flatItems.length;
  const actionColor = mode === "uninstall" ? colors.danger : colors.success;
  const selectionColor = totalChecked === 0 ? colors.textMuted : actionColor;
  const focus = (index: number) => () => { if (index !== nav.cursor) nav.moveTo(index); };

  return (
    <Box flexDirection="column" paddingX={1}>
      <Header
        title={title}
        titleColor={mode === "uninstall" ? colors.danger : colors.text}
        dryRun={dryRun}
        right={<Text><Text bold color={selectionColor}>{totalChecked}</Text><Text color={colors.textMuted}>/{totalPackages} selected</Text></Text>}
      />

      <Clickable onClick={() => setFilterMode(true)}>
        {filterMode ? (
          <>
            <Text color={colors.accent}>/ </Text>
            <Text bold>{filterText}</Text>
            <Text color={colors.accent}>▏</Text>
            <Text color={colors.textMuted}>  esc to cancel</Text>
          </>
        ) : filterText ? (
          <Text wrap="truncate-end">
            <Text color={colors.accent}>/ </Text>{filterText}
            <Text color={colors.textMuted}>  {flatItems.length} match(es) · esc to clear</Text>
          </Text>
        ) : (
          <Text color={colors.textMuted} wrap="truncate-end">/ to search</Text>
        )}
      </Clickable>

      <Text color={colors.textMuted}>{showUp ? `  ↑ ${nav.scroll} more` : " "}</Text>

      <Box flexDirection="column">
        {visible.length === 0 && (
          <Text color={colors.textMuted}>
            {filterText
              ? `  No packages match "${filterText}"`
              : mode === "uninstall"
                ? "  No installed packages available."
                : `  ${g.ok} Everything is up to date.`}
          </Text>
        )}

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

          if (item.type === "header") {
            const total = selectableKeys(item.managerIdx).length;
            const state = total > 0 && item.selectedCount === total ? "on" : item.selectedCount > 0 ? "partial" : "off";
            return (
              <Row key={`h-${item.managerIdx}`} active={active} onHover={focus(index)}>
                <Box>
                  <Clickable onClick={() => { nav.moveTo(index); toggleManager(item.managerIdx); }}>
                    <Check state={state} color={actionColor} />
                  </Clickable>
                  <Clickable onClick={() => { nav.moveTo(index); toggleExpanded(item.managerIdx); }} flexGrow={1}>
                    <Text wrap="truncate-end">
                      <Text color={colors.textMuted}>{expanded.has(item.managerIdx) ? g.expanded : g.collapsed} {managerIcon(item.manager.manager)} </Text>
                      <Text bold color={active ? colors.accent : colors.text}>{item.manager.manager.name}</Text>
                      <Text color={colors.textMuted}>  {item.selectedCount}/{total}</Text>
                    </Text>
                  </Clickable>
                </Box>
              </Row>
            );
          }

          const delta = mode === "update" && !item.pkg.uncertain ? getVersionDelta(item.pkg.current, item.pkg.latest) : null;
          const blocked = item.pkg.blocked;
          return (
            <Row
              key={`p-${item.managerIdx}-${item.pkgIdx}`}
              active={active}
              onHover={focus(index)}
              onClick={() => { nav.moveTo(index); togglePackage(keyOf(item.managerIdx, item.pkgIdx)); }}
              marginLeft={filterText ? 0 : 2}
            >
              <Text wrap="truncate-middle">
                {blocked
                  ? <Text color={colors.border}>{g.skip} </Text>
                  : <Check state={item.checked ? "on" : "off"} color={actionColor} />}
                <Text bold={active} color={blocked ? colors.textMuted : active ? colors.accent : colors.text}>{item.pkg.name}</Text>
                {mode === "update"
                  ? <Text color={colors.textMuted}>  {item.pkg.current} {g.arrow} {item.pkg.uncertain ? "latest unknown" : item.pkg.latest}</Text>
                  : <Text color={colors.textMuted}>  {item.pkg.current}</Text>}
                {item.pkg.method && <Text>  </Text>}
                {item.pkg.method && <Tag>{item.pkg.method}</Tag>}
                <DeltaTag delta={delta} />
              </Text>
              {active && blocked && (
                <Text color={colors.warning} wrap="truncate-end">  {blocked}</Text>
              )}
              {active && !blocked && mode === "uninstall" && item.pkg.detail && (
                <Text color={colors.textMuted} wrap="truncate-middle">  {item.pkg.detail}</Text>
              )}
              {active && !blocked && mode === "update" && (activePath.loading || activePath.path) && (
                <Text color={colors.textMuted} wrap="truncate-middle">
                  {"  "}{activePath.loading ? "Resolving install location…" : activePath.path}
                </Text>
              )}
            </Row>
          );
        })}
      </Box>

      <Text color={colors.textMuted}>{showDown ? `  ↓ ${flatItems.length - nav.scroll - visibleCount} more` : " "}</Text>

      <KeyHints
        compact={compact}
        hints={[
          { keys: "enter", label: "continue", onPress: confirm },
          { keys: "space", label: "toggle" },
          { keys: "a", label: "all/none", onPress: selectAll },
          { keys: "/", label: "search", onPress: () => setFilterMode(true) },
          { keys: "←→", label: "fold" },
          { keys: "esc", label: "back", onPress: onBack },
        ]}
      />
    </Box>
  );
}
