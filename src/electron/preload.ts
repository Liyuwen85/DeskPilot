import { contextBridge, ipcRenderer } from "electron";
import type {
  ConfirmClosePayload,
  CreateFolderPayload,
  CreateMarkdownPayload,
  CreateTextPayload,
  DeletePathPayload,
  RenamePathPayload,
  SaveBinaryFilePayload,
  SaveFilePayload
} from "../shared/types";

contextBridge.exposeInMainWorld("desktopApi", {
  pickDirectory: () => ipcRenderer.invoke("dialog:pick-directory"),
  openFileDialog: () => ipcRenderer.invoke("dialog:open-file"),
  pickImageFile: (defaultDirectory?: string) => ipcRenderer.invoke("dialog:pick-image-file", defaultDirectory),
  getLaunchWorkspacePath: () => ipcRenderer.invoke("app:get-launch-workspace-path"),
  openDocumentWindow: (targetPath: string) => ipcRenderer.invoke("window:open-document", targetPath),
  updateDocumentWindowState: (payload: { targetPath: string }) => ipcRenderer.send("window:update-document-state", payload),
  confirmCloseTab: (payload: ConfirmClosePayload) => ipcRenderer.invoke("dialog:confirm-close-tab", payload),
  confirmCloseWindow: (payload: ConfirmClosePayload) => ipcRenderer.invoke("dialog:confirm-close-window", payload),
  openWorkspacePath: (targetPath: string) => ipcRenderer.invoke("workspace:open-path", targetPath),
  indexWorkspaceFiles: (rootPath: string) => ipcRenderer.invoke("workspace:index-files", rootPath),
  readDirectory: (directoryPath: string) => ipcRenderer.invoke("workspace:read-directory", directoryPath),
  readFile: (filePath: string) => ipcRenderer.invoke("viewer:read", filePath),
  getFileStats: (filePath: string) => ipcRenderer.invoke("viewer:stat", filePath),
  createMarkdownFile: (payload: CreateMarkdownPayload) => ipcRenderer.invoke("file:create-markdown", payload),
  createTextFile: (payload: CreateTextPayload) => ipcRenderer.invoke("file:create-text", payload),
  createFolder: (payload: CreateFolderPayload) => ipcRenderer.invoke("file:create-folder", payload),
  renamePath: (payload: RenamePathPayload) => ipcRenderer.invoke("file:rename", payload),
  deletePath: (payload: DeletePathPayload) => ipcRenderer.invoke("file:delete", payload),
  revealInExplorer: (targetPath: string) => ipcRenderer.invoke("file:reveal-in-explorer", targetPath),
  openExternalUrl: (targetUrl: string) => ipcRenderer.invoke("shell:open-external-url", targetUrl),
  writeClipboardText: (text: string) => ipcRenderer.invoke("clipboard:write-text", text),
  saveFile: (payload: SaveFilePayload) => ipcRenderer.invoke("file:save", payload),
  saveBinaryFile: (payload: SaveBinaryFilePayload) => ipcRenderer.invoke("file:save-binary", payload),
  saveFileAs: (payload: { defaultPath: string; content: string }) => ipcRenderer.invoke("file:save-as", payload),
  exportFile: (payload: { defaultPath: string; content: string }) => ipcRenderer.invoke("file:export", payload),
  onRequestWindowClose: (listener: () => void) => {
    const wrapped = () => listener();
    ipcRenderer.on("window:request-close", wrapped);
    return () => ipcRenderer.removeListener("window:request-close", wrapped);
  },
  onWindowEscape: (listener: () => void) => {
    const wrapped = () => listener();
    ipcRenderer.on("window:escape", wrapped);
    return () => ipcRenderer.removeListener("window:escape", wrapped);
  },
  onOpenWorkspacePath: (listener: (targetPath: string) => void) => {
    const wrapped = (_event: Electron.IpcRendererEvent, targetPath: string) => listener(targetPath);
    ipcRenderer.on("workspace:open-external-path", wrapped);
    return () => ipcRenderer.removeListener("workspace:open-external-path", wrapped);
  },
  onRestoreDocumentTab: (listener: (targetPath: string) => void) => {
    const wrapped = (_event: Electron.IpcRendererEvent, targetPath: string) => listener(targetPath);
    ipcRenderer.on("workspace:restore-document-tab", wrapped);
    return () => ipcRenderer.removeListener("workspace:restore-document-tab", wrapped);
  },
  confirmWindowClose: () => ipcRenderer.send("window:confirm-close"),
  newWindow: () => ipcRenderer.invoke("window:new"),
  quitApp: () => ipcRenderer.send("app:quit"),
  minimizeWindow: () => ipcRenderer.send("window:minimize"),
  toggleMaximizeWindow: () => ipcRenderer.send("window:maximize-toggle"),
  toggleAlwaysOnTop: () => ipcRenderer.invoke("window:always-on-top-toggle"),
  isWindowAlwaysOnTop: () => ipcRenderer.invoke("window:is-always-on-top"),
  zoomInWindow: () => ipcRenderer.invoke("window:zoom-in"),
  zoomOutWindow: () => ipcRenderer.invoke("window:zoom-out"),
  closeWindow: () => ipcRenderer.send("window:close"),
  isWindowMaximized: () => ipcRenderer.invoke("window:is-maximized")
});
