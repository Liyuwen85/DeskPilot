import path from "node:path";
import fsSync from "node:fs";
import fs from "node:fs/promises";
import { app, BrowserWindow, dialog, ipcMain, Menu, shell, type IpcMainInvokeEvent, type WebContents } from "electron";
import type {
  ConfirmClosePayload,
  ConfirmCloseResult,
  CreateFolderPayload,
  CreateMarkdownPayload,
  CreateMarkdownResult,
  CreateTextPayload,
  DeletePathPayload,
  FileKind,
  FileTab,
  RenamePathPayload,
  SaveFilePayload,
  SaveFileResult,
  TreeNode,
  WorkspaceMutationResult,
  WorkspacePayload
} from "../shared/types";

type AppWindow = BrowserWindow & { __allowClose?: boolean };

const APP_NAME = "DeskPilot";
const APP_USER_MODEL_ID = "com.doveyh.deskpilot";
const APP_ICON_PATH = path.join(app.getAppPath(), "screenshot", "deskpilot_logo.png");

let mainWindow: AppWindow | null = null;
let pendingLaunchWorkspacePath = "";
const isDevRuntime = !app.isPackaged || process.env.DESKPILOT_DEV === "1";

function normalizeCliPath(candidatePath: string): string {
  return path.resolve(candidatePath);
}

function extractLaunchWorkspacePath(argv: string[]): string {
  const appPath = app.getAppPath();
  const ignoredPaths = new Set<string>([
    normalizeCliPath(process.execPath),
    normalizeCliPath(appPath),
    normalizeCliPath(path.join(appPath, "dist-electron", "electron", "main.js"))
  ]);

  for (const rawArg of argv) {
    if (!rawArg || rawArg.startsWith("-")) {
      continue;
    }

    const candidatePath = normalizeCliPath(rawArg);
    if (ignoredPaths.has(candidatePath)) {
      continue;
    }

    if (fsSync.existsSync(candidatePath)) {
      return candidatePath;
    }
  }

  return "";
}

function extractLaunchWorkspacePathFromCwd(): string {
  const candidatePath = normalizeCliPath(process.cwd());
  const ignoredPaths = new Set<string>([
    normalizeCliPath(app.getAppPath()),
    normalizeCliPath(path.dirname(process.execPath)),
    normalizeCliPath(path.dirname(app.getAppPath()))
  ]);

  if (ignoredPaths.has(candidatePath)) {
    return "";
  }

  return fsSync.existsSync(candidatePath) ? candidatePath : "";
}

function sendWorkspacePathToWindow(window: AppWindow | null, targetPath: string) {
  if (!window || !targetPath) {
    return;
  }

  if (window.webContents.isLoading()) {
    window.webContents.once("did-finish-load", () => {
      window.webContents.send("workspace:open-external-path", targetPath);
    });
    return;
  }

  window.webContents.send("workspace:open-external-path", targetPath);
}

function getFileKind(filePath: string): FileKind {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === ".md" || ext === ".markdown" || ext === ".mdx") {
    return "markdown";
  }

  return "text";
}

function isTextFile(filePath: string): boolean {
  const ext = path.extname(filePath).toLowerCase();
  const textExtensions = new Set([
    ".txt", ".md", ".markdown", ".mdx", ".json", ".js", ".cjs", ".mjs",
    ".ts", ".tsx", ".jsx", ".html", ".css", ".scss", ".sass", ".less",
    ".xml", ".yml", ".yaml", ".toml", ".ini", ".log", ".csv", ".py",
    ".java", ".cpp", ".c", ".h", ".hpp", ".rs", ".go", ".sh", ".ps1",
    ".bat", ".sql"
  ]);

  return textExtensions.has(ext) || ext === "";
}

function getWindowFromSender(sender: WebContents): AppWindow | null {
  return BrowserWindow.fromWebContents(sender) as AppWindow | null;
}

function getWindowFromEvent(event: IpcMainInvokeEvent): AppWindow | null {
  return getWindowFromSender(event.sender);
}

async function buildDirectoryTree(targetPath: string): Promise<TreeNode> {
  const stat = await fs.stat(targetPath);
  if (!stat.isDirectory()) {
    return {
      name: path.basename(targetPath) || targetPath,
      path: targetPath,
      type: "file",
      hasChildren: false,
      childrenLoaded: true
    };
  }

  const children = await readDirectoryChildren(targetPath);
  return {
    name: path.basename(targetPath) || targetPath,
    path: targetPath,
    type: "directory",
    hasChildren: children.length > 0,
    childrenLoaded: true,
    children
  };
}

async function readDirectoryChildren(targetPath: string): Promise<TreeNode[]> {
  const entries = await fs.readdir(targetPath, { withFileTypes: true });
  const visibleEntries = entries
    .filter((entry) => !entry.name.startsWith("."))
    .sort((left, right) => {
      if (left.isDirectory() && !right.isDirectory()) return -1;
      if (!left.isDirectory() && right.isDirectory()) return 1;
      return left.name.localeCompare(right.name, "zh-CN");
    });

  return Promise.all(visibleEntries.map(async (entry) => {
    const entryPath = path.join(targetPath, entry.name);
    if (!entry.isDirectory()) {
      return {
        name: entry.name,
        path: entryPath,
        type: "file",
        hasChildren: false,
        childrenLoaded: true
      } satisfies TreeNode;
    }

    let hasChildren = false;
    try {
      const childEntries = await fs.readdir(entryPath, { withFileTypes: true });
      hasChildren = childEntries.some((child) => !child.name.startsWith("."));
    } catch {
      hasChildren = false;
    }

    return {
      name: entry.name,
      path: entryPath,
      type: "directory",
      hasChildren,
      childrenLoaded: false,
      children: []
    } satisfies TreeNode;
  }));
}

async function readTextFilePayload(filePath: string): Promise<FileTab> {
  const stat = await fs.stat(filePath);
  if (!stat.isFile()) {
    throw new Error("Target is not a file.");
  }

  if (!isTextFile(filePath)) {
    return {
      path: filePath,
      name: path.basename(filePath),
      content: "当前示例仅支持文本文件预览。",
      encoding: "utf-8",
      readonlyHint: true,
      kind: "binary",
      isTemporary: false
    };
  }

  const content = await fs.readFile(filePath, "utf-8");
  return {
    path: filePath,
    name: path.basename(filePath),
    content,
    encoding: "utf-8",
    readonlyHint: false,
    kind: getFileKind(filePath),
    isTemporary: false
  };
}

async function loadWorkspaceFromPath(targetPath: string): Promise<WorkspacePayload> {
  const stat = await fs.stat(targetPath);
  if (stat.isDirectory()) {
    return {
      entryType: "directory",
      rootPath: targetPath,
      tree: await buildDirectoryTree(targetPath)
    };
  }

  const rootPath = path.dirname(targetPath);
  return {
    entryType: "file",
    rootPath,
    tree: await buildDirectoryTree(rootPath),
    file: await readTextFilePayload(targetPath)
  };
}

function normalizeMarkdownName(inputName?: string): string {
  const baseName = String(inputName || "untitled")
    .trim()
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, "_");
  const withoutDots = baseName.replace(/\.+$/, "");
  const finalName = withoutDots || "untitled";
  return finalName.toLowerCase().endsWith(".md") ? finalName : `${finalName}.md`;
}

function normalizeTextName(inputName?: string): string {
  const baseName = String(inputName || "untitled")
    .trim()
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, "_");
  const withoutDots = baseName.replace(/\.+$/, "");
  const finalName = withoutDots || "untitled";
  return path.extname(finalName) ? finalName : `${finalName}.txt`;
}

function normalizeFolderName(inputName?: string): string {
  const baseName = String(inputName || "New Folder")
    .trim()
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, "_");
  const withoutDots = baseName.replace(/\.+$/, "");
  return withoutDots || "New Folder";
}

async function findAvailableFilePath(directoryPath: string, requestedName: string): Promise<string> {
  const parsed = path.parse(requestedName);
  let candidate = path.join(directoryPath, requestedName);
  let suffix = 2;

  while (true) {
    try {
      await fs.access(candidate);
      candidate = path.join(directoryPath, `${parsed.name}-${suffix}${parsed.ext || ".md"}`);
      suffix += 1;
    } catch {
      return candidate;
    }
  }
}

async function findAvailableDirectoryPath(parentDirectory: string, requestedName: string): Promise<string> {
  let candidate = path.join(parentDirectory, requestedName);
  let suffix = 2;

  while (true) {
    try {
      await fs.access(candidate);
      candidate = path.join(parentDirectory, `${requestedName}-${suffix}`);
      suffix += 1;
    } catch {
      return candidate;
    }
  }
}

async function buildWorkspaceMutationResult(rootPath: string, targetPath?: string): Promise<WorkspaceMutationResult> {
  return {
    rootPath,
    tree: await buildDirectoryTree(rootPath),
    targetPath
  };
}

async function ensureDirectoryPath(targetPath: string): Promise<void> {
  const stat = await fs.stat(targetPath);
  if (!stat.isDirectory()) {
    throw new Error("Target directory is invalid.");
  }
}

async function renameOrMove(sourcePath: string, destinationPath: string): Promise<void> {
  try {
    await fs.rename(sourcePath, destinationPath);
  } catch (error) {
    if (!(error && typeof error === "object" && "code" in error && error.code === "EXDEV")) {
      throw error;
    }

    await fs.cp(sourcePath, destinationPath, { recursive: true, force: false, errorOnExist: true });
    await fs.rm(sourcePath, { recursive: true, force: true });
  }
}

async function createWindow(): Promise<AppWindow> {
  Menu.setApplicationMenu(null);

  const window = new BrowserWindow({
    width: 1100,
    height: 720,
    minWidth: 1000,
    minHeight: 640,
    frame: false,
    title: APP_NAME,
    titleBarStyle: "hidden",
    backgroundColor: "#111827",
    icon: fsSync.existsSync(APP_ICON_PATH) ? APP_ICON_PATH : undefined,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false
    }
  }) as AppWindow;

  window.__allowClose = false;

  window.on("close", (event) => {
    if (window.__allowClose) {
      return;
    }

    event.preventDefault();
    window.webContents.send("window:request-close");
  });

  if (isDevRuntime) {
    window.webContents.on("before-input-event", (_event, input) => {
      const key = String(input.key || "").toUpperCase();
      const openDevTools = key === "F12" || (key === "I" && input.control && input.shift);

      if (!openDevTools || input.type !== "keyDown") {
        return;
      }

      if (window.webContents.isDevToolsOpened()) {
        window.webContents.closeDevTools();
      } else {
        window.webContents.openDevTools({ mode: "detach" });
      }
    });
  }

  await window.loadFile(path.join(app.getAppPath(), "dist", "renderer", "index.html"));
  mainWindow = window;
  window.on("closed", () => {
    if (mainWindow === window) {
      mainWindow = null;
    }
  });
  return window;
}

app.setName(APP_NAME);
app.setAppUserModelId(APP_USER_MODEL_ID);

const hasSingleInstanceLock = app.requestSingleInstanceLock();
if (!hasSingleInstanceLock) {
  app.quit();
}

pendingLaunchWorkspacePath = extractLaunchWorkspacePath(process.argv) || extractLaunchWorkspacePathFromCwd();

app.on("second-instance", (_event, argv) => {
  const nextWorkspacePath = extractLaunchWorkspacePath(argv);
  if (nextWorkspacePath) {
    pendingLaunchWorkspacePath = nextWorkspacePath;
  }
  if (!mainWindow) {
    return;
  }

  if (mainWindow.isMinimized()) {
    mainWindow.restore();
  }
  mainWindow.focus();

  if (nextWorkspacePath) {
    sendWorkspacePathToWindow(mainWindow, nextWorkspacePath);
  }
});

app.whenReady().then(async () => {
  const window = await createWindow();
  if (pendingLaunchWorkspacePath) {
    sendWorkspacePathToWindow(window, pendingLaunchWorkspacePath);
  }

  app.on("activate", async () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      const nextWindow = await createWindow();
      if (pendingLaunchWorkspacePath) {
        sendWorkspacePathToWindow(nextWindow, pendingLaunchWorkspacePath);
      }
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

ipcMain.handle("dialog:pick-directory", async (event) => {
  const currentWindow = getWindowFromEvent(event);
  if (!currentWindow) {
    return null;
  }

  const result = await dialog.showOpenDialog(currentWindow, {
    properties: ["openDirectory"]
  });

  if (result.canceled || result.filePaths.length === 0) {
    return null;
  }

  return loadWorkspaceFromPath(result.filePaths[0]);
});

ipcMain.handle("dialog:open-file", async (event) => {
  const currentWindow = getWindowFromEvent(event);
  if (!currentWindow) {
    return null;
  }

  const result = await dialog.showOpenDialog(currentWindow, {
    properties: ["openFile"]
  });

  if (result.canceled || result.filePaths.length === 0) {
    return null;
  }

  return loadWorkspaceFromPath(result.filePaths[0]);
});

ipcMain.handle("dialog:pick-image-file", async (event, defaultDirectory?: string) => {
  const currentWindow = getWindowFromEvent(event);
  if (!currentWindow) {
    return null;
  }

  const result = await dialog.showOpenDialog(currentWindow, {
    properties: ["openFile"],
    defaultPath: typeof defaultDirectory === "string" && defaultDirectory ? defaultDirectory : undefined,
    filters: [
      { name: "Images", extensions: ["png", "jpg", "jpeg", "gif", "webp", "bmp", "svg", "avif"] },
      { name: "All Files", extensions: ["*"] }
    ]
  });

  if (result.canceled || result.filePaths.length === 0) {
    return null;
  }

  return result.filePaths[0];
});

ipcMain.handle("app:get-launch-workspace-path", async () => {
  const nextPath = pendingLaunchWorkspacePath;
  pendingLaunchWorkspacePath = "";
  return nextPath;
});

ipcMain.handle("dialog:confirm-close-tab", async (event, payload: ConfirmClosePayload): Promise<ConfirmCloseResult> => {
  const currentWindow = getWindowFromEvent(event);
  if (!currentWindow) {
    return { action: "cancel" };
  }

  const fileName = typeof payload?.fileName === "string" && payload.fileName
    ? payload.fileName
    : "当前文档";

  const result = await dialog.showMessageBox(currentWindow, {
    type: "warning",
    title: "关闭前保存",
    message: `“${fileName}”尚未保存。`,
    detail: "要在关闭前保存更改吗？",
    buttons: ["保存", "不保存", "取消"],
    defaultId: 0,
    cancelId: 2,
    noLink: true
  });

  if (result.response === 0) {
    return { action: "save" };
  }

  if (result.response === 1) {
    return { action: "discard" };
  }

  return { action: "cancel" };
});

ipcMain.handle("dialog:confirm-close-window", async (event, payload: ConfirmClosePayload): Promise<ConfirmCloseResult> => {
  const currentWindow = getWindowFromEvent(event);
  if (!currentWindow) {
    return { action: "cancel" };
  }

  const dirtyCount = Number(payload?.dirtyCount) || 0;
  const label = dirtyCount > 1 ? `${dirtyCount} 个文档` : "当前文档";

  const result = await dialog.showMessageBox(currentWindow, {
    type: "warning",
    title: "关闭窗口前保存",
    message: `${label}尚未保存。`,
    detail: "要在关闭窗口前保存更改吗？",
    buttons: ["全部保存", "不保存", "取消"],
    defaultId: 0,
    cancelId: 2,
    noLink: true
  });

  if (result.response === 0) {
    return { action: "save" };
  }

  if (result.response === 1) {
    return { action: "discard" };
  }

  return { action: "cancel" };
});

ipcMain.handle("workspace:open-path", async (_event, targetPath: string) => {
  if (typeof targetPath !== "string" || !targetPath) {
    throw new Error("Target path is required.");
  }

  return loadWorkspaceFromPath(targetPath);
});

ipcMain.handle("workspace:read-directory", async (_event, directoryPath: string) => {
  if (typeof directoryPath !== "string" || !directoryPath) {
    throw new Error("Directory path is required.");
  }

  const stat = await fs.stat(directoryPath);
  if (!stat.isDirectory()) {
    throw new Error("Target path is not a directory.");
  }

  return readDirectoryChildren(directoryPath);
});

ipcMain.handle("viewer:read", async (_event, filePath: string) => {
  return readTextFilePayload(filePath);
});

ipcMain.handle("file:create-markdown", async (_event, payload: CreateMarkdownPayload): Promise<CreateMarkdownResult> => {
  if (!payload || typeof payload.rootPath !== "string" || !payload.rootPath) {
    throw new Error("Workspace root path is required.");
  }

  const targetDirectory = typeof payload.parentPath === "string" && payload.parentPath
    ? payload.parentPath
    : payload.rootPath;

  const stat = await fs.stat(targetDirectory);
  if (!stat.isDirectory()) {
    throw new Error("Target directory is invalid.");
  }

  const requestedName = normalizeMarkdownName(payload.fileName);
  const filePath = await findAvailableFilePath(targetDirectory, requestedName);
  await fs.writeFile(filePath, "", "utf-8");

  return {
    filePath,
    rootPath: payload.rootPath,
    tree: await buildDirectoryTree(payload.rootPath)
  };
});

ipcMain.handle("file:create-text", async (_event, payload: CreateTextPayload): Promise<WorkspaceMutationResult> => {
  if (!payload || typeof payload.rootPath !== "string" || !payload.rootPath) {
    throw new Error("Workspace root path is required.");
  }

  const targetDirectory = typeof payload.parentPath === "string" && payload.parentPath
    ? payload.parentPath
    : payload.rootPath;

  await ensureDirectoryPath(targetDirectory);
  const filePath = await findAvailableFilePath(targetDirectory, normalizeTextName(payload.fileName));
  await fs.writeFile(filePath, "", "utf-8");
  return buildWorkspaceMutationResult(payload.rootPath, filePath);
});

ipcMain.handle("file:create-folder", async (_event, payload: CreateFolderPayload): Promise<WorkspaceMutationResult> => {
  if (!payload || typeof payload.rootPath !== "string" || !payload.rootPath) {
    throw new Error("Workspace root path is required.");
  }

  const targetDirectory = typeof payload.parentPath === "string" && payload.parentPath
    ? payload.parentPath
    : payload.rootPath;

  await ensureDirectoryPath(targetDirectory);
  const folderPath = await findAvailableDirectoryPath(targetDirectory, normalizeFolderName(payload.folderName));
  await fs.mkdir(folderPath, { recursive: true });
  return buildWorkspaceMutationResult(payload.rootPath, folderPath);
});

ipcMain.handle("file:rename", async (_event, payload: RenamePathPayload): Promise<WorkspaceMutationResult> => {
  if (
    !payload ||
    typeof payload.rootPath !== "string" ||
    typeof payload.targetPath !== "string" ||
    typeof payload.nextName !== "string"
  ) {
    throw new Error("Invalid rename payload.");
  }

  const targetDirectory = path.dirname(payload.targetPath);
  const nextBaseName = payload.nextName.trim().replace(/[<>:"/\\|?*\x00-\x1F]/g, "_");
  if (!nextBaseName) {
    throw new Error("New name is required.");
  }

  const nextPath = path.join(targetDirectory, nextBaseName);
  if (nextPath !== payload.targetPath) {
    await renameOrMove(payload.targetPath, nextPath);
  }

  return buildWorkspaceMutationResult(payload.rootPath, nextPath);
});

ipcMain.handle("file:delete", async (_event, payload: DeletePathPayload): Promise<WorkspaceMutationResult> => {
  if (!payload || typeof payload.rootPath !== "string" || typeof payload.targetPath !== "string") {
    throw new Error("Invalid delete payload.");
  }

  await fs.rm(payload.targetPath, { recursive: true, force: true });
  return buildWorkspaceMutationResult(payload.rootPath);
});

ipcMain.handle("file:reveal-in-explorer", async (_event, targetPath: string) => {
  if (typeof targetPath !== "string" || !targetPath) {
    return { ok: false };
  }

  shell.showItemInFolder(targetPath);
  return { ok: true };
});

ipcMain.handle("shell:open-external-url", async (_event, targetUrl: string) => {
  if (typeof targetUrl !== "string" || !targetUrl) {
    return { ok: false };
  }

  try {
    const parsedUrl = new URL(targetUrl);
    if (!["http:", "https:", "mailto:"].includes(parsedUrl.protocol)) {
      return { ok: false };
    }

    await shell.openExternal(parsedUrl.toString());
    return { ok: true };
  } catch {
    return { ok: false };
  }
});

ipcMain.handle("file:save", async (_event, payload: SaveFilePayload): Promise<SaveFileResult> => {
  if (!payload || typeof payload.filePath !== "string" || typeof payload.content !== "string") {
    throw new Error("Invalid save payload.");
  }

  await fs.writeFile(payload.filePath, payload.content, "utf-8");
  return {
    ok: true,
    filePath: payload.filePath
  };
});

ipcMain.handle("file:save-as", async (event, payload: { defaultPath: string; content: string }): Promise<SaveFileResult> => {
  const currentWindow = getWindowFromEvent(event);
  if (!currentWindow || !payload || typeof payload.content !== "string") {
    throw new Error("Invalid save-as payload.");
  }

  const defaultPath = typeof payload.defaultPath === "string" && payload.defaultPath
    ? payload.defaultPath
    : path.join(app.getPath("documents"), "untitled.md");

  const result = await dialog.showSaveDialog(currentWindow, {
    title: "另存为",
    defaultPath
  });

  if (result.canceled || !result.filePath) {
    return { canceled: true };
  }

  await fs.writeFile(result.filePath, payload.content, "utf-8");
  return {
    canceled: false,
    filePath: result.filePath
  };
});

ipcMain.handle("file:export", async (event, payload: { defaultPath: string; content: string }): Promise<SaveFileResult> => {
  const currentWindow = getWindowFromEvent(event);
  if (!currentWindow || !payload || typeof payload.content !== "string") {
    return { canceled: true };
  }

  const defaultPath = typeof payload.defaultPath === "string" && payload.defaultPath
    ? payload.defaultPath
    : path.join(app.getPath("documents"), "export.txt");

  const result = await dialog.showSaveDialog(currentWindow, {
    title: "导出文件",
    defaultPath
  });

  if (result.canceled || !result.filePath) {
    return { canceled: true };
  }

  await fs.writeFile(result.filePath, payload.content, "utf-8");
  return {
    canceled: false,
    filePath: result.filePath
  };
});

ipcMain.handle("window:new", async () => {
  await createWindow();
  return { ok: true };
});

ipcMain.on("app:quit", () => {
  const windows = BrowserWindow.getAllWindows() as AppWindow[];
  if (windows.length === 0) {
    app.quit();
    return;
  }

  for (const currentWindow of windows) {
    currentWindow.webContents.send("window:request-close");
  }
});

ipcMain.on("window:minimize", (event) => {
  getWindowFromSender(event.sender)?.minimize();
});

ipcMain.on("window:maximize-toggle", (event) => {
  const currentWindow = getWindowFromSender(event.sender);
  if (!currentWindow) {
    return;
  }

  if (currentWindow.isMaximized()) {
    currentWindow.unmaximize();
  } else {
    currentWindow.maximize();
  }
});

ipcMain.on("window:close", (event) => {
  getWindowFromSender(event.sender)?.close();
});

ipcMain.on("window:confirm-close", (event) => {
  const currentWindow = getWindowFromSender(event.sender);
  if (!currentWindow) {
    return;
  }

  currentWindow.__allowClose = true;
  currentWindow.close();
});

ipcMain.handle("window:is-maximized", (event) => {
  return getWindowFromEvent(event)?.isMaximized() ?? false;
});
