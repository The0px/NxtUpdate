import { useInput } from "ink";
import { isMouseInput } from "./mouse.tsx";

type Handler = Parameters<typeof useInput>[0];

/** useInput sans les séquences souris, qui sinon arrivent comme du texte (dans la recherche par exemple). */
export function useKeys(handler: Handler, options?: Parameters<typeof useInput>[1]): void {
  useInput((input, key) => {
    if (isMouseInput(input)) return;
    handler(input, key);
  }, options);
}
