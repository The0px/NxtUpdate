import { Box, Text, useApp, render } from "ink";
import { useEffect, useState } from "react";
import { aiAgents, detectInstalled, scanInstalled, scanOutdated } from "../detectors/index.ts";
import type { DetectedAgent } from "../detectors/ai-agents/index.ts";
import { METHOD_LABEL } from "../detectors/ai-agents/install-method.ts";
import { checkForUpdate } from "../utils/version.ts";
import { colors, glyphs, managerIcon, mixColor } from "../ui/theme.ts";
import { MainMenu } from "./main-menu.tsx";
import { UpdateScreen } from "./update.tsx";
import { ListScreen } from "./list-screen.tsx";
import { SelectPackagesScreen } from "./select-packages.tsx";
import { ProgressBar } from "./progress-bar.tsx";
import { MoleTipScreen } from "./mole-tip.tsx";
import { ConfirmUninstallScreen } from "./confirm-action.tsx";
import { MOUSE_OFF, MOUSE_ON, MouseProvider } from "./mouse.tsx";
import { useKeys } from "./use-keys.ts";
import { Header, SectionLabel, Tag } from "./ui.tsx";
import { orderByCategory } from "./use-list-nav.ts";
import { setAnimation, useFrame, useReveal } from "./motion.ts";
import type {
  PackageManager,
  OutdatedPackage,
  InstalledPackage,
  CliOptions,
} from "../detectors/types.ts";
import type { UpdateInfo } from "../utils/version.ts";

export type Screen =
  | "scan"
  | "menu"
  | "update"
  | "list"
  | "select"
  | "uninstall-scan"
  | "uninstall"
  | "uninstall-confirm"
  | "uninstall-run"
  | "mole-tip";

export type ManagerData = {
  manager: PackageManager;
  outdated: OutdatedPackage[];
};

export type InstalledManagerData = {
  manager: PackageManager;
  installed: InstalledPackage[];
};

interface AppProps {
  options: CliOptions;
  startScreen?: Screen;
}

/** Texte parcouru par une lueur douce tant que le travail continue. */
function Shimmer({ text, running }: { text: string; running: boolean }) {
  const frame = useFrame(running, 70);
  if (!running) return <Text color={colors.textMuted}>{text}</Text>;
  const chars = [...text];
  const head = frame % (chars.length + 12);
  return (
    <Text>
      {chars.map((char, index) => {
        const distance = Math.abs(index - head);
        return <Text key={index} color={mixColor(colors.textMuted, colors.text, Math.max(0, 1 - distance / 4))}>{char}</Text>;
      })}
    </Text>
  );
}

function ScanScreen({ onComplete }: { onComplete: (data: ManagerData[]) => void }) {
  const g = glyphs();
  const [status, setStatus] = useState("Detecting AI agents and package managers");
  const [detected, setDetected] = useState<PackageManager[]>([]);
  const [agents, setAgents] = useState<DetectedAgent[]>([]);
  const [progress, setProgress] = useState({ current: 0, total: 0 });
  const packageManagers = detected.filter((manager) => manager.category !== "ai");
  const shownAgents = agents.slice(0, 8);
  const revealed = useReveal(shownAgents.length + packageManagers.length, 45);

  useEffect(() => {
    void (async () => {
      const [all, foundAgents] = await Promise.all([detectInstalled(), aiAgents.agents()]);
      setDetected(all);
      setAgents(foundAgents);
      setStatus(`Checking ${all.length} source(s) for updates`);
      setProgress({ current: 0, total: all.length });

      const results = await scanOutdated(all, () => {
        setProgress((previous) => ({ ...previous, current: previous.current + 1 }));
      });
      onComplete(results.map(({ manager, items }) => ({ manager, outdated: items })));
    })();
  }, []);

  return (
    <Box flexDirection="column" paddingX={1}>
      <Header title="scan" />

      <Shimmer text={`${status}…`} running />
      <ProgressBar current={progress.current} total={progress.total} />

      {shownAgents.length > 0 && (
        <Box flexDirection="column" marginTop={1}>
          <SectionLabel category="ai" />
          {shownAgents.slice(0, revealed).map((agent) => (
            <Text key={agent.definition.id} wrap="truncate-end">
              {"  "}{agent.definition.name}
              <Text color={colors.textMuted}>  {agent.current ?? "?"}  </Text>
              <Tag>{METHOD_LABEL[agent.method.kind]}</Tag>
            </Text>
          ))}
          {agents.length > shownAgents.length && revealed >= shownAgents.length && (
            <Text color={colors.textMuted}>  …and {agents.length - shownAgents.length} more</Text>
          )}
        </Box>
      )}

      {packageManagers.length > 0 && revealed > shownAgents.length && (
        <Box flexDirection="column" marginTop={1}>
          <SectionLabel category="packages" />
          {packageManagers.slice(0, revealed - shownAgents.length).map((manager) => (
            <Text key={manager.name} wrap="truncate-end">
              {"  "}<Text color={colors.textMuted}>{managerIcon(manager)}</Text> {manager.name}
            </Text>
          ))}
        </Box>
      )}

      {agents.length === 0 && detected.length > 0 && (
        <Text color={colors.textMuted}>{g.skip} No AI agent CLI found in PATH</Text>
      )}
    </Box>
  );
}

function UninstallScanScreen({
  onComplete,
}: {
  onComplete: (data: InstalledManagerData[]) => void;
}) {
  const [progress, setProgress] = useState({ current: 0, total: 0 });

  useEffect(() => {
    void (async () => {
      const all = await detectInstalled();
      setProgress({ current: 0, total: all.length });
      const results = await scanInstalled(all, () => {
        setProgress((previous) => ({ ...previous, current: previous.current + 1 }));
      });
      onComplete(results.map(({ manager, items }) => ({ manager, installed: items })));
    })();
  }, []);

  return (
    <Box flexDirection="column" paddingX={1}>
      <Header title="uninstall" titleColor={colors.danger} />
      <Shimmer text="Listing installed agents and packages…" running />
      <ProgressBar current={progress.current} total={progress.total} />
      <Box marginTop={1}>
        <Text color={colors.textMuted}>Nothing is removed during this scan.</Text>
      </Box>
    </Box>
  );
}

export function App({ options, startScreen = "scan" }: AppProps) {
  const { exit } = useApp();
  const [screen, setScreen] = useState<Screen>(startScreen);
  const [managers, setManagers] = useState<ManagerData[]>([]);
  const [installedManagers, setInstalledManagers] = useState<InstalledManagerData[]>([]);
  const [selectedForUpdate, setSelectedForUpdate] = useState<ManagerData[]>([]);
  const [selectedForUninstall, setSelectedForUninstall] = useState<ManagerData[]>([]);
  const [updateInfo, setUpdateInfo] = useState<UpdateInfo | null>(null);
  const [menuSelection, setMenuSelection] = useState(0);
  const [selectScope, setSelectScope] = useState<"all" | "ai">("all");

  useEffect(() => {
    let active = true;
    void checkForUpdate().then((info) => {
      if (active) setUpdateInfo(info);
    });
    return () => {
      active = false;
    };
  }, []);

  useKeys((input, key) => {
    if (key.ctrl && input === "c") exit();
  });

  if (screen === "scan") {
    return <ScanScreen onComplete={(data) => {
      setManagers(data);
      setScreen("menu");
    }} />;
  }

  if (screen === "list") {
    return <ListScreen managers={managers} onBack={() => setScreen("menu")} />;
  }

  if (screen === "select") {
    return (
      <SelectPackagesScreen
        managers={selectScope === "ai" ? managers.filter((manager) => manager.manager.category === "ai") : managers}
        title={selectScope === "ai" ? "Select AI agents to update" : "Select packages to update"}
        mode="update"
        dryRun={options.dryRun}
        onConfirm={(selected) => {
          setSelectedForUpdate(selected);
          setScreen("update");
        }}
        onBack={() => setScreen("menu")}
      />
    );
  }

  if (screen === "menu") {
    return (
      <MainMenu
        managers={managers}
        options={options}
        updateInfo={updateInfo}
        selected={menuSelection}
        onSelectionChange={setMenuSelection}
        onStartUpdate={() => {
          setSelectScope("all");
          setScreen("select");
        }}
        onUpdateAgents={() => {
          setSelectScope("ai");
          setScreen("select");
        }}
        onUninstall={() => setScreen("uninstall-scan")}
        onViewList={() => setScreen("list")}
        onViewMoleTip={() => setScreen("mole-tip")}
      />
    );
  }

  if (screen === "update") {
    return (
      <UpdateScreen
        managers={selectedForUpdate.length > 0 ? selectedForUpdate : managers}
        options={options}
        mode="update"
        onDone={(updated) => {
          if (!options.dryRun) {
            const succeeded = new Map(
              updated.map((result) => [result.managerName, new Set(result.pkgNames)])
            );
            setManagers((previous) => previous.map((manager) => ({
              ...manager,
              outdated: manager.outdated.filter(
                (pkg) => !succeeded.get(manager.manager.name)?.has(pkg.name)
              ),
            })));
          }
          setSelectedForUpdate([]);
          setScreen("menu");
        }}
      />
    );
  }

  if (screen === "uninstall-scan") {
    return (
      <UninstallScanScreen
        onComplete={(data) => {
          setInstalledManagers(data);
          setScreen("uninstall");
        }}
      />
    );
  }

  if (screen === "uninstall") {
    const selectable: ManagerData[] = orderByCategory(installedManagers)
      .filter((manager) => manager.installed.length > 0)
      .map((manager) => ({
        manager: manager.manager,
        outdated: manager.installed.map((pkg) => ({
          name: pkg.name,
          current: pkg.version,
          latest: "",
          method: pkg.method,
          blocked: pkg.blocked,
          detail: pkg.detail,
        })),
      }));

    return (
      <SelectPackagesScreen
        managers={selectable}
        title="Select what to uninstall"
        mode="uninstall"
        dryRun={options.dryRun}
        initialSelected={selectedForUninstall}
        onConfirm={(selected) => {
          setSelectedForUninstall(selected);
          setScreen("uninstall-confirm");
        }}
        onBack={() => setScreen("menu")}
      />
    );
  }

  if (screen === "uninstall-confirm") {
    return (
      <ConfirmUninstallScreen
        managers={selectedForUninstall}
        dryRun={options.dryRun}
        onConfirm={() => setScreen("uninstall-run")}
        onBack={() => setScreen("uninstall")}
      />
    );
  }

  if (screen === "uninstall-run") {
    return (
      <UpdateScreen
        managers={selectedForUninstall}
        options={options}
        mode="uninstall"
        onDone={(removed) => {
          if (!options.dryRun) {
            const succeeded = new Map(
              removed.map((result) => [result.managerName, new Set(result.pkgNames)])
            );
            setInstalledManagers((previous) => previous.map((manager) => ({
              ...manager,
              installed: manager.installed.filter(
                (pkg) => !succeeded.get(manager.manager.name)?.has(pkg.name)
              ),
            })));
          }
          setSelectedForUninstall([]);
          setScreen("menu");
        }}
      />
    );
  }

  if (screen === "mole-tip") {
    return <MoleTipScreen onBack={() => setScreen("menu")} />;
  }

  return null;
}

const ENTER_ALTERNATE = "\x1b[?1049h\x1b[H\x1b[2J";
const LEAVE_ALTERNATE = "\x1b[?1049l";

export async function withAlternateScreen(
  run: () => Promise<void>,
  write: (value: string) => unknown = (value) => process.stdout.write(value),
  { mouse = false }: { mouse?: boolean } = {},
) {
  let restored = false;
  // Le terminal doit retrouver son état même si le processus est tué : sinon la souris reste capturée.
  const restore = () => {
    if (restored) return;
    restored = true;
    if (mouse) write(MOUSE_OFF);
    write(LEAVE_ALTERNATE);
  };
  const onSignal = (signal: NodeJS.Signals) => {
    restore();
    process.exit(signal === "SIGINT" ? 130 : 143);
  };

  write(ENTER_ALTERNATE);
  if (mouse) write(MOUSE_ON);
  process.once("exit", restore);
  process.once("SIGTERM", onSignal);
  process.once("SIGHUP", onSignal);
  try {
    await run();
  } finally {
    restore();
    process.off("exit", restore);
    process.off("SIGTERM", onSignal);
    process.off("SIGHUP", onSignal);
  }
}

export async function launchTUI(options: CliOptions, startScreen?: Screen) {
  const mouse = options.mouse !== false && Boolean(process.stdin.isTTY);
  setAnimation(options.animation !== false && Boolean(process.stdout.isTTY));
  await withAlternateScreen(async () => {
    const instance = render(
      <MouseProvider enabled={mouse}>
        <App options={options} startScreen={startScreen} />
      </MouseProvider>,
      { exitOnCtrlC: false },
    );
    await instance.waitUntilExit();
  }, undefined, { mouse });
}
