import { contextBridge, ipcRenderer } from "electron";
import type {
  ConfirmClosePayload,
  CreateFolderPayload,
  CreateMarkdownPayload,
  CreateTextPayload,
  DeletePathPayload,
  RenamePathPayload,
  SaveFilePayload
} from "../shared/types";

contextBridge.exposeInMainWorld("desktopApi", {
  pickDirectory: () => ipcRenderer.invoke("dialog:pick-directory"),
  openFileDialog: () => ipcRenderer.invoke("dialog:open-file"),
  getLaunchWorkspacePath: () => ipcRenderer.invoke("app:get-launch-workspace-path"),
  confirmCloseTab: (payload: ConfirmClosePayload) => ipcRenderer.invoke("dialog:confirm-close-tab", payload),
  confirmCloseWindow: (payload: ConfirmClosePayload) => ipcRenderer.invoke("dialog:confirm-close-window", payload),
  openWorkspacePath: (targetPath: string) => ipcRenderer.invoke("workspace:open-path", targetPath),
  readDirectory: (directoryPath: string) => ipcRenderer.invoke("workspace:read-directory", directoryPath),
  readFile: (filePath: string) => ipcRenderer.invoke("viewer:read", filePath),
  createMarkdownFile: (payload: CreateMarkdownPayload) => ipcRenderer.invoke("file:create-markdown", payload),
  createTextFile: (payload: CreateTextPayload) => ipcRenderer.invoke("file:create-text", payload),
  createFolder: (payload: CreateFolderPayload) => ipcRenderer.invoke("file:create-folder", payload),
  renamePath: (payload: RenamePathPayload) => ipcRenderer.invoke("file:rename", payload),
  deletePath: (payload: DeletePathPayload) => ipcRenderer.invoke("file:delete", payload),
  revealInExplorer: (targetPath: string) => ipcRenderer.invoke("file:reveal-in-explorer", targetPath),
  openExternalUrl: (targetUrl: string) => ipcRenderer.invoke("shell:open-external-url", targetUrl),
  saveFile: (payload: SaveFilePayload) => ipcRenderer.invoke("file:save", payload),
  saveFileAs: (payload: { defaultPath: string; content: string }) => ipcRenderer.invoke("file:save-as", payload),
  exportFile: (payload: { defaultPath: string; content: string }) => ipcRenderer.invoke("file:export", payload),
  onRequestWindowClose: (listener: () => void) => {
    const wrapped = () => listener();
    ipcRenderer.on("window:request-close", wrapped);
    return () => ipcRenderer.removeListener("window:request-close", wrapped);
  },
  onOpenWorkspacePath: (listener: (targetPath: string) => void) => {
    const wrapped = (_event: Electron.IpcRendererEvent, targetPath: string) => listener(targetPath);
    ipcRenderer.on("workspace:open-external-path", wrapped);
    return () => ipcRenderer.removeListener("workspace:open-external-path", wrapped);
  },
  confirmWindowClose: () => ipcRenderer.send("window:confirm-close"),
  newWindow: () => ipcRenderer.invoke("window:new"),
  quitApp: () => ipcRenderer.send("app:quit"),
  minimizeWindow: () => ipcRenderer.send("window:minimize"),
  toggleMaximizeWindow: () => ipcRenderer.send("window:maximize-toggle"),
  closeWindow: () => ipcRenderer.send("window:close"),
  isWindowMaximized: () => ipcRenderer.invoke("window:is-maximized")
});
