import { exec, type ExecOptions } from "./exec.ts";

// Chemin absolu : un `sudo` placé plus tôt dans le PATH pourrait capturer le mot de passe.
const SUDO = "/usr/bin/sudo";

export async function runSudo(
  command: string[],
  options?: Pick<ExecOptions, "onLine">,
): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  return exec([SUDO, ...command], options);
}
