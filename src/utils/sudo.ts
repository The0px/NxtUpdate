import { exec, type ExecOptions } from "./exec.ts";

export async function runSudo(
  command: string[],
  noSudo = false,
  options?: Pick<ExecOptions, "onLine">,
): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  if (noSudo) {
    return exec(command, options);
  }
  return exec(["/usr/bin/sudo", ...command], options);
}

export async function hasSudoAccess(): Promise<boolean> {
  const result = await exec(["/usr/bin/sudo", "-n", "true"]);
  return result.exitCode === 0;
}
