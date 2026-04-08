const fs = require("fs");
const fsp = require("fs/promises");
const path = require("path");
const { spawn } = require("child_process");
const { applyWindowsExecutableBranding } = require("./windows-branding.cjs");

const projectRoot = path.resolve(__dirname, "..");
const mainEntry = path.join(projectRoot, "dist-electron", "electron", "main.js");
const rendererEntry = path.join(projectRoot, "dist", "renderer", "index.html");
const packageJsonPath = path.join(projectRoot, "package.json");
const productName = "DeskPilot";
const appId = "com.doveyh.deskpilot";
const iconPngPath = path.join(projectRoot, "screenshot", "deskpilot_logo.png");
const devBrandingCacheDir = path.join(projectRoot, ".cache", "branding");
const isCheckOnly = process.argv.includes("--check");

function fail(message) {
  console.error(`[DeskPilot] ${message}`);
  process.exit(1);
}

function exists(targetPath) {
  return fs.existsSync(targetPath);
}

async function ensureWindowsElectronAlias(electronExecutablePath) {
  if (process.platform !== "win32") {
    return electronExecutablePath;
  }

  const electronDir = path.dirname(electronExecutablePath);
  const deskPilotExecutablePath = path.join(electronDir, `${productName}.exe`);

  try {
    const sourceStat = fs.statSync(electronExecutablePath);
    const targetStat = exists(deskPilotExecutablePath) ? fs.statSync(deskPilotExecutablePath) : null;
    const shouldCopy = !targetStat
      || targetStat.size !== sourceStat.size
      || targetStat.mtimeMs < sourceStat.mtimeMs;

    if (shouldCopy) {
      fs.copyFileSync(electronExecutablePath, deskPilotExecutablePath);
    }

    const sourcePackage = JSON.parse(await fsp.readFile(packageJsonPath, "utf-8"));
    await applyWindowsExecutableBranding(deskPilotExecutablePath, {
      productName,
      version: sourcePackage.version,
      iconPngPath,
      iconIcoPath: path.join(devBrandingCacheDir, "deskpilot-dev.ico"),
      appId,
      companyName: sourcePackage.author || "doveyh",
      copyright: "Copyright 2026 doveyh"
    });

    return deskPilotExecutablePath;
  } catch {
    return electronExecutablePath;
  }
}

async function resolveLocalElectronCommand() {
  try {
    const electronExecutablePath = require(require.resolve("electron", { paths: [projectRoot] }));
    const command = await ensureWindowsElectronAlias(electronExecutablePath);
    return {
      command,
      args: [projectRoot],
      source: command === electronExecutablePath ? "local" : "local-alias"
    };
  } catch {
    return null;
  }
}

function resolveGlobalElectronCommand() {
  return {
    command: "electron",
    args: [projectRoot],
    source: "global"
  };
}

function validateBuildOutputs() {
  const missing = [];
  if (!exists(mainEntry)) {
    missing.push(`missing main entry: ${mainEntry}`);
  }
  if (!exists(rendererEntry)) {
    missing.push(`missing renderer entry: ${rendererEntry}`);
  }

  if (missing.length > 0) {
    fail(`${missing.join("; ")}. Run "npm run build" first.`);
  }
}

function launch(commandConfig) {
  console.log(`[DeskPilot] Launching with ${commandConfig.source} Electron`);
  const env = {
    ...process.env,
    DESKPILOT_DEV: "1",
    NODE_ENV: process.env.NODE_ENV || "development"
  };
  delete env.ELECTRON_RUN_AS_NODE;

  const child = spawn(commandConfig.command, commandConfig.args, {
    cwd: projectRoot,
    stdio: "inherit",
    shell: false,
    env
  });

  child.on("error", (error) => {
    if (commandConfig.source === "local") {
      console.warn("[DeskPilot] Local Electron failed, trying global electron...");
      launch(resolveGlobalElectronCommand());
      return;
    }

    fail(`Unable to launch Electron: ${error.message}`);
  });

  child.on("exit", (code) => {
    process.exit(code ?? 0);
  });
}

validateBuildOutputs();

(async () => {
  const localElectron = await resolveLocalElectronCommand();
  if (isCheckOnly) {
    if (localElectron) {
      console.log("[DeskPilot] Check passed: build outputs exist and local Electron is available.");
    } else {
      console.log("[DeskPilot] Check passed: build outputs exist. Local Electron is unavailable, will rely on global electron.");
    }
    process.exit(0);
  }

  launch(localElectron || resolveGlobalElectronCommand());
})().catch((error) => {
  fail(`Unable to prepare Electron runtime: ${error.message}`);
});
