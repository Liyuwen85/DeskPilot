const fs = require("fs");
const fsp = require("fs/promises");
const path = require("path");
const { applyWindowsExecutableBranding } = require("./windows-branding.cjs");

const projectRoot = path.resolve(__dirname, "..");
const electronPackagePath = require.resolve("electron/package.json", { paths: [projectRoot] });
const electronRoot = path.dirname(electronPackagePath);
const electronDist = path.join(electronRoot, "dist");
const releaseRoot = path.join(projectRoot, "release");
const releaseDir = path.join(releaseRoot, "DeskPilot-win32-x64");
const appDir = path.join(releaseDir, "resources", "app");
const productName = "DeskPilot";
const appId = "com.doveyh.deskpilot";
const iconPngPath = path.join(projectRoot, "screenshot", "deskpilot_logo.png");

function assertExists(targetPath, label) {
  if (!fs.existsSync(targetPath)) {
    throw new Error(`Missing ${label}: ${targetPath}`);
  }
}

async function cleanDir(targetPath) {
  await fsp.rm(targetPath, { recursive: true, force: true });
  await fsp.mkdir(targetPath, { recursive: true });
}

async function copyDir(sourcePath, targetPath) {
  await fsp.mkdir(path.dirname(targetPath), { recursive: true });
  await fsp.cp(sourcePath, targetPath, { recursive: true, force: true });
}

async function writeAppPackageJson() {
  const sourcePackage = JSON.parse(await fsp.readFile(path.join(projectRoot, "package.json"), "utf-8"));
  const runtimePackage = {
    name: sourcePackage.name,
    productName,
    version: sourcePackage.version,
    description: sourcePackage.description,
    main: "dist-electron/electron/main.js",
    author: sourcePackage.author || "",
    license: sourcePackage.license || "UNLICENSED"
  };

  await fsp.writeFile(
    path.join(appDir, "package.json"),
    `${JSON.stringify(runtimePackage, null, 2)}\n`,
    "utf-8"
  );
}

async function main() {
  assertExists(electronDist, "electron runtime");
  assertExists(path.join(projectRoot, "dist"), "renderer build");
  assertExists(path.join(projectRoot, "dist-electron"), "electron build");

  await cleanDir(releaseRoot);
  await copyDir(electronDist, releaseDir);
  await copyDir(path.join(projectRoot, "dist"), path.join(appDir, "dist"));
  await copyDir(path.join(projectRoot, "dist-electron"), path.join(appDir, "dist-electron"));
  if (fs.existsSync(path.join(projectRoot, "screenshot"))) {
    await copyDir(path.join(projectRoot, "screenshot"), path.join(appDir, "screenshot"));
  }
  await writeAppPackageJson();

  const electronExe = path.join(releaseDir, "electron.exe");
  const productExe = path.join(releaseDir, `${productName}.exe`);
  if (fs.existsSync(electronExe)) {
    await fsp.rename(electronExe, productExe);
  }

  const sourcePackage = JSON.parse(await fsp.readFile(path.join(projectRoot, "package.json"), "utf-8"));
  await applyWindowsExecutableBranding(productExe, {
    productName,
    version: sourcePackage.version,
    iconPngPath,
    iconIcoPath: path.join(releaseRoot, "deskpilot-release.ico"),
    appId,
    companyName: sourcePackage.author || "doveyh",
    copyright: "Copyright 2026 doveyh"
  });

  console.log(`[DeskPilot] Release created: ${releaseDir}`);
  console.log(`[DeskPilot] Launch executable: ${productExe}`);
}

main().catch((error) => {
  console.error(`[DeskPilot] Release build failed: ${error.message}`);
  process.exit(1);
});
