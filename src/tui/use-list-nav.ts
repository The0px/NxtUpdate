import type { Key } from "ink";
import { useEffect, useRef, useState } from "react";
import type { ManagerCategory } from "../detectors/types.ts";
import { useMouseWheel } from "./mouse.tsx";

interface NavState {
  cursor: number;
  scroll: number;
}

function nearestFocusable(
  target: number,
  count: number,
  direction: -1 | 1,
  focusable: (index: number) => boolean,
): number {
  const start = Math.max(0, Math.min(target, count - 1));
  for (const dir of [direction, -direction as -1 | 1]) {
    for (let index = start; index >= 0 && index < count; index += dir) {
      if (focusable(index)) return index;
    }
  }
  return 0;
}

/**
 * Curseur et défilement partagés par les listes : les lignes non focusables
 * (titres de section) sont sautées mais restent visibles au-dessus de leur groupe.
 */
export function useListNav(
  count: number,
  visibleCount: number,
  focusable: (index: number) => boolean = () => true,
) {
  const [nav, setNav] = useState<NavState>(() => ({
    cursor: count > 0 ? nearestFocusable(0, count, 1, focusable) : 0,
    scroll: 0,
  }));
  const latest = useRef({ count, visibleCount, focusable });
  latest.current = { count, visibleCount, focusable };

  const place = (previous: NavState, target: number, direction: -1 | 1): NavState => {
    const { count: total, visibleCount: visible, focusable: canFocus } = latest.current;
    if (total === 0) return { cursor: 0, scroll: 0 };
    const cursor = nearestFocusable(target, total, direction, canFocus);
    const top = cursor > 0 && !canFocus(cursor - 1) ? cursor - 1 : cursor;
    let scroll = previous.scroll;
    if (top < scroll) scroll = top;
    if (cursor >= scroll + visible) scroll = cursor - visible + 1;
    scroll = Math.max(0, Math.min(scroll, Math.max(0, total - visible)));
    return { cursor, scroll };
  };

  const moveTo = (target: number, direction: -1 | 1 = 1) => {
    setNav((previous) => place(previous, target, direction));
  };

  const moveBy = (delta: number) => {
    setNav((previous) => place(previous, previous.cursor + delta, delta < 0 ? -1 : 1));
  };

  useEffect(() => {
    setNav((previous) => place(previous, Math.min(previous.cursor, Math.max(0, count - 1)), 1));
  }, [count, visibleCount]);

  useMouseWheel((direction) => moveBy(direction));

  /** Traite les touches de déplacement ; renvoie true si la touche a été consommée. */
  const handleNavKey = (input: string, key: Key): boolean => {
    if (key.upArrow || input === "k") moveBy(-1);
    else if (key.downArrow || input === "j") moveBy(1);
    else if (key.pageUp) moveBy(-visibleCount);
    else if (key.pageDown) moveBy(visibleCount);
    else if (key.home || input === "g") moveTo(0, 1);
    else if (key.end || input === "G") moveTo(count - 1, -1);
    else return false;
    return true;
  };

  return { ...nav, moveTo, moveBy, handleNavKey };
}

const CATEGORY_ORDER: ManagerCategory[] = ["ai", "packages", "system"];

/** Trie les groupes par catégorie (agents IA en tête) en gardant l'ordre de détection à l'intérieur. */
export function orderByCategory<T extends { manager: { category?: ManagerCategory } }>(items: T[]): T[] {
  const rank = (item: T) => CATEGORY_ORDER.indexOf(item.manager.category ?? "packages");
  return items
    .map((item, index) => ({ item, index }))
    .sort((a, b) => rank(a.item) - rank(b.item) || a.index - b.index)
    .map(({ item }) => item);
}
