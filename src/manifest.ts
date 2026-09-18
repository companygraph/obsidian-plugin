// The instance's own manifest, and the two guards a checker keeps between its release and the
// core an instance vendored. Pure: the caller reads the file and names the bundled release.
import { isNewer } from "companygraph-meta-model/checks";

export interface InstanceManifest {
  tooling: string | null;
  coreVersion: string | null;
  units: string;
}

export type Guard =
  | { kind: "ok" }
  | { kind: "report"; message: string }
  | { kind: "refuse"; message: string };

const RELEASE = /^\d+\.\d+\.\d+$/;

export function readManifest(text: string): InstanceManifest {
  const raw = JSON.parse(text);
  return {
    tooling: typeof raw.tooling === "string" ? raw.tooling : null,
    coreVersion: typeof raw.core?.version === "string" ? raw.core.version : null,
    units: typeof raw.units === "string" ? raw.units : "meta",
  };
}

// Refuse a core newer than the checker: it would meet a folder it has never heard of and report
// a broken model. Report, and still run, a tooling pin that names another release: CI's refusal
// is the gate for that, and a plugin that refuses helps nobody in the editor.
export function guard(manifest: InstanceManifest, checker: string): Guard {
  const core = manifest.coreVersion;
  if (core && RELEASE.test(core) && isNewer(core, checker))
    return {
      kind: "refuse",
      message: `this vault vendors core ${core} and the plugin bundles checker ${checker}; take a plugin release that bundles ${core} or newer`,
    };
  if (manifest.tooling && manifest.tooling !== checker)
    return {
      kind: "report",
      message: `.companygraph/manifest.json names tooling ${manifest.tooling} and the plugin bundles ${checker}; CI is the gate for that pin`,
    };
  return { kind: "ok" };
}
