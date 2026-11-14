import { Box, Text, Spacer } from "ink";
import Spinner from "ink-spinner";
import { useEffect, useRef, useState } from "react";
import type { ManagerData } from "./app.tsx";
import type { CliOptions } from "../detectors/types.ts";
import { setNoSudo } from "../detectors/macos.ts";
import { getVersionDelta } from "../utils/version.ts";
import { sanitizeLine } from "../utils/sanitize.ts";
import { colors, glyphs, managerIcon, mixColor } from "../ui/theme.ts";
import { KeyHints } from "./key-hints.tsx";
import { useTerminalSize } from "./use-terminal-size.ts";
import { useKeys } from "./use-keys.ts";
import { orderByCategory } from "./use-list-nav.ts";
import { DeltaTag, Header, Tag } from "./ui.tsx";
import { usePulse } from "./motion.ts";
import { ProgressBar } from "./progress-bar.tsx";

interface Props {
  managers: ManagerData[];
  options: CliOptions;
  mode?: "update" | "uninstall";
  onDone: (completed: { managerName: string; pkgNames: string[] }[]) => void;
}

type PkgStatus = "pending" | "running" | "done" | "failed";

export function normalizeProgressMessage(message: string): string {
  return sanitizeLine(message, 300);
}

interface PkgTask {
  managerIdx: number;
  pkgIdx: number;
  name: string;
  current: string;
  latest: string;
  method?: string;
  uncertain?: boolean;
  status: PkgStatus;
  error?: string;
}

/** Icône d'état : à la fin d'une tâche, elle s'allume puis se pose sur sa couleur finale. */
function StatusGlyph({ status }: { status: PkgStatus }) {
  const g = glyphs();
  const t = usePulse(status, 360);
  if (status === "running") return <Text color={colors.accent}><Spinner type="dots" /> </Text>;
  const glyph = { pending: g.pending, done: g.ok, failed: g.fail }[status];
  const color = { pending: colors.border, done: colors.success, failed: colors.danger }[status];
  return <Text bold={t < 1} color={t < 1 ? mixColor(colors.text, color, t) : color}>{glyph} </Text>;
}

function formatElapsed(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  return `${String(minutes).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
}

export function UpdateScreen({
  managers,
  options,
  mode = "update",
  onDone,
}: Props) {
  const g = glyphs();
  const { columns, rows } = useTerminalSize();
  const compact = columns < 96 || rows < 30;
  const [withPackages] = useState(() => orderByCategory(managers.filter((manager) => manager.outdated.length > 0)));
  const started = useRef(false);

  const [tasks, setTasks] = useState<PkgTask[]>(() =>
    withPackages.flatMap((manager, managerIdx) =>
      manager.outdated.map((pkg, pkgIdx) => ({
        managerIdx,
        pkgIdx,
        name: pkg.name,
        current: pkg.current,
        latest: pkg.latest,
        method: pkg.method,
        uncertain: pkg.uncertain,
        status: "pending" as PkgStatus,
      }))
    )
  );
  const [finished, setFinished] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [managerActivity, setManagerActivity] = useState<Record<number, string>>({});

  useEffect(() => {
    setNoSudo(Boolean(options.noSudo));
  }, [options.noSudo]);

  useEffect(() => {
    if (finished) return;
    const timer = setInterval(() => setElapsed((value) => value + 1), 1000);
    return () => clearInterval(timer);
  }, [finished]);

  useEffect(() => {
    if (started.current) return;
    started.current = true;

    const settle = (managerIdx: number, failedNames: Set<string> | "all" | "none", error?: string) => {
      setTasks((previous) => previous.map((task) => {
        if (task.managerIdx !== managerIdx) return task;
        const failed = failedNames === "all" || (failedNames !== "none" && failedNames.has(task.name));
        return { ...task, status: failed ? "failed" : "done", error: failed ? error : undefined };
      }));
    };

    void (async () => {
      for (let managerIdx = 0; managerIdx < withPackages.length; managerIdx++) {
        const manager = withPackages[managerIdx]!;
        const packageNames = manager.outdated.map((pkg) => pkg.name);

        setTasks((previous) => previous.map((task) =>
          task.managerIdx === managerIdx ? { ...task, status: "running", error: undefined } : task
        ));
        setManagerActivity((previous) => ({
          ...previous,
          [managerIdx]: mode === "uninstall"
            ? `Starting ${manager.manager.name} removal…`
            : `Starting ${manager.manager.name} update…`,
        }));

        const reportProgress = (message: string) => {
          const normalized = normalizeProgressMessage(message);
          if (!normalized) return;
          setManagerActivity((previous) => previous[managerIdx] === normalized
            ? previous
            : { ...previous, [managerIdx]: normalized });
        };

        try {
          const result = mode === "uninstall"
            ? await manager.manager.uninstall(options.dryRun, packageNames, reportProgress)
            : await manager.manager.update(options.dryRun, packageNames, reportProgress);
          const error = sanitizeLine(result.error ?? "Operation failed");
          if (result.failedPackages) {
            settle(managerIdx, new Set(result.failedPackages), error);
          } else {
            settle(managerIdx, result.success ? "none" : "all", error);
          }
        } catch (error) {
          settle(managerIdx, "all", sanitizeLine(error instanceof Error ? error.message : String(error)));
        }
      }
      setFinished(true);
    })();
  }, []);

  const leave = () => {
    const completed = withPackages
      .map((manager, managerIdx) => ({
        managerName: manager.manager.name,
        pkgNames: tasks
          .filter((task) => task.managerIdx === managerIdx && task.status === "done")
          .map((task) => task.name),
      }))
      .filter((result) => result.pkgNames.length > 0);
    onDone(completed);
  };

  useKeys((input, key) => {
    if (finished && (key.return || key.escape || input === "q")) leave();
  });

  const totalPackages = tasks.length;
  const doneCount = tasks.filter((task) => task.status === "done").length;
  const failCount = tasks.filter((task) => task.status === "failed").length;
  const completedCount = doneCount + failCount;
  const focusTask = tasks.find((task) => task.status === "running")
    ?? tasks.find((task) => task.status === "pending")
    ?? tasks.at(-1);
  const focusManagerIdx = focusTask?.managerIdx ?? 0;
  const visibleManagers = withPackages
    .map((manager, managerIdx) => ({ manager, managerIdx }))
    .filter(({ managerIdx }) => !compact || managerIdx === focusManagerIdx);
  const taskLimit = Math.max(3, rows - 17);
  const titleColor = options.dryRun ? colors.warning : mode === "uninstall" ? colors.danger : colors.accent;

  return (
    <Box flexDirection="column" paddingX={1}>
      <Header
        title={options.dryRun ? `${mode} preview` : mode === "uninstall" ? "uninstalling" : "updating"}
        titleColor={titleColor}
        right={<Text color={colors.textMuted}>{totalPackages} item(s) · {formatElapsed(elapsed)}</Text>}
      />

      {compact && withPackages.length > 1 && (
        <Text color={colors.textMuted}>Source {Math.min(focusManagerIdx + 1, withPackages.length)}/{withPackages.length}</Text>
      )}

      {visibleManagers.map(({ manager, managerIdx }) => {
        const managerTasks = tasks.filter((task) => task.managerIdx === managerIdx);
        const managerDone = managerTasks.filter((task) => task.status === "done").length;
        const managerFailed = managerTasks.filter((task) => task.status === "failed").length;
        const managerCompleted = managerDone + managerFailed;
        const managerTotal = managerTasks.length;
        const isActive = managerTasks.some((task) => task.status === "running");
        const isDone = managerCompleted === managerTotal;
        const visibleTasks = managerTasks.slice(0, compact ? taskLimit : managerTasks.length);
        const errors = [...new Set(managerTasks.flatMap((task) => task.error ? [task.error] : []))];
        const activity = managerActivity[managerIdx];

        return (
          <Box key={manager.manager.name} flexDirection="column" marginBottom={1}>
            <Box>
              <Text color={colors.textMuted}>{managerIcon(manager.manager)} </Text>
              <Text bold color={isActive ? colors.accent : colors.text}>{manager.manager.name}</Text>
              <Spacer />
              <Text color={managerFailed > 0 ? colors.danger : isDone ? colors.success : colors.textMuted}>
                {managerCompleted}/{managerTotal}
              </Text>
            </Box>

            {visibleTasks.map((task) => {
              const delta = mode === "update" && !task.uncertain ? getVersionDelta(task.current, task.latest) : null;
              return (
                <Text key={`${task.managerIdx}-${task.pkgIdx}`} wrap="truncate-middle">
                  {"  "}<StatusGlyph status={task.status} />
                  <Text color={task.status === "pending" ? colors.textMuted : colors.text}>{task.name}</Text>
                  {mode === "update" && (
                    <Text color={colors.textMuted}>  {task.current} {g.arrow} {task.uncertain ? "latest" : task.latest}</Text>
                  )}
                  {task.method && <Text>  </Text>}
                  {task.method && <Tag>{task.method}</Tag>}
                  <DeltaTag delta={delta} />
                </Text>
              );
            })}
            {managerTasks.length > visibleTasks.length && (
              <Text color={colors.textMuted}>  …and {managerTasks.length - visibleTasks.length} more</Text>
            )}
            {isActive && !isDone && (
              <Text color={colors.textMuted} wrap="truncate-end">
                {"    "}{activity ?? `Waiting for ${manager.manager.command} output…`}
              </Text>
            )}
            {errors.slice(0, compact ? 1 : 3).map((error) => (
              <Text key={error} color={colors.danger} wrap="truncate-end">    {error}</Text>
            ))}
          </Box>
        );
      })}

      {finished ? (
        <Text color={failCount > 0 ? colors.warning : options.dryRun ? colors.textMuted : colors.success}>
          {options.dryRun
            ? `${g.ok} Preview complete · ${totalPackages} item(s), nothing was changed`
            : failCount > 0
              ? `${g.warn} ${doneCount} succeeded · ${failCount} failed · ${formatElapsed(elapsed)}`
              : `${g.ok} ${doneCount} item(s) ${mode === "uninstall" ? "removed" : "updated"} · ${formatElapsed(elapsed)}`}
        </Text>
      ) : (
        <ProgressBar current={completedCount} total={totalPackages} width={compact ? 20 : 32} label={`${completedCount}/${totalPackages}`} />
      )}

      {finished && (
        <KeyHints
          compact={compact}
          hints={[{ keys: "enter", label: "back to menu", onPress: leave }]}
        />
      )}
    </Box>
  );
}
