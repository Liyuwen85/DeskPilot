export type FileKind = "markdown" | "text" | "image" | "audio" | "video" | "pdf" | "webpage" | "binary";
export type TreeNodeType = "directory" | "file";
export type CloseAction = "save" | "discard" | "cancel";
export type ToastType = "success" | "error" | "info";

export interface TreeNode {
  name: string;
  path: string;
  type: TreeNodeType;
  hasChildren?: boolean;
  childrenLoaded?: boolean;
  children?: TreeNode[];
}

export interface FileTab {
  path: string;
  name: string;
  content: string;
  encoding: string;
  readonlyHint: boolean;
  kind: FileKind;
  isTemporary: boolean;
  preferredDirectory?: string;
}

export interface WorkspacePayload {
  entryType: "directory" | "file";
  rootPath: string;
  tree: TreeNode;
  file?: FileTab;
}

export interface RecentItem {
  path: string;
  kind: "file" | "directory";
  label: string;
  timestamp: number;
}

export interface MarkdownDraft {
  html: string;
  text: string;
}

export interface ConfirmClosePayload {
  fileName?: string;
  dirtyCount?: number;
}

export interface ConfirmCloseResult {
  action: CloseAction;
}

export interface SaveFilePayload {
  filePath: string;
  content: string;
}

export interface SaveBinaryFilePayload {
  defaultPath: string;
  base64Data: string;
}

export interface SaveFileResult {
  ok?: boolean;
  canceled?: boolean;
  filePath?: string;
  requiresSaveAs?: boolean;
  reason?: string;
}

export interface CreateMarkdownPayload {
  rootPath: string;
  parentPath?: string;
  fileName?: string;
}

export interface CreateMarkdownResult {
  filePath: string;
  rootPath: string;
  tree: TreeNode;
}

export interface CreateTextPayload {
  rootPath: string;
  parentPath?: string;
  fileName?: string;
}

export interface CreateFolderPayload {
  rootPath: string;
  parentPath?: string;
  folderName?: string;
}

export interface RenamePathPayload {
  rootPath: string;
  targetPath: string;
  nextName: string;
}

export interface DeletePathPayload {
  rootPath: string;
  targetPath: string;
}

export interface WorkspaceMutationResult {
  rootPath: string;
  tree: TreeNode;
  targetPath?: string;
}

export interface FileStatsResult {
  size: number;
}

export interface WorkspaceIndexEntry {
  name: string;
  path: string;
}

export interface DesktopApi {
  pickDirectory: () => Promise<WorkspacePayload | null>;
  openFileDialog: () => Promise<WorkspacePayload | null>;
  pickImageFile: (defaultDirectory?: string) => Promise<string | null>;
  getLaunchWorkspacePath: () => Promise<string>;
  openDocumentWindow: (targetPath: string) => Promise<{ ok: boolean }>;
  updateDocumentWindowState: (payload: { targetPath: string }) => void;
  confirmCloseTab: (payload: ConfirmClosePayload) => Promise<ConfirmCloseResult>;
  confirmCloseWindow: (payload: ConfirmClosePayload) => Promise<ConfirmCloseResult>;
  openWorkspacePath: (targetPath: string) => Promise<WorkspacePayload>;
  indexWorkspaceFiles: (rootPath: string) => Promise<WorkspaceIndexEntry[]>;
  readDirectory: (directoryPath: string) => Promise<TreeNode[]>;
  readFile: (filePath: string) => Promise<FileTab>;
  getFileStats: (filePath: string) => Promise<FileStatsResult>;
  createMarkdownFile: (payload: CreateMarkdownPayload) => Promise<CreateMarkdownResult>;
  createTextFile: (payload: CreateTextPayload) => Promise<WorkspaceMutationResult>;
  createFolder: (payload: CreateFolderPayload) => Promise<WorkspaceMutationResult>;
  renamePath: (payload: RenamePathPayload) => Promise<WorkspaceMutationResult>;
  deletePath: (payload: DeletePathPayload) => Promise<WorkspaceMutationResult>;
  revealInExplorer: (targetPath: string) => Promise<{ ok: boolean }>;
  openExternalUrl: (targetUrl: string) => Promise<{ ok: boolean }>;
  writeClipboardText: (text: string) => Promise<{ ok: boolean }>;
  saveFile: (payload: SaveFilePayload) => Promise<SaveFileResult>;
  saveBinaryFile: (payload: SaveBinaryFilePayload) => Promise<SaveFileResult>;
  saveFileAs: (payload: { defaultPath: string; content: string }) => Promise<SaveFileResult>;
  exportFile: (payload: { defaultPath: string; content: string }) => Promise<SaveFileResult>;
  onRequestWindowClose: (listener: () => void) => () => void;
  onWindowEscape: (listener: () => void) => () => void;
  onOpenWorkspacePath: (listener: (targetPath: string) => void) => () => void;
  onRestoreDocumentTab: (listener: (targetPath: string) => void) => () => void;
  confirmWindowClose: () => void;
  newWindow: () => Promise<{ ok: boolean }>;
  quitApp: () => void;
  minimizeWindow: () => void;
  toggleMaximizeWindow: () => void;
  closeWindow: () => void;
  isWindowMaximized: () => Promise<boolean>;
}
