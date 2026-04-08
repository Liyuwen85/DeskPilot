const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");

const projectRoot = path.resolve(__dirname, "..");
const mainEntry = path.join(projectRoot, "dist-electron", "electron", "main.js");
const rendererEntry = path.join(projectRoot, "dist", "renderer", "index.html");
const isCheckOnly = process.argv.includes("--check");

function fail(message) {
  console.error(`[DeskPilot] ${message}`);
  process.exit(1);
}

function exists(targetPath) {
  return fs.existsSync(targetPath);
}

function resolveLocalElectronCommand() {
  try {
    const electronExecutablePath = require(require.resolve("electron", { paths: [projectRoot] }));
    return {
      command: electronExecutablePath,
      args: [projectRoot],
      source: "local"
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
  const env = { ...process.env };
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

const localElectron = resolveLocalElectronCommand();
if (isCheckOnly) {
  if (localElectron) {
    console.log("[DeskPilot] Check passed: build outputs exist and local Electron is available.");
  } else {
    console.log("[DeskPilot] Check passed: build outputs exist. Local Electron is unavailable, will rely on global electron.");
  }
  process.exit(0);
}

launch(localElectron || resolveGlobalElectronCommand());
