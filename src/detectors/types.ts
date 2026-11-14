export interface OutdatedPackage {
  name: string;
  current: string;
  latest: string;
  path?: string;
  /** Méthode d'installation affichée à côté du paquet (native, uv, npm, brew…). */
  method?: string;
  /** Version distante ou identité non vérifiée : listé, mais jamais coché par défaut. */
  uncertain?: boolean;
  /** Raison pour laquelle l'action est impossible : la ligne reste visible mais non cochable. */
  blocked?: string;
  /** Ce que l'action va réellement lancer ou supprimer, montré avant confirmation. */
  detail?: string;
}

export interface InstalledPackage {
  name: string;
  version: string;
  method?: string;
  blocked?: string;
  detail?: string;
}

export interface UpdateResult {
  manager: string;
  success: boolean;
  updated: number;
  output: string;
  error?: string;
  /** Échecs paquet par paquet, pour les gestionnaires qui lancent une commande par paquet. */
  failedPackages?: string[];
}

export type ProgressReporter = (message: string) => void;

export type ManagerCategory = "ai" | "packages" | "system";

export interface PackageManager {
  name: string;
  command: string;
  icon: string;
  category?: ManagerCategory;
  skipReason?: string;
  detect(): Promise<boolean>;
  listOutdated(): Promise<OutdatedPackage[]>;
  listInstalled(): Promise<InstalledPackage[]>;
  update(dryRun?: boolean, packages?: string[], onProgress?: ProgressReporter): Promise<UpdateResult>;
  uninstall(dryRun?: boolean, packages?: string[], onProgress?: ProgressReporter): Promise<UpdateResult>;
  /** Paquets pris en charge ici, que les autres gestionnaires ne doivent pas lister une seconde fois. */
  claimed?(): ClaimedPackage[];
}

export interface ClaimedPackage {
  manager: "homebrew" | "node";
  name: string;
}

export interface CliOptions {
  only?: string;
  dryRun?: boolean;
  noSudo?: boolean;
  verbose?: boolean;
  yes?: boolean;
  mouse?: boolean;
  animation?: boolean;
  icons?: string;
}
