export type LatestSource =
  | { type: "npm"; package: string }
  | { type: "pypi"; package: string }
  | { type: "github"; repo: string }
  | { type: "cursor" };

export interface AgentDefinition {
  id: string;
  name: string;
  bins: string[];
  /** Exigé dans le chemin réel quand le nom de commande est générique (`agent`, `grok`). */
  pathHint?: RegExp;
  /** Noms de paquets qui prouvent l'identité quand un gestionnaire a installé l'agent. */
  packages?: { npm?: string[]; pypi?: string[]; brew?: string[] };
  /** Chemin qui prouve une installation native ; sinon l'agent est listé mais jamais coché. */
  nativeHint?: RegExp;
  /** Arguments de l'updater officiel, utilisés seulement pour une installation native. */
  selfUpdate?: string[];
  /** Source de la dernière version pour une installation native. */
  latest?: LatestSource;
  /** Conseil affiché quand aucune mise à jour sûre n'est possible. */
  manualHint?: string;
  /** Désinstallation native documentée : arguments du binaire, ou chemins à supprimer sous `~/`. */
  nativeUninstall?: { args: string[] } | { paths: string[] };
}

// Commandes relevées dans la documentation officielle de chaque outil (novembre 2026).
export const AGENTS: AgentDefinition[] = [
  {
    id: "claude", name: "Claude Code", bins: ["claude"],
    packages: { npm: ["@anthropic-ai/claude-code"], brew: ["claude-code"] },
    nativeHint: /\/\.?claude\//, selfUpdate: ["update"], latest: { type: "npm", package: "@anthropic-ai/claude-code" },
    nativeUninstall: { paths: ["~/.local/bin/claude", "~/.local/share/claude"] },
  },
  {
    id: "codex", name: "OpenAI Codex", bins: ["codex"],
    packages: { npm: ["@openai/codex"], brew: ["codex"] },
    latest: { type: "npm", package: "@openai/codex" }, manualHint: "standalone install: rerun the official Codex installer",
  },
  {
    id: "gemini", name: "Gemini CLI", bins: ["gemini"],
    packages: { npm: ["@google/gemini-cli"], brew: ["gemini-cli"] },
    latest: { type: "npm", package: "@google/gemini-cli" },
  },
  {
    id: "vibe", name: "Mistral Vibe", bins: ["vibe"],
    packages: { pypi: ["mistral-vibe"], brew: ["mistral-vibe"] },
    latest: { type: "pypi", package: "mistral-vibe" },
  },
  {
    id: "cursor", name: "Cursor CLI", bins: ["cursor-agent", "agent"], pathHint: /cursor-agent/,
    nativeHint: /cursor-agent/, selfUpdate: ["update"], latest: { type: "cursor" },
  },
  {
    id: "opencode", name: "OpenCode", bins: ["opencode"],
    packages: { npm: ["@opencode/cli", "opencode-ai"], brew: ["opencode"] },
    nativeHint: /\/\.?opencode\//, selfUpdate: ["upgrade"], latest: { type: "npm", package: "@opencode/cli" },
    // On garde la configuration et les sessions, comme le ferait un `npm uninstall`.
    nativeUninstall: { args: ["uninstall", "--force", "--keep-config", "--keep-data"] },
  },
  {
    id: "copilot", name: "GitHub Copilot CLI", bins: ["copilot"],
    packages: { npm: ["@github/copilot"], brew: ["copilot-cli", "copilot-cli@prerelease"] },
    nativeHint: /copilot/i, selfUpdate: ["update"], latest: { type: "npm", package: "@github/copilot" },
  },
  {
    id: "amp", name: "Amp", bins: ["amp"],
    packages: { npm: ["@sourcegraph/amp"] },
    nativeHint: /\/\.?amp\//, selfUpdate: ["update"], latest: { type: "npm", package: "@sourcegraph/amp" },
  },
  {
    id: "grok", name: "Grok Build", bins: ["grok"], pathHint: /\/\.grok\/|@xai-official\/grok/,
    packages: { npm: ["@xai-official/grok"] },
    nativeHint: /\/\.grok\//, selfUpdate: ["update"], latest: { type: "npm", package: "@xai-official/grok" },
  },
  {
    id: "droid", name: "Factory Droid", bins: ["droid"],
    packages: { npm: ["droid", "@factory/cli"] },
    nativeHint: /\/\.factory\//, selfUpdate: ["update"], latest: { type: "npm", package: "droid" },
  },
  {
    id: "goose", name: "Goose", bins: ["goose"],
    packages: { brew: ["block-goose-cli"] },
    nativeHint: /\/\.?goose\/(?:bin|versions)\//, selfUpdate: ["update"], latest: { type: "github", repo: "aaif-goose/goose" },
  },
  { id: "qwen", name: "Qwen Code", bins: ["qwen"], packages: { npm: ["@qwen-code/qwen-code"] }, latest: { type: "npm", package: "@qwen-code/qwen-code" } },
  { id: "crush", name: "Crush", bins: ["crush"], packages: { npm: ["@charmland/crush"], brew: ["crush"] }, latest: { type: "npm", package: "@charmland/crush" } },
  { id: "auggie", name: "Auggie", bins: ["auggie"], packages: { npm: ["@augmentcode/auggie"] }, latest: { type: "npm", package: "@augmentcode/auggie" } },
  { id: "cline", name: "Cline CLI", bins: ["cline"], packages: { npm: ["cline"] }, latest: { type: "npm", package: "cline" } },
  { id: "kilo", name: "Kilo Code CLI", bins: ["kilocode", "kilo"], packages: { npm: ["@kilocode/cli"] }, latest: { type: "npm", package: "@kilocode/cli" } },
  { id: "aider", name: "Aider", bins: ["aider"], packages: { pypi: ["aider-chat"], brew: ["aider"] }, latest: { type: "pypi", package: "aider-chat" } },
  { id: "kimi", name: "Kimi CLI", bins: ["kimi"], packages: { pypi: ["kimi-cli"] }, latest: { type: "pypi", package: "kimi-cli" } },
  { id: "kiro", name: "Kiro CLI", bins: ["kiro-cli"], manualHint: "no documented updater: rerun the official Kiro installer" },
];
