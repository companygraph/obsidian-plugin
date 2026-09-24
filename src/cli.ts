// The meta-model's command line in a terminal of the Terminal plugin, started at the vault's root.
// Terminal opens a shell from a profile, and a profile carries its own arguments: so the shell the
// owner set up is taken as it stands, with arguments that run the command line first and leave a
// shell open after it, where the menu's last answer can still be read. Pure: the profiles, the
// platform and the release are handed in.

// A profile as Terminal keeps it in its settings. Only these fields are read; every other one is
// carried over untouched.
export interface Profile {
  type: string;
  executable?: string;
  args?: string[];
  platforms?: Record<string, boolean>;
  [field: string]: unknown;
}

// The release this build bundles, so the command line and the plugin agree on the core.
export const cliCommand = (version: string) => `npx --yes github:companygraph/meta-model#v${version}`;

const quoted = (text: string) => `'${text.replace(/'/g, "'\\''")}'`;

const integratedFor = (profile: Profile | undefined, platform: string): profile is Profile =>
  profile?.type === "integrated" && typeof profile.executable === "string" && profile.platforms?.[platform] === true;

// The owner's default profile where it is an integrated shell of this platform, and otherwise the
// first one that is: a default that opens an external window or the developer console is no place
// to run anything in a pane. Null where the platform has none.
export function cliProfile(profiles: Record<string, Profile>, defaultProfile: string | null, platform: string, version: string): Profile | null {
  const own = defaultProfile === null ? undefined : profiles[defaultProfile];
  const base = integratedFor(own, platform) ? own : Object.values(profiles).find((p) => integratedFor(p, platform));
  if (!base) return null;
  const command = cliCommand(version);
  const shell = base.executable!;
  let args: string[];
  if (platform === "win32") {
    args = /(pwsh|powershell)(\.exe)?$/i.test(shell) ? ["-NoExit", "-Command", command] : ["/k", command];
  } else {
    // Login and interactive, so the PATH that finds node is the one the owner's own terminal has.
    args = ["-l", "-i", "-c", `${command}; exec ${quoted(shell)} -l`];
  }
  return { ...base, args };
}
