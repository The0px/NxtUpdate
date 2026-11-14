import { useEffect, useRef, useState } from "react";

const FRAME_MS = 33;

// Désactivé par défaut : seul le TUI lancé dans un vrai terminal l'active, les rendus de test restent figés.
let animationAllowed = false;

export function setAnimation(enabled: boolean): void {
  animationAllowed = enabled;
}

/** Animations coupées par `--no-animation`, `NXTUPDATE_REDUCED_MOTION` ou une sortie qui n'est pas un terminal. */
export function motionEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  if (!animationAllowed) return false;
  const reduced = env.NXTUPDATE_REDUCED_MOTION?.toLowerCase();
  return !reduced || reduced === "0" || reduced === "false";
}

const easeOut = (t: number) => 1 - (1 - t) ** 3;

/** Fait glisser une valeur numérique vers sa cible ; renvoie la cible immédiatement sans animation. */
export function useTween(target: number, duration = 220): number {
  const animate = motionEnabled();
  const [value, setValue] = useState(target);
  const from = useRef(target);
  const current = useRef(target);
  current.current = value;

  useEffect(() => {
    if (!animate) {
      setValue(target);
      return;
    }
    from.current = current.current;
    const start = Date.now();
    const timer = setInterval(() => {
      const t = Math.min(1, (Date.now() - start) / duration);
      setValue(from.current + (target - from.current) * easeOut(t));
      if (t >= 1) clearInterval(timer);
    }, FRAME_MS);
    return () => clearInterval(timer);
  }, [target, duration, animate]);

  return animate ? value : target;
}

/** Nombre de lignes déjà révélées : elles apparaissent en cascade, puis tout reste affiché. */
export function useReveal(count: number, step = 40): number {
  const animate = motionEnabled();
  const [shown, setShown] = useState(animate ? 0 : count);

  useEffect(() => {
    if (!animate || shown >= count) return;
    const timer = setTimeout(() => setShown((value) => Math.min(count, value + 1)), step);
    return () => clearTimeout(timer);
  }, [animate, shown, count, step]);

  return animate ? shown : count;
}

/** Progression de 0 à 1 qui repart à chaque changement de `key` : fondus et pulsations brèves. */
export function usePulse(key: unknown, duration = 240): number {
  const animate = motionEnabled();
  const [t, setT] = useState(1);
  const first = useRef(true);

  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    if (!animate) return;
    const start = Date.now();
    setT(0);
    const timer = setInterval(() => {
      const next = Math.min(1, (Date.now() - start) / duration);
      setT(next);
      if (next >= 1) clearInterval(timer);
    }, FRAME_MS);
    return () => clearInterval(timer);
  }, [key, animate, duration]);

  return animate ? easeOut(t) : 1;
}

/** Compteur d'images, actif seulement tant que `running` est vrai. */
export function useFrame(running: boolean, interval = 80): number {
  const animate = motionEnabled();
  const [frame, setFrame] = useState(0);

  useEffect(() => {
    if (!animate || !running) return;
    const timer = setInterval(() => setFrame((value) => value + 1), interval);
    return () => clearInterval(timer);
  }, [animate, running, interval]);

  return frame;
}
