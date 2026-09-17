import react, { reactCompilerPreset } from "@vitejs/plugin-react";
import babel from "@rolldown/plugin-babel";
import { execSync } from "node:child_process";
import process from "node:process";
import { defineConfig, lazyPlugins } from "vite-plus";

/**
 * The commit this build came from, shown in Settings so a deployment can be
 * identified at a glance. Netlify provides COMMIT_REF during its build; locally
 * git is asked, and uncommitted changes are marked so a local build is never
 * mistaken for a deployed one.
 */
function commitLabel(): string {
  const fromNetlify = process.env.COMMIT_REF;
  if (fromNetlify) return fromNetlify.slice(0, 7);
  try {
    const hash = execSync("git rev-parse --short=7 HEAD", { encoding: "utf8" }).trim();
    const dirty = execSync("git status --porcelain", { encoding: "utf8" }).trim() !== "";
    return dirty ? `${hash} + local changes` : hash;
  } catch {
    return "unknown";
  }
}

// https://vite.dev/config/
export default defineConfig({
  define: {
    __COMMIT__: JSON.stringify(commitLabel()),
  },
  staged: {
    "*": "vp check --fix",
  },
  fmt: {},
  lint: {
    plugins: ["react", "typescript", "oxc"],
    rules: {
      "react/rules-of-hooks": "error",
      "react/only-export-components": [
        "warn",
        {
          allowConstantExport: true,
        },
      ],
      "vite-plus/prefer-vite-plus-imports": "error",
    },
    options: {
      typeAware: true,
      typeCheck: true,
    },
    jsPlugins: [
      {
        name: "vite-plus",
        specifier: "vite-plus/oxlint-plugin",
      },
    ],
  },
  plugins: lazyPlugins(() => [react(), babel({ presets: [reactCompilerPreset()] })]),
});
