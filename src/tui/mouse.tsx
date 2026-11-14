import { Box, useStdin, type DOMElement } from "ink";
import {
  createContext,
  useContext,
  useEffect,
  useRef,
  type ComponentProps,
  type ReactNode,
  type RefObject,
} from "react";

// 1000 : clics et molette ; 1003 : mouvements, pour le survol ; 1006 : coordonnées SGR sans limite à 223 colonnes.
export const MOUSE_ON = "\x1b[?1000h\x1b[?1003h\x1b[?1006h";
export const MOUSE_OFF = "\x1b[?1006l\x1b[?1003l\x1b[?1000l";

export interface MouseEvent {
  x: number;
  y: number;
  button: "left" | "middle" | "right" | "wheel-up" | "wheel-down" | "move";
  release: boolean;
}

const SGR_MOUSE = /^\u001B?\[<(\d+);(\d+);(\d+)([mM])$/;

export function parseMouse(sequence: string): MouseEvent | null {
  const match = sequence.match(SGR_MOUSE);
  if (!match) return null;
  const code = Number(match[1]);
  const position = { x: Number(match[2]) - 1, y: Number(match[3]) - 1 };
  if (code & 32) return { ...position, button: "move", release: false };
  const buttons = ["left", "middle", "right"] as const;
  const button = code & 64
    ? (code & 1 ? "wheel-down" : "wheel-up")
    : buttons[code & 3];
  if (!button) return null;
  return { ...position, button, release: match[4] === "m" };
}

export function isMouseInput(input: string): boolean {
  return SGR_MOUSE.test(input);
}

interface Target {
  ref: RefObject<DOMElement | null>;
  onClick: () => void;
  hoverable: () => boolean;
  onHover: () => void;
  onLeave: () => void;
}

interface Registry {
  targets: Set<Target>;
  wheel: Set<(direction: -1 | 1) => void>;
}

const MouseContext = createContext<Registry | null>(null);

interface Rect { left: number; top: number; width: number; height: number }

/** Position absolue d'un nœud Ink : Yoga ne donne que des positions relatives au parent. */
function absoluteRect(node: DOMElement): Rect | null {
  const yoga = node.yogaNode;
  if (!yoga) return null;
  let left = 0;
  let top = 0;
  let current: DOMElement | undefined = node;
  while (current?.yogaNode) {
    left += current.yogaNode.getComputedLeft();
    top += current.yogaNode.getComputedTop();
    current = current.parentNode;
  }
  return { left, top, width: yoga.getComputedWidth(), height: yoga.getComputedHeight() };
}

function hitTest(targets: Iterable<Target>, x: number, y: number): Target | undefined {
  let best: { target: Target; area: number } | undefined;
  for (const target of targets) {
    const node = target.ref.current;
    const rect = node ? absoluteRect(node) : null;
    if (!rect || rect.width === 0 || rect.height === 0) continue;
    const inside = x >= rect.left && x < rect.left + rect.width && y >= rect.top && y < rect.top + rect.height;
    if (!inside) continue;
    const area = rect.width * rect.height;
    if (!best || area < best.area) best = { target, area };
  }
  return best?.target;
}

export function MouseProvider({ enabled, children }: { enabled: boolean; children: ReactNode }) {
  const registry = useRef<Registry>({ targets: new Set(), wheel: new Set() }).current;
  const { internal_eventEmitter: events, isRawModeSupported, setRawMode } = useStdin();

  useEffect(() => {
    if (!enabled || !isRawModeSupported) return;
    setRawMode(true);
    let hovered: Target | undefined;
    const onInput = (data: string) => {
      const event = parseMouse(data);
      if (!event || event.release) return;
      if (event.button === "move") {
        // Le terminal envoie un événement par cellule : on ne prévient que lorsque la cible change.
        const target = hitTest([...registry.targets].filter((entry) => entry.hoverable()), event.x, event.y);
        if (target === hovered) return;
        hovered?.onLeave();
        hovered = target;
        target?.onHover();
        return;
      }
      if (event.button === "wheel-up" || event.button === "wheel-down") {
        const direction = event.button === "wheel-up" ? -1 : 1;
        registry.wheel.forEach((listener) => listener(direction));
        return;
      }
      if (event.button === "left") hitTest(registry.targets, event.x, event.y)?.onClick();
    };
    events.on("input", onInput);
    return () => {
      events.removeListener("input", onInput);
      setRawMode(false);
    };
  }, [enabled, events, isRawModeSupported, setRawMode, registry]);

  return <MouseContext.Provider value={enabled ? registry : null}>{children}</MouseContext.Provider>;
}

export interface PointerHandlers {
  onClick?: () => void;
  /** Appelé quand le pointeur entre dans la zone : sert à déplacer le focus au survol. */
  onHover?: () => void;
  onLeave?: () => void;
}

export function useClickable(handlers: PointerHandlers): RefObject<DOMElement | null> {
  const ref = useRef<DOMElement | null>(null);
  const registry = useContext(MouseContext);
  const latest = useRef(handlers);
  latest.current = handlers;

  useEffect(() => {
    if (!registry) return;
    const target: Target = {
      ref,
      onClick: () => latest.current.onClick?.(),
      hoverable: () => Boolean(latest.current.onHover || latest.current.onLeave),
      onHover: () => latest.current.onHover?.(),
      onLeave: () => latest.current.onLeave?.(),
    };
    registry.targets.add(target);
    return () => {
      registry.targets.delete(target);
    };
  }, [registry]);

  return ref;
}

export function useMouseWheel(onWheel: (direction: -1 | 1) => void): void {
  const registry = useContext(MouseContext);
  const handler = useRef(onWheel);
  handler.current = onWheel;

  useEffect(() => {
    if (!registry) return;
    const listener = (direction: -1 | 1) => handler.current(direction);
    registry.wheel.add(listener);
    return () => {
      registry.wheel.delete(listener);
    };
  }, [registry]);
}

/** Zone cliquable : une Box ordinaire quand la souris est désactivée. */
export function Clickable({
  onClick,
  onHover,
  onLeave,
  children,
  ...boxProps
}: PointerHandlers & { children: ReactNode } & Omit<ComponentProps<typeof Box>, "ref">) {
  const ref = useClickable({ onClick, onHover, onLeave });
  return <Box ref={ref} {...boxProps}>{children}</Box>;
}
