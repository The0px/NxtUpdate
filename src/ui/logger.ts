import chalk from "chalk";
import { glyphs, paint } from "./theme.ts";

export const logger = {
  info: (msg: string) => console.log(paint.accent("•"), msg),
  success: (msg: string) => console.log(paint.success(glyphs().ok), msg),
  warn: (msg: string) => console.log(paint.warning(glyphs().warn), msg),
  error: (msg: string) => console.error(paint.danger(glyphs().fail), msg),
  dim: (msg: string) => console.log(paint.muted(msg)),
  bold: (msg: string) => console.log(chalk.bold(msg)),
  step: (msg: string) => console.log(paint.accent(glyphs().pointer), msg),
  list: (items: string[]) => {
    for (const item of items) {
      console.log(paint.muted("  ·"), item);
    }
  },
};
