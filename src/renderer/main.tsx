import React, { type CSSProperties } from "react";
import ReactDOM from "react-dom/client";
import { isMarkdownTabDirty as computeMarkdownTabDirty, isTabDirty as computeTabDirty } from "./close-guards";
import { closeTabWithPrompt } from "./close-workflow";
import { serializeMarkdownDraftAsync } from "./markdown-serializer";
import { saveActiveTab, saveTabAsWithPath, saveTabWithPath } from "./save-workflow";
import { UI_TEXT } from "./ui-text";
import { ActivityBar } from "./components/ActivityBar";
import { CommandSearch } from "./components/CommandSearch";
import { EditorHost } from "./components/EditorHost";
import type { TiptapCommandApi, TiptapOutlineApi, TiptapOutlineItem } from "./components/TiptapTabPane";
import { FileMenu } from "./components/FileMenu";
import { Toast } from "./components/Toast";
import { TreeView } from "./components/TreeView";
import { DocumentApp } from "./DocumentApp";
import { useToast } from "./use-toast";
import "katex/dist/katex.min.css";
import "./styles.css";

const rendererSearchParams = new URLSearchParams(window.location.search);
const rendererMode = rendererSearchParams.get("mode");
const documentTargetPath = rendererSearchParams.get("targetPath") || "";
const REPOSITORY_URL = "https://github.com/Liyuwen85/DeskPilot";
const GETTING_STARTED_URL = `${REPOSITORY_URL}/blob/main/README.md`;
const MARKDOWN_HANDBOOK_URL = `${REPOSITORY_URL}/blob/main/docs/markdown-handbook.zh-CN.md`;
const LICENSE_URL = `${REPOSITORY_URL}/blob/main/LICENSE`;

console.log("[renderer:boot]", {
  href: window.location.href,
  mode: rendererMode,
  targetPath: documentTargetPath
});

window.addEventListener("error", (event) => {
  console.error("[renderer:error]", event.message, event.filename, event.lineno, event.colno, event.error);
});

window.addEventListener("unhandledrejection", (event) => {
  console.error("[renderer:unhandledrejection]", event.reason);
});

const RECENT_ITEMS_KEY = "deskpilot:recent-items";
const SIDEBAR_WIDTH_KEY = "deskpilot:sidebar-width";
const LAST_WORKSPACE_PATH_KEY = "deskpilot:last-workspace-path";
const LAST_ACTIVE_FILE_PATH_KEY = "deskpilot:last-active-file-path";
const LAST_TAB_PATHS_KEY = "deskpilot:last-tab-paths";
const SESSION_SNAPSHOT_KEY = "deskpilot:session-snapshot";
const SIDEBAR_MIN_WIDTH = 220;
const SIDEBAR_MAX_WIDTH = 520;

function normalizePathSeparators(targetPath) {
  return String(targetPath || "").replace(/[\\/]+/g, "/");
}

function getBaseName(targetPath) {
  const normalized = normalizePathSeparators(targetPath).replace(/\/$/, "");
  if (!normalized) {
    return "";
  }

  const segments = normalized.split("/");
  return segments[segments.length - 1] || normalized;
}

function getDirName(targetPath) {
  const normalized = normalizePathSeparators(targetPath).replace(/\/$/, "");
  if (!normalized) {
    return "";
  }

  const index = normalized.lastIndexOf("/");
  if (index <= 0) {
    return normalized;
  }

  const prefix = normalized.slice(0, index);
  return /^[a-zA-Z]:$/.test(prefix) ? `${prefix}\\` : prefix.replace(/\//g, "\\");
}

function joinFilePath(basePath, fileName) {
  if (!basePath) {
    return fileName;
  }

  const normalizedBase = String(basePath).replace(/[\\/]+$/, "");
  return `${normalizedBase}\\${fileName}`;
}

function loadRecentItems() {
  try {
    const raw = window.localStorage.getItem(RECENT_ITEMS_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed.filter((item) => item && typeof item.path === "string" && typeof item.kind === "string").slice(0, 10);
  } catch {
    return [];
  }
}

function loadSidebarWidth() {
  try {
    const value = Number(window.localStorage.getItem(SIDEBAR_WIDTH_KEY));
    if (Number.isFinite(value)) {
      return Math.min(SIDEBAR_MAX_WIDTH, Math.max(SIDEBAR_MIN_WIDTH, value));
    }
  } catch {
    return 280;
  }

  return 280;
}

function loadLastWorkspacePath() {
  try {
    const value = window.localStorage.getItem(LAST_WORKSPACE_PATH_KEY);
    return typeof value === "string" ? value.trim() : "";
  } catch {
    return "";
  }
}

function loadLastActiveFilePath() {
  try {
    const value = window.localStorage.getItem(LAST_ACTIVE_FILE_PATH_KEY);
    return typeof value === "string" ? value.trim() : "";
  } catch {
    return "";
  }
}

function loadLastTabPaths() {
  try {
    const raw = window.localStorage.getItem(LAST_TAB_PATHS_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed
      .filter((item) => typeof item === "string" && item.trim())
      .map((item) => item.trim());
  } catch {
    return [];
  }
}

function persistRecentItems(items) {
  window.localStorage.setItem(RECENT_ITEMS_KEY, JSON.stringify(items.slice(0, 10)));
}

function persistSidebarWidth(width) {
  window.localStorage.setItem(SIDEBAR_WIDTH_KEY, String(width));
}

function persistLastWorkspacePath(workspacePath) {
  if (!workspacePath) {
    window.localStorage.removeItem(LAST_WORKSPACE_PATH_KEY);
    return;
  }

  window.localStorage.setItem(LAST_WORKSPACE_PATH_KEY, String(workspacePath));
}

function persistLastActiveFilePath(filePath) {
  if (!filePath) {
    window.localStorage.removeItem(LAST_ACTIVE_FILE_PATH_KEY);
    return;
  }

  window.localStorage.setItem(LAST_ACTIVE_FILE_PATH_KEY, String(filePath));
}

function persistLastTabPaths(tabPaths) {
  const normalized = Array.isArray(tabPaths)
    ? tabPaths.filter((item) => typeof item === "string" && item.trim())
    : [];

  if (normalized.length === 0) {
    window.localStorage.removeItem(LAST_TAB_PATHS_KEY);
    return;
  }

  window.localStorage.setItem(LAST_TAB_PATHS_KEY, JSON.stringify(normalized));
}

function loadSessionSnapshot() {
  try {
    const raw = window.localStorage.getItem(SESSION_SNAPSHOT_KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    if (!parsed || typeof parsed !== "object" || !Array.isArray(parsed.tabs)) {
      return null;
    }

    return {
      tabs: parsed.tabs.filter((tab) => tab && typeof tab.path === "string" && typeof tab.name === "string"),
      tabTextMap: parsed.tabTextMap && typeof parsed.tabTextMap === "object" ? parsed.tabTextMap : {},
      savedTextMap: parsed.savedTextMap && typeof parsed.savedTextMap === "object" ? parsed.savedTextMap : {},
      markdownDraftMap: parsed.markdownDraftMap && typeof parsed.markdownDraftMap === "object" ? parsed.markdownDraftMap : {},
      activeTabPath: typeof parsed.activeTabPath === "string" ? parsed.activeTabPath : null
    };
  } catch {
    return null;
  }
}

function persistSessionSnapshot(snapshot) {
  if (!snapshot || !Array.isArray(snapshot.tabs) || snapshot.tabs.length === 0) {
    window.localStorage.removeItem(SESSION_SNAPSHOT_KEY);
    return;
  }

  window.localStorage.setItem(SESSION_SNAPSHOT_KEY, JSON.stringify(snapshot));
}

function normalizeText(value) {
  return typeof value === "string" ? value : "";
}

function createTemporaryTab(index, options: { kind?: "markdown" | "text"; preferredDirectory?: string } = {}) {
  const kind = options.kind || "markdown";
  const extension = kind === "text" ? ".txt" : ".md";
  const untitledName = `Untitled-${index}${extension}`;
  const preferredDirectory = String(options.preferredDirectory || "").trim();
  const temporaryPath = preferredDirectory
    ? `untitled:${preferredDirectory}\\${untitledName}`
    : `untitled:${Date.now()}:${index}`;
  return {
    path: temporaryPath,
    name: untitledName,
    content: "",
    encoding: "utf-8",
    readonlyHint: false,
    kind,
    isTemporary: true,
    preferredDirectory
  };
}

function isPathInsideRoot(targetPath, rootPath) {
  if (!targetPath || !rootPath) {
    return false;
  }

  const normalizedTarget = targetPath.replace(/\\/g, "/").toLowerCase();
  const normalizedRoot = rootPath.replace(/\\/g, "/").toLowerCase();
  return normalizedTarget === normalizedRoot || normalizedTarget.startsWith(`${normalizedRoot}/`);
}

function flattenFiles(node) {
  if (!node) {
    return [];
  }

  if (node.type === "file") {
    return [node];
  }

  return (node.children || []).flatMap((child) => flattenFiles(child));
}

function mergeIndexedFiles(existingFiles, nextFiles) {
  const merged = new Map();
  for (const file of existingFiles || []) {
    if (file?.path) {
      merged.set(file.path, file);
    }
  }
  for (const file of nextFiles || []) {
    if (file?.path) {
      merged.set(file.path, file);
    }
  }
  return Array.from(merged.values());
}

function replaceIndexedFilesInDirectory(existingFiles, directoryPath, nextFiles) {
  const remaining = (existingFiles || []).filter((file) => !isPathInsideRoot(file.path, directoryPath));
  return mergeIndexedFiles(remaining, nextFiles);
}

function updateTreeNodeByPath(node, targetPath, updater) {
  if (!node) {
    return node;
  }

  if (node.path === targetPath) {
    return updater(node);
  }

  if (!node.children?.length) {
    return node;
  }

  let changed = false;
  const nextChildren = node.children.map((child) => {
    const nextChild = updateTreeNodeByPath(child, targetPath, updater);
    if (nextChild !== child) {
      changed = true;
    }
    return nextChild;
  });

  return changed ? { ...node, children: nextChildren } : node;
}

function findTreeNodeByPath(node, targetPath) {
  if (!node) {
    return null;
  }

  if (node.path === targetPath) {
    return node;
  }

  for (const child of node.children || []) {
    const result = findTreeNodeByPath(child, targetPath);
    if (result) {
      return result;
    }
  }

  return null;
}

function getAncestorDirectories(targetPath, rootPath) {
  if (!targetPath || !rootPath || !isPathInsideRoot(targetPath, rootPath)) {
    return [];
  }

  const normalizedTarget = normalizePathSeparators(targetPath).replace(/\/$/, "");
  const normalizedRoot = normalizePathSeparators(rootPath).replace(/\/$/, "");
  const relative = normalizedTarget.slice(normalizedRoot.length).replace(/^\/+/, "");
  if (!relative) {
    return [];
  }

  const segments = relative.split("/").filter(Boolean);
  const ancestors = [];
  let current = rootPath.replace(/[\\/]+$/, "");
  for (let index = 0; index < segments.length - 1; index += 1) {
    current = joinFilePath(current, segments[index]);
    ancestors.push(current);
  }
  return ancestors;
}

function getDirectoryChain(targetPath, rootPath) {
  if (!targetPath || !rootPath || !isPathInsideRoot(targetPath, rootPath)) {
    return [];
  }

  const normalizedTarget = normalizePathSeparators(targetPath).replace(/\/$/, "");
  const normalizedRoot = normalizePathSeparators(rootPath).replace(/\/$/, "");
  const relative = normalizedTarget.slice(normalizedRoot.length).replace(/^\/+/, "");
  if (!relative) {
    return [rootPath];
  }

  const segments = relative.split("/").filter(Boolean);
  const directories = [rootPath];
  let current = rootPath.replace(/[\\/]+$/, "");
  for (const segment of segments) {
    current = joinFilePath(current, segment);
    directories.push(current);
  }
  return directories;
}

function isSameOrDescendantPath(targetPath, parentPath) {
  if (!targetPath || !parentPath) {
    return false;
  }

  const normalizedTarget = normalizePathSeparators(targetPath).toLowerCase();
  const normalizedParent = normalizePathSeparators(parentPath).toLowerCase();
  return normalizedTarget === normalizedParent || normalizedTarget.startsWith(`${normalizedParent}/`);
}

function replacePathPrefix(targetPath, sourcePrefix, destinationPrefix) {
  if (!targetPath || !sourcePrefix || !destinationPrefix) {
    return targetPath;
  }

  const normalizedTarget = normalizePathSeparators(targetPath);
  const normalizedSource = normalizePathSeparators(sourcePrefix).replace(/\/$/, "");
  const normalizedDestination = normalizePathSeparators(destinationPrefix).replace(/\/$/, "");

  if (normalizedTarget === normalizedSource) {
    return destinationPrefix;
  }

  if (!normalizedTarget.startsWith(`${normalizedSource}/`)) {
    return targetPath;
  }

  const suffix = normalizedTarget.slice(normalizedSource.length).replace(/^\/+/, "");
  return joinFilePath(destinationPrefix, suffix.replace(/\//g, "\\"));
}

function getTemporaryTabDisplayPath(tab) {
  if (!tab?.isTemporary) {
    return tab?.path || "";
  }

  const preferredDirectory = String(tab.preferredDirectory || "").trim();
  if (!preferredDirectory) {
    return "";
  }

  return joinFilePath(preferredDirectory, tab.name || "");
}

function formatPreviewDuration(totalSeconds) {
  const safeSeconds = Math.max(0, Math.floor(Number(totalSeconds) || 0));
  const hours = Math.floor(safeSeconds / 3600);
  const minutes = Math.floor((safeSeconds % 3600) / 60);
  const seconds = safeSeconds % 60;

  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  }

  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

function formatFileSize(bytes) {
  const size = Math.max(0, Number(bytes) || 0);
  if (size >= 1024 * 1024 * 1024) {
    return `${(size / (1024 * 1024 * 1024)).toFixed(2)} GB`;
  }
  if (size >= 1024 * 1024) {
    return `${(size / (1024 * 1024)).toFixed(2)} MB`;
  }
  if (size >= 1024) {
    return `${(size / 1024).toFixed(1)} KB`;
  }
  return `${size} B`;
}

function App() {
  const [rootPath, setRootPath] = React.useState("");
  const [tree, setTree] = React.useState(null);
  const [expandedPaths, setExpandedPaths] = React.useState<Set<string>>(() => new Set<string>());
  const [loadingTreePaths, setLoadingTreePaths] = React.useState<Set<string>>(() => new Set<string>());
  const [tabs, setTabs] = React.useState([]);
  const [tabTextMap, setTabTextMap] = React.useState({});
  const [savedTextMap, setSavedTextMap] = React.useState({});
  const [markdownDraftMap, setMarkdownDraftMap] = React.useState({});
  const [activeTabPath, setActiveTabPath] = React.useState(null);
  const [isMaximized, setIsMaximized] = React.useState(false);
  const [isAlwaysOnTop, setIsAlwaysOnTop] = React.useState(false);
  const [searchOpen, setSearchOpen] = React.useState(false);
  const [searchQuery, setSearchQuery] = React.useState("");
  const [activeView, setActiveView] = React.useState("explorer");
  const [sidebarVisible, setSidebarVisible] = React.useState(true);
  const [tabContextMenu, setTabContextMenu] = React.useState(null);
  const [treeContextMenu, setTreeContextMenu] = React.useState(null);
  const [selectedTreePath, setSelectedTreePath] = React.useState<string | null>(null);
  const [treeRenamingPath, setTreeRenamingPath] = React.useState<string | null>(null);
  const [treeRenamingValue, setTreeRenamingValue] = React.useState("");
  const [draggingTabPath, setDraggingTabPath] = React.useState(null);
  const [dragOverTab, setDragOverTab] = React.useState(null);
  const [recentItems, setRecentItems] = React.useState(() => loadRecentItems());
  const [sidebarWidth, setSidebarWidth] = React.useState(() => loadSidebarWidth());
  const [indexedFiles, setIndexedFiles] = React.useState<any[]>([]);
  const [outlineOpen, setOutlineOpen] = React.useState(false);
  const [outlineMap, setOutlineMap] = React.useState<Record<string, TiptapOutlineItem[]>>({});
  const [previewStatusMap, setPreviewStatusMap] = React.useState<Record<string, any>>({});
  const [markdownSourceModeMap, setMarkdownSourceModeMap] = React.useState<Record<string, boolean>>({});
  const [detachedDocumentPaths, setDetachedDocumentPaths] = React.useState<Set<string>>(() => new Set<string>());
  const [isRestoringWorkspace, setIsRestoringWorkspace] = React.useState(true);
  const searchInputRef = React.useRef(null);
  const searchBoxRef = React.useRef(null);
  const treeRef = React.useRef(tree);
  const treeLoadTasksRef = React.useRef(new Map());
  const didRestoreWorkspaceRef = React.useRef(false);
  const didInitWorkspacePersistenceRef = React.useRef(false);
  const didHydrateSessionRef = React.useRef(false);
  const pendingRestoreFilePathRef = React.useRef("");
  const pendingRestoreTabPathsRef = React.useRef([]);
  const pendingSessionSnapshotRef = React.useRef(null);
  const tabsRef = React.useRef(tabs);
  const activeTabPathRef = React.useRef(activeTabPath);
  const tabTextMapRef = React.useRef(tabTextMap);
  const savedTextMapRef = React.useRef(savedTextMap);
  const markdownDraftMapRef = React.useRef(markdownDraftMap);
  const detachedDocumentPathsRef = React.useRef(detachedDocumentPaths);
  const outlineApiMapRef = React.useRef(new Map<string, TiptapOutlineApi>());
  const commandApiMapRef = React.useRef(new Map<string, TiptapCommandApi>());
  // Keep workspace indexing on-demand only; eager reindexing previously caused major memory growth.
  const indexedFilesRootPathRef = React.useRef("");
  const searchIndexTaskRef = React.useRef<Promise<void> | null>(null);
  const { toast, showSuccess, showError } = useToast();

  const refreshSearchIndex = React.useCallback(async (workspaceRootPath) => {
    const nextRootPath = String(workspaceRootPath || "").trim();
    if (!nextRootPath) {
      indexedFilesRootPathRef.current = "";
      setIndexedFiles([]);
      return;
    }

    if (!searchOpen) {
      return;
    }

    if (indexedFilesRootPathRef.current === nextRootPath && indexedFiles.length > 0) {
      return;
    }

    if (searchIndexTaskRef.current) {
      return searchIndexTaskRef.current;
    }

    const task = (async () => {
      try {
        const files = await window.desktopApi.indexWorkspaceFiles(nextRootPath);
        indexedFilesRootPathRef.current = nextRootPath;
        setIndexedFiles(Array.isArray(files) ? files : []);
      } catch {
        indexedFilesRootPathRef.current = "";
        setIndexedFiles([]);
      } finally {
        searchIndexTaskRef.current = null;
      }
    })();

    searchIndexTaskRef.current = task;
    return task;
  }, [indexedFiles.length, searchOpen]);

  React.useEffect(() => {
    treeRef.current = tree;
  }, [tree]);

  React.useEffect(() => {
    tabsRef.current = tabs;
  }, [tabs]);

  React.useEffect(() => {
    activeTabPathRef.current = activeTabPath;
  }, [activeTabPath]);

  React.useEffect(() => {
    tabTextMapRef.current = tabTextMap;
  }, [tabTextMap]);

  React.useEffect(() => {
    savedTextMapRef.current = savedTextMap;
  }, [savedTextMap]);

  React.useEffect(() => {
    markdownDraftMapRef.current = markdownDraftMap;
  }, [markdownDraftMap]);

  React.useEffect(() => {
    detachedDocumentPathsRef.current = detachedDocumentPaths;
  }, [detachedDocumentPaths]);

  React.useEffect(() => {
    const availablePaths = new Set(tabs.map((tab) => tab.path));
    setOutlineMap((previous) => {
      const nextEntries = Object.entries(previous).filter(([tabPath]) => availablePaths.has(tabPath));
      return nextEntries.length === Object.keys(previous).length ? previous : Object.fromEntries(nextEntries);
    });
    setPreviewStatusMap((previous) => {
      const nextEntries = Object.entries(previous).filter(([tabPath]) => availablePaths.has(tabPath));
      return nextEntries.length === Object.keys(previous).length ? previous : Object.fromEntries(nextEntries);
    });
    setMarkdownSourceModeMap((previous) => {
      const nextEntries = Object.entries(previous).filter(([tabPath]) => availablePaths.has(tabPath));
      return nextEntries.length === Object.keys(previous).length ? previous : Object.fromEntries(nextEntries);
    });

    for (const tabPath of outlineApiMapRef.current.keys()) {
      if (!availablePaths.has(tabPath)) {
        outlineApiMapRef.current.delete(tabPath);
      }
    }

    for (const tabPath of commandApiMapRef.current.keys()) {
      if (!availablePaths.has(tabPath)) {
        commandApiMapRef.current.delete(tabPath);
      }
    }
  }, [tabs]);

  React.useEffect(() => {
    window.desktopApi.isWindowMaximized().then(setIsMaximized);
    window.desktopApi.isWindowAlwaysOnTop().then(setIsAlwaysOnTop).catch(() => {});
  }, []);

  React.useEffect(() => {
    persistRecentItems(recentItems);
  }, [recentItems]);

  React.useEffect(() => {
    persistSidebarWidth(sidebarWidth);
  }, [sidebarWidth]);

  React.useEffect(() => {
    if (!didInitWorkspacePersistenceRef.current) {
      return;
    }
    persistLastWorkspacePath(rootPath);
  }, [rootPath]);

  React.useEffect(() => {
    if (!didInitWorkspacePersistenceRef.current || !didHydrateSessionRef.current) {
      return;
    }

    const activeFilePath = activeTabPath && !String(activeTabPath).startsWith("untitled:")
      ? activeTabPath
      : "";
    persistLastActiveFilePath(activeFilePath);
  }, [activeTabPath]);

  React.useEffect(() => {
    if (!didInitWorkspacePersistenceRef.current || !didHydrateSessionRef.current) {
      return;
    }

    persistLastTabPaths(
      tabs
        .map((tab) => tab.path)
        .filter((tabPath) => tabPath && !String(tabPath).startsWith("untitled:"))
    );
  }, [tabs]);

  React.useEffect(() => {
    if (!didInitWorkspacePersistenceRef.current || !didHydrateSessionRef.current) {
      return;
    }

    persistSessionSnapshot({
      tabs,
      tabTextMap,
      savedTextMap,
      markdownDraftMap,
      activeTabPath
    });
  }, [activeTabPath, markdownDraftMap, savedTextMap, tabTextMap, tabs]);

  React.useEffect(() => {
    if (searchOpen) {
      searchInputRef.current?.focus();
      void refreshSearchIndex(rootPath);
      return;
    }

    // Release the cached file list as soon as search closes.
    indexedFilesRootPathRef.current = "";
    searchIndexTaskRef.current = null;
    setIndexedFiles([]);
  }, [refreshSearchIndex, rootPath, searchOpen]);

  const getPersistedContentForTab = React.useCallback(async (tab) => {
    if (!tab || tab.kind === "binary" || tab.kind === "image" || tab.kind === "audio" || tab.kind === "video" || tab.kind === "pdf" || tab.kind === "webpage" || tab.kind === "notebook") {
      return "";
    }

    if (tab.kind === "markdown") {
      return serializeMarkdownDraftAsync(markdownDraftMapRef.current[tab.path], tab.content);
    }

    return normalizeText(tabTextMapRef.current[tab.path] ?? tab.content);
  }, []);

  const isMarkdownTabDirty = React.useCallback((tab) => {
    return computeMarkdownTabDirty(
      tab,
      savedTextMapRef.current,
      markdownDraftMapRef.current,
      null,
      normalizeText
    );
  }, []);

  React.useEffect(() => {
    function handlePointerDown(event) {
      if (searchBoxRef.current && !searchBoxRef.current.contains(event.target)) {
        setSearchOpen(false);
      }

      if (tabContextMenu && !event.target.closest?.(".tab-context-menu")) {
        setTabContextMenu(null);
      }

      if (treeContextMenu && !event.target.closest?.(".tree-context-menu")) {
        setTreeContextMenu(null);
      }
    }

    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, [tabContextMenu, treeContextMenu]);

  React.useEffect(() => {
    if (!tabContextMenu && !treeContextMenu) {
      return;
    }

    function handleEscape(event) {
      if (event.key === "Escape") {
        setTabContextMenu(null);
        setTreeContextMenu(null);
      }
    }

    function handleWindowBlur() {
      setTabContextMenu(null);
      setTreeContextMenu(null);
    }

    window.addEventListener("keydown", handleEscape);
    window.addEventListener("blur", handleWindowBlur);
    return () => {
      window.removeEventListener("keydown", handleEscape);
      window.removeEventListener("blur", handleWindowBlur);
    };
  }, [tabContextMenu, treeContextMenu]);

  const activeTab = tabs.find((tab) => tab.path === activeTabPath) || null;
  const deferredSearchQuery = React.useDeferredValue(searchQuery);
  const contextMenuTab = tabContextMenu ? tabs.find((tab) => tab.path === tabContextMenu.path) || null : null;
  const contextMenuTabIndex = contextMenuTab ? tabs.findIndex((tab) => tab.path === contextMenuTab.path) : -1;
  const activeMarkdownDraft = activeTab ? markdownDraftMap[activeTab.path] : null;
  const activeMarkdownSourceMode = Boolean(activeTab?.kind === "markdown" && markdownSourceModeMap[activeTab.path]);
  const activeTabText = activeTab
      ? activeTab.kind === "markdown"
      ? normalizeText(activeMarkdownDraft?.text ?? savedTextMap[activeTab.path] ?? activeTab.content)
      : activeTab.kind === "image" || activeTab.kind === "audio" || activeTab.kind === "video" || activeTab.kind === "pdf" || activeTab.kind === "webpage" || activeTab.kind === "notebook"
        ? ""
        : normalizeText(tabTextMap[activeTab.path] ?? activeTab.content)
    : "";
  const activeSavedText = activeTab ? normalizeText(savedTextMap[activeTab.path] ?? activeTab.content) : "";
  const activePreviewStatus = activeTab ? previewStatusMap[activeTab.path] || null : null;
  const activeIsDirty = Boolean(activeTab) && (
    activeTab.kind === "markdown"
      ? isMarkdownTabDirty(activeTab)
      : activeTab.kind === "image" || activeTab.kind === "audio" || activeTab.kind === "video" || activeTab.kind === "pdf" || activeTab.kind === "webpage" || activeTab.kind === "notebook"
        ? false
      : activeTabText !== activeSavedText
  );
  const activeTabKindLabel = activeTab?.kind === "markdown"
    ? "Markdown"
    : activeTab?.kind === "image"
      ? "Image"
      : activeTab?.kind === "audio"
        ? "Audio"
        : activeTab?.kind === "video"
          ? "Video"
        : activeTab?.kind === "pdf"
          ? "PDF"
          : activeTab?.kind === "webpage"
            ? "Web"
            : activeTab?.kind === "notebook"
              ? "Notebook"
              : activeTab
                ? "Text"
                : "Ready";
  const isPreviewTab = Boolean(
    activeTab && (activeTab.kind === "image" || activeTab.kind === "audio" || activeTab.kind === "video" || activeTab.kind === "pdf" || activeTab.kind === "webpage" || activeTab.kind === "notebook")
  );
  const isEditableTab = Boolean(activeTab && !isPreviewTab && activeTab.kind !== "binary");
  const activeCharCount = activeTabText.length;
  const indexedSearchFiles = React.useMemo(() => (
    indexedFiles.map((file) => ({
      ...file,
      searchName: String(file.name || "").toLowerCase(),
      searchPath: String(file.path || "").toLowerCase()
    }))
  ), [indexedFiles]);
  const indexedSearchTabs = React.useMemo(() => (
    tabs.map((tab) => ({
      ...tab,
      searchName: String(tab.name || "").toLowerCase(),
      searchPath: String(tab.path || "").toLowerCase()
    }))
  ), [tabs]);
  const activeLineCount = React.useMemo(() => {
    if (!activeTabText) {
      return 0;
    }
    return activeTabText.replace(/\r\n/g, "\n").split("\n").length;
  }, [activeTabText]);
  const activeStatusPath = React.useMemo(() => {
    if (!activeTab) {
      return {
        title: "",
        label: UI_TEXT.statusbar.unopenedFile
      };
    }

    if (activeTab.isTemporary) {
      const preferredDirectory = String(activeTab.preferredDirectory || "").trim();
      if (preferredDirectory) {
        const nextPath = joinFilePath(preferredDirectory, activeTab.name || "");
        return {
          title: nextPath,
          label: nextPath
        };
      }

      return {
        title: "",
        label: UI_TEXT.statusbar.unsavedFile
      };
    }

    return {
      title: activeTab.path || "",
      label: activeTab.path || UI_TEXT.statusbar.unopenedFile
    };
  }, [activeTab]);
  const activePreviewDetailItems = React.useMemo(() => {
    if (!activeTab || !activePreviewStatus) {
      return [];
    }

    if (activeTab.kind === "image") {
      const items = [];
      if (activePreviewStatus.width && activePreviewStatus.height) {
        items.push(`${activePreviewStatus.width} × ${activePreviewStatus.height}`);
      }
      if (activePreviewStatus.zoomPercent) {
        items.push(`缩放 ${activePreviewStatus.zoomPercent}%`);
      }
      if (activePreviewStatus.fileSizeBytes > 0) {
        items.push(formatFileSize(activePreviewStatus.fileSizeBytes));
      }
      return items;
    }

    if (activeTab.kind === "audio" || activeTab.kind === "video") {
      const items = [activePreviewStatus.playing ? "播放中" : "已暂停"];
      const current = formatPreviewDuration(activePreviewStatus.currentTime);
      const total = formatPreviewDuration(activePreviewStatus.duration);

      if (activePreviewStatus.duration > 0) {
        items.push(`${current} / ${total}`);
      } else if (activePreviewStatus.currentTime > 0) {
        items.push(current);
      }
      if (activePreviewStatus.fileSizeBytes > 0) {
        items.push(formatFileSize(activePreviewStatus.fileSizeBytes));
      }

      return items;
    }

    return [];
  }, [activePreviewStatus, activeTab]);
  const activeOutlineItems = activeTab ? outlineMap[activeTab.path] || [] : [];
  const canToggleOutline = activeTab?.kind === "markdown" || activeTab?.kind === "notebook";
  const showOutlinePane = Boolean(outlineOpen && canToggleOutline);
  // Read markdown commands at click time instead of render time. The command
  // map lives in a ref, so caching a snapshot here can leave menus bound to a
  // stale or missing editor API after tab/editor lifecycle changes.
  const runActiveMarkdownCommand = React.useCallback((runner: (api: TiptapCommandApi) => void | Promise<void>) => {
    const currentPath = activeTabPathRef.current;
    if (!currentPath) {
      return;
    }

    const api = commandApiMapRef.current.get(currentPath);
    if (!api) {
      return;
    }

    return runner(api);
  }, []);
  const updateRecentItems = React.useCallback((entry) => {
    setRecentItems((previous) => {
      const next = [entry, ...previous.filter((item) => !(item.kind === entry.kind && item.path === entry.path))];
      return next.slice(0, 10);
    });
  }, []);

  const toggleActiveMarkdownSourceMode = React.useCallback(() => {
    const currentPath = activeTabPathRef.current;
    const currentTab = tabsRef.current.find((tab) => tab.path === currentPath);
    if (!currentTab || currentTab.kind !== "markdown") {
      return;
    }

    setMarkdownSourceModeMap((previous) => {
      const nextActive = !previous[currentTab.path];

      setMarkdownDraftMap((draftPrevious) => {
        const currentDraft = draftPrevious[currentTab.path];
        const sourceText = normalizeText(currentDraft?.text ?? savedTextMapRef.current[currentTab.path] ?? currentTab.content);

        if (!nextActive) {
          if (!currentDraft?.isDirty) {
            if (!(currentTab.path in draftPrevious)) {
              return draftPrevious;
            }

            const next = { ...draftPrevious };
            delete next[currentTab.path];
            markdownDraftMapRef.current = next;
            return next;
          }

          const next = {
            ...draftPrevious,
            [currentTab.path]: {
              ...currentDraft,
              text: sourceText,
              html: null,
              sourceMode: false
            }
          };
          markdownDraftMapRef.current = next;
          return next;
        }

        const next = {
          ...draftPrevious,
          [currentTab.path]: {
            html: null,
            text: sourceText,
            isDirty: Boolean(currentDraft?.isDirty),
            sourceMode: true
          }
        };
        markdownDraftMapRef.current = next;
        return next;
      });

      if (nextActive) {
        return { ...previous, [currentTab.path]: true };
      }

      if (!(currentTab.path in previous)) {
        return previous;
      }

      const next = { ...previous };
      delete next[currentTab.path];
      return next;
    });
  }, []);

  const isTabDirty = React.useCallback((tab) => {
    return computeTabDirty(
      tab,
      savedTextMapRef.current,
      tabTextMapRef.current,
      markdownDraftMapRef.current,
      null,
      normalizeText
    );
  }, []);

  const savedTabCount = React.useMemo(
    () => tabs.filter((tab) => !isTabDirty(tab)).length,
    [isTabDirty, tabs]
  );

  const expandToPath = React.useCallback((targetPath) => {
    setExpandedPaths((previous) => {
      const next = new Set(previous);
      if (rootPath) {
        let currentPath = targetPath;
        while (currentPath && isPathInsideRoot(currentPath, rootPath)) {
          next.add(currentPath);
          const parentPath = getDirName(currentPath);
          if (parentPath === currentPath) {
            break;
          }
          currentPath = parentPath;
        }
        next.add(rootPath);
      } else if (targetPath) {
        next.add(targetPath);
      }
      return next;
    });
  }, [rootPath]);

  const loadDirectoryChildren = React.useCallback(async (directoryPath) => {
    if (!directoryPath) {
      return [];
    }

    const existingNode = findTreeNodeByPath(treeRef.current, directoryPath);
    if (existingNode?.type === "directory" && existingNode.childrenLoaded) {
      return existingNode.children || [];
    }

    const existingTask = treeLoadTasksRef.current.get(directoryPath);
    if (existingTask) {
      return existingTask;
    }

    setLoadingTreePaths((previous) => {
      if (previous.has(directoryPath)) {
        return previous;
      }
      const next = new Set(previous);
      next.add(directoryPath);
      return next;
    });

    const loadTask = window.desktopApi.readDirectory(directoryPath)
      .then((children) => {
        setTree((previous) => {
          const nextTree = updateTreeNodeByPath(previous, directoryPath, (node) => ({
            ...node,
            children,
            childrenLoaded: true,
            hasChildren: children.length > 0
          }));
          treeRef.current = nextTree;
          return nextTree;
        });
        return children;
      })
      .finally(() => {
        treeLoadTasksRef.current.delete(directoryPath);
        setLoadingTreePaths((previous) => {
          if (!previous.has(directoryPath)) {
            return previous;
          }
          const next = new Set(previous);
          next.delete(directoryPath);
          return next;
        });
      });

    treeLoadTasksRef.current.set(directoryPath, loadTask);
    return loadTask;
  }, [rootPath]);

  const ensureDirectoryVisible = React.useCallback(async (directoryPath) => {
    if (!directoryPath || !rootPath || !isPathInsideRoot(directoryPath, rootPath)) {
      return;
    }

    expandToPath(directoryPath);
    const directories = getDirectoryChain(directoryPath, rootPath);
    for (const currentPath of directories) {
      if (currentPath !== rootPath) {
        await loadDirectoryChildren(currentPath);
      }
    }
  }, [expandToPath, loadDirectoryChildren, rootPath]);

  const revealPathInTree = React.useCallback(async (targetPath) => {
    if (!targetPath || !rootPath || !isPathInsideRoot(targetPath, rootPath)) {
      return;
    }

    expandToPath(getDirName(targetPath));
    for (const directoryPath of getAncestorDirectories(targetPath, rootPath)) {
      await loadDirectoryChildren(directoryPath);
    }
  }, [expandToPath, loadDirectoryChildren, rootPath]);

  React.useEffect(() => {
    if (!activeTabPath) {
      return;
    }

    void revealPathInTree(activeTabPath);
  }, [activeTabPath, revealPathInTree]);

  const openFilePayload = React.useCallback((file) => {
    if (!file?.path) {
      return;
    }

    if (detachedDocumentPathsRef.current.has(file.path)) {
      void window.desktopApi.openDocumentWindow(file.path);
      setSelectedTreePath(file.path);
      return;
    }

    const content = normalizeText(file.content);

    setTabs((previous) => {
      const existingIndex = previous.findIndex((tab) => tab.path === file.path);
      if (existingIndex >= 0) {
        const next = previous.slice();
        next[existingIndex] = {
          ...next[existingIndex],
          ...file,
          content
        };
        return next;
      }

      return [...previous, { ...file, content }];
    });

    setTabTextMap((previous) => ({
      ...previous,
      [file.path]: content
    }));
    setSavedTextMap((previous) => ({
      ...previous,
      [file.path]: content
    }));
    setMarkdownDraftMap((previous) => {
      if (!(file.path in previous)) {
        return previous;
      }

      const next = { ...previous };
      delete next[file.path];
      return next;
    });
    setActiveTabPath(file.path);
    setSelectedTreePath(null);
  }, []);

  const markDocumentPathDetached = React.useCallback((filePath) => {
    if (!filePath) {
      return;
    }

    setDetachedDocumentPaths((previous) => {
      if (previous.has(filePath)) {
        detachedDocumentPathsRef.current = previous;
        return previous;
      }
      const next = new Set(previous);
      next.add(filePath);
      detachedDocumentPathsRef.current = next;
      return next;
    });
  }, []);

  const clearDetachedDocumentPath = React.useCallback((filePath) => {
    if (!filePath) {
      return;
    }

    setDetachedDocumentPaths((previous) => {
      if (!previous.has(filePath)) {
        detachedDocumentPathsRef.current = previous;
        return previous;
      }
      const next = new Set(previous);
      next.delete(filePath);
      detachedDocumentPathsRef.current = next;
      return next;
    });
  }, []);

  const restoreSessionTabs = React.useCallback((files, activePath) => {
    const normalizedFiles = Array.isArray(files) ? files.filter(Boolean) : [];
    if (normalizedFiles.length === 0) {
      return;
    }

    const nextTabTextMap = {};
    const nextSavedTextMap = {};
    for (const file of normalizedFiles) {
      const content = normalizeText(file.content);
      nextTabTextMap[file.path] = content;
      nextSavedTextMap[file.path] = content;
    }

    setTabs(normalizedFiles.map((file) => ({
      ...file,
      content: normalizeText(file.content)
    })));
    setTabTextMap((previous) => ({ ...previous, ...nextTabTextMap }));
    setSavedTextMap((previous) => ({ ...previous, ...nextSavedTextMap }));
    setMarkdownDraftMap({});

    const nextActivePath = activePath && normalizedFiles.some((file) => file.path === activePath)
      ? activePath
      : normalizedFiles[0]?.path || null;
    setActiveTabPath(nextActivePath);
  }, []);

  const restoreSessionSnapshot = React.useCallback((snapshot) => {
    if (!snapshot?.tabs?.length) {
      return;
    }

    const normalizedTabs = snapshot.tabs.map((tab) => ({
      ...tab,
      content: normalizeText(tab.content)
    }));
    const nextTabTextMap = { ...snapshot.tabTextMap };
    const nextSavedTextMap = { ...snapshot.savedTextMap };
    const nextMarkdownDraftMap = { ...snapshot.markdownDraftMap };

    setTabs(normalizedTabs);
    setTabTextMap(nextTabTextMap);
    setSavedTextMap(nextSavedTextMap);
    setMarkdownDraftMap(nextMarkdownDraftMap);

    const nextActivePath = snapshot.activeTabPath && normalizedTabs.some((tab) => tab.path === snapshot.activeTabPath)
      ? snapshot.activeTabPath
      : normalizedTabs[0]?.path || null;
    setActiveTabPath(nextActivePath);
  }, []);

  const applyWorkspaceResult = React.useCallback((result) => {
    if (!result) {
      return;
    }

    if (result.rootPath) {
      setRootPath(result.rootPath);
      setSelectedTreePath(null);
      setExpandedPaths(new Set([result.rootPath]));
      setLoadingTreePaths(new Set());
      treeLoadTasksRef.current.clear();
      setActiveView("explorer");
    }

    if (result.tree) {
      setTree(result.tree);
    }

    if (result.file) {
      openFilePayload(result.file);
    }
  }, [openFilePayload]);

  const openExternalWorkspacePath = React.useCallback(async (targetPath) => {
    if (!targetPath) {
      return;
    }

    const result = await window.desktopApi.openWorkspacePath(targetPath);
    applyWorkspaceResult(result);
  }, [applyWorkspaceResult]);

  React.useEffect(() => {
    if (didRestoreWorkspaceRef.current) {
      return;
    }

    didRestoreWorkspaceRef.current = true;
    const lastWorkspacePath = loadLastWorkspacePath();
    pendingRestoreFilePathRef.current = loadLastActiveFilePath();
    pendingRestoreTabPathsRef.current = loadLastTabPaths();
    pendingSessionSnapshotRef.current = loadSessionSnapshot();
    didInitWorkspacePersistenceRef.current = true;
    if (!pendingSessionSnapshotRef.current?.tabs?.length) {
      didHydrateSessionRef.current = true;
    }
    void window.desktopApi.getLaunchWorkspacePath()
      .then(async (launchWorkspacePath) => {
        const initialWorkspacePath = launchWorkspacePath || lastWorkspacePath;
        if (!initialWorkspacePath) {
          setIsRestoringWorkspace(false);
          return;
        }

        await openExternalWorkspacePath(initialWorkspacePath);
        setIsRestoringWorkspace(false);
      })
      .catch(() => {
        persistLastWorkspacePath("");
        setIsRestoringWorkspace(false);
      });
  }, [openExternalWorkspacePath]);

  React.useEffect(() => {
    return window.desktopApi.onOpenWorkspacePath((targetPath) => {
      if (!targetPath) {
        return;
      }

      void openExternalWorkspacePath(targetPath).catch(() => {
      });
    });
  }, [openExternalWorkspacePath]);

  React.useEffect(() => {
    const snapshot = pendingSessionSnapshotRef.current;
    if (!snapshot?.tabs?.length || tabs.length > 0) {
      return;
    }

    const hasWorkspaceTabs = snapshot.tabs.some((tab) => !tab.isTemporary && !String(tab.path).startsWith("untitled:"));
    if (hasWorkspaceTabs && !rootPath) {
      return;
    }

    pendingSessionSnapshotRef.current = null;
    pendingRestoreTabPathsRef.current = [];
    pendingRestoreFilePathRef.current = "";
    didHydrateSessionRef.current = true;
    restoreSessionSnapshot(snapshot);
    setIsRestoringWorkspace(false);
  }, [restoreSessionSnapshot, rootPath, tabs.length]);

  const openFile = React.useCallback(async (filePath) => {
    if (detachedDocumentPathsRef.current.has(filePath)) {
      await window.desktopApi.openDocumentWindow(filePath);
      setSelectedTreePath(filePath);
      return;
    }

    const existing = tabsRef.current.find((tab) => tab.path === filePath);
    if (existing) {
      setActiveTabPath(filePath);
      return;
    }

    const file = await window.desktopApi.readFile(filePath);
    openFilePayload(file);
  }, [openFilePayload]);

  React.useEffect(() => {
    return window.desktopApi.onRestoreDocumentTab((targetPath) => {
      if (!targetPath) {
        return;
      }

      clearDetachedDocumentPath(targetPath);
      void window.desktopApi.readFile(targetPath).then((file) => {
        openFilePayload(file);
      }).catch(() => {
        showError("无法恢复独立窗口中的文档标签");
      });
    });
  }, [clearDetachedDocumentPath, openFilePayload, showError]);

  React.useEffect(() => {
    const pendingTabPaths = pendingRestoreTabPathsRef.current;
    if (!pendingTabPaths.length || !rootPath) {
      return;
    }

    const candidatePaths = pendingTabPaths.filter((filePath) => isPathInsideRoot(filePath, rootPath));
    if (candidatePaths.length === 0) {
      pendingRestoreTabPathsRef.current = [];
      setIsRestoringWorkspace(false);
      return;
    }

    pendingRestoreTabPathsRef.current = [];
    const desiredActivePath = pendingRestoreFilePathRef.current;
    void Promise.all(candidatePaths.map(async (filePath) => {
      try {
        return await window.desktopApi.readFile(filePath);
      } catch {
        return null;
      }
    })).then((files) => {
      const resolvedFiles = files.filter((file) => file && file.kind !== "binary");
      if (resolvedFiles.length === 0) {
        persistLastTabPaths([]);
        persistLastActiveFilePath("");
        setIsRestoringWorkspace(false);
        return;
      }

      restoreSessionTabs(resolvedFiles, desiredActivePath);
      setIsRestoringWorkspace(false);
    });
  }, [restoreSessionTabs, rootPath]);

  React.useEffect(() => {
    const pendingFilePath = pendingRestoreFilePathRef.current;
    if (
      !pendingFilePath ||
      !rootPath ||
      !isPathInsideRoot(pendingFilePath, rootPath) ||
      tabs.length > 0
    ) {
      return;
    }

    pendingRestoreFilePathRef.current = "";
    void openFile(pendingFilePath).catch(() => {
      persistLastActiveFilePath("");
    }).finally(() => {
      setIsRestoringWorkspace(false);
    });
  }, [openFile, rootPath]);

  const pickDirectory = React.useCallback(async () => {
    const result = await window.desktopApi.pickDirectory();
    if (!result) {
      return;
    }

    applyWorkspaceResult(result);
    updateRecentItems({
      path: result.rootPath,
      kind: "directory",
      label: getBaseName(result.rootPath) || result.rootPath,
      timestamp: Date.now()
    });
  }, [applyWorkspaceResult, updateRecentItems]);

  const openFileDialog = React.useCallback(async () => {
    const result = await window.desktopApi.openFileDialog();
    if (!result) {
      return;
    }

    if (rootPath) {
      if (result.file) {
        openFilePayload(result.file);
      }
    } else {
      applyWorkspaceResult(result);
    }

    if (result.file?.path) {
      updateRecentItems({
        path: result.file.path,
        kind: "file",
        label: result.file.name,
        timestamp: Date.now()
      });
    }
  }, [applyWorkspaceResult, openFilePayload, rootPath, updateRecentItems]);

  const openRecentItem = React.useCallback(async (item) => {
    const result = await window.desktopApi.openWorkspacePath(item.path);
    applyWorkspaceResult(result);
    updateRecentItems({
      ...item,
      timestamp: Date.now()
    });
  }, [applyWorkspaceResult, updateRecentItems]);

  const toggleDirectory = React.useCallback((targetPath) => {
    const resolvedNode = findTreeNodeByPath(tree, targetPath);

    setExpandedPaths((previous) => {
      const next = new Set(previous);
      if (next.has(targetPath)) {
        next.delete(targetPath);
      } else {
        next.add(targetPath);
      }
      return next;
    });

    if (!resolvedNode || resolvedNode.type !== "directory" || !resolvedNode.hasChildren || resolvedNode.childrenLoaded) {
      return;
    }

    void loadDirectoryChildren(targetPath);
  }, [loadDirectoryChildren, tree]);

  const handleTreeSelect = React.useCallback((targetPath) => {
    setSelectedTreePath(targetPath);
  }, []);

  const createTemporaryTabAction = React.useCallback(async () => {
    const untitledCount = tabsRef.current.filter((tab) => tab.isTemporary).length + 1;
    const tempTab = createTemporaryTab(untitledCount);
    openFilePayload(tempTab);
  }, [openFilePayload]);

  const createTemporaryTabAtDirectory = React.useCallback((kind: "markdown" | "text", preferredDirectory?: string) => {
    const untitledCount = tabsRef.current.filter((tab) => tab.isTemporary).length + 1;
    const tempTab = createTemporaryTab(untitledCount, {
      kind,
      preferredDirectory
    });
    openFilePayload(tempTab);
  }, [openFilePayload]);

  const removeTabByPath = React.useCallback((filePath) => {
    setTabs((previous) => {
      const index = previous.findIndex((tab) => tab.path === filePath);
      if (index === -1) {
        return previous;
      }

      const next = previous.filter((tab) => tab.path !== filePath);

      setTabTextMap((current) => {
        const nextMap = { ...current };
        delete nextMap[filePath];
        tabTextMapRef.current = nextMap;
        return nextMap;
      });

      setSavedTextMap((current) => {
        const nextMap = { ...current };
        delete nextMap[filePath];
        savedTextMapRef.current = nextMap;
        return nextMap;
      });

      setMarkdownDraftMap((current) => {
        const nextMap = { ...current };
        delete nextMap[filePath];
        markdownDraftMapRef.current = nextMap;
        return nextMap;
      });

      if (activeTabPathRef.current === filePath) {
        const nextActive = next[index]?.path || next[index - 1]?.path || null;
        setActiveTabPath(nextActive);
      }

      return next;
    });
  }, []);

  const handleTabTextChange = React.useCallback((filePath, nextText) => {
    const tab = tabsRef.current.find((item) => item.path === filePath);
    if (!tab || tab.kind === "binary") {
      return;
    }

    if (tab.kind === "markdown") {
      if (typeof nextText === "string" || markdownSourceModeMap[filePath]) {
        const content = normalizeText(nextText);
        const savedContent = normalizeText(savedTextMapRef.current[filePath] ?? tab.content);

        setMarkdownDraftMap((previous) => {
          const isDirty = content !== savedContent;
          if (!isDirty) {
            if (!(filePath in previous)) {
              return previous;
            }

            const next = { ...previous };
            delete next[filePath];
            markdownDraftMapRef.current = next;
            return next;
          }

          const next = {
            ...previous,
            [filePath]: {
              html: null,
              text: content,
              isDirty: true,
              sourceMode: true
            }
          };
          markdownDraftMapRef.current = next;
          return next;
        });
        return;
      }

      setMarkdownDraftMap((previous) => {
        const current = previous[filePath];
        if (current?.html === nextText?.html && current?.text === nextText?.text && current?.sourceMode === false) {
          return previous;
        }

        const nextDraft = {
          html: normalizeText(nextText?.html),
          text: normalizeText(nextText?.text),
          isDirty: Boolean(nextText?.isDirty),
          sourceMode: false
        };
        if (!nextDraft.isDirty) {
          if (!(filePath in previous)) {
            return previous;
          }

          const next = { ...previous };
          delete next[filePath];
          markdownDraftMapRef.current = next;
          return next;
        }

        const next = {
          ...previous,
          [filePath]: nextDraft
        };
        markdownDraftMapRef.current = next;
        return next;
      });
      return;
    }

    setTabTextMap((previous) => {
      if (previous[filePath] === nextText) {
        return previous;
      }

      return {
        ...previous,
        [filePath]: normalizeText(nextText)
      };
    });
  }, [markdownSourceModeMap]);

  const applySavedContent = React.useCallback(({ filePath, content }) => {
    setSavedTextMap((previous) => ({
      ...previous,
      [filePath]: content
    }));
    savedTextMapRef.current = {
      ...savedTextMapRef.current,
      [filePath]: content
    };

    setTabTextMap((previous) => ({
      ...previous,
      [filePath]: content
    }));
    tabTextMapRef.current = {
      ...tabTextMapRef.current,
      [filePath]: content
    };

    setMarkdownDraftMap((previous) => {
      if (!(filePath in previous)) {
        return previous;
      }

      const next = { ...previous };
      delete next[filePath];
      markdownDraftMapRef.current = next;
      return next;
    });

    setTabs((previous) => previous.map((item) => (
      item.path === filePath
        ? { ...item, content }
        : item
    )));
  }, []);

  const applySavedAsContent = React.useCallback(({ oldPath, newPath, content, savedFile }) => {
    setTabs((previous) => previous.map((tab) => (
      tab.path === oldPath
        ? { ...savedFile, isTemporary: false, content }
        : tab
    )));

    setTabTextMap((previous) => {
      const next = { ...previous };
      delete next[oldPath];
      next[newPath] = content;
      tabTextMapRef.current = next;
      return next;
    });

    setSavedTextMap((previous) => {
      const next = { ...previous };
      delete next[oldPath];
      next[newPath] = content;
      savedTextMapRef.current = next;
      return next;
    });

    setMarkdownDraftMap((previous) => {
      const next = { ...previous };
      delete next[oldPath];
      delete next[newPath];
      markdownDraftMapRef.current = next;
      return next;
    });

    setActiveTabPath(newPath);
  }, []);

  const saveTabByPath = React.useCallback(async (filePath) => {
    return saveTabWithPath(filePath, {
      findTabByPath: (targetPath) => tabsRef.current.find((item) => item.path === targetPath),
      getPersistedContentForTab,
      saveFile: (payload) => window.desktopApi.saveFile(payload),
      applySavedContent
    });
  }, [applySavedContent, getPersistedContentForTab]);

  const saveTabAsByPath = React.useCallback(async (filePath) => {
    return saveTabAsWithPath(filePath, {
      findTabByPath: (targetPath) => tabsRef.current.find((tab) => tab.path === targetPath),
      getPersistedContentForTab,
      buildDefaultPath: (tab) => (
        tab.isTemporary
          ? joinFilePath(tab.preferredDirectory || rootPath || "C:\\", tab.name)
          : tab.path
      ),
      saveFileAs: (payload) => window.desktopApi.saveFileAs(payload),
      readFile: (targetPath) => window.desktopApi.readFile(targetPath),
      applySavedAsContent,
      afterSaveAs: async ({ newPath, savedFile }) => {
        updateRecentItems({
          path: newPath,
          kind: "file",
          label: savedFile.name,
          timestamp: Date.now()
        });

        if (rootPath && isPathInsideRoot(newPath, rootPath)) {
          const refreshed = await window.desktopApi.openWorkspacePath(rootPath);
          applyWorkspaceResult(refreshed);
          expandToPath(getDirName(newPath));
        }
      }
    });
  }, [applySavedAsContent, applyWorkspaceResult, expandToPath, getPersistedContentForTab, rootPath, updateRecentItems]);

  const saveCurrentAs = React.useCallback(async () => {
    const currentPath = activeTabPathRef.current;
    if (!currentPath) {
      return { ok: false };
    }

    return saveTabAsByPath(currentPath);
  }, [saveTabAsByPath]);

  const saveActiveFile = React.useCallback(async () => {
    return saveActiveTab({
      getActiveTabPath: () => activeTabPathRef.current,
      saveTabByPath,
      saveTabAsByPath
    });
  }, [saveTabAsByPath, saveTabByPath]);

  const saveActiveFileWithToast = React.useCallback(async () => {
    const result = await saveActiveFile();
    if (result?.ok) {
      showSuccess(UI_TEXT.toast.saveSuccess);
    }
    return result;
  }, [saveActiveFile, showSuccess]);

  const saveCurrentAsWithToast = React.useCallback(async () => {
    const result = await saveCurrentAs();
    if (result?.ok) {
      showSuccess(UI_TEXT.toast.saveAsSuccess);
    }
    return result;
  }, [saveCurrentAs, showSuccess]);

  const attemptCloseWindow = React.useCallback(async () => {
    window.desktopApi.confirmWindowClose();
  }, []);

  const closeTab = React.useCallback(async (filePath) => {
    await closeTabWithPrompt(filePath, {
      findTabByPath: (targetPath) => tabsRef.current.find((item) => item.path === targetPath),
      isTabDirty,
      confirmCloseTab: (payload) => window.desktopApi.confirmCloseTab(payload),
      saveTabByPath,
      saveTabAsByPath,
      removeTabByPath
    });
  }, [isTabDirty, removeTabByPath, saveTabAsByPath, saveTabByPath]);

  const closeTabsSequentially = React.useCallback(async (filePaths) => {
    for (const filePath of filePaths) {
      const result = await closeTabWithPrompt(filePath, {
        findTabByPath: (targetPath) => tabsRef.current.find((item) => item.path === targetPath),
        isTabDirty,
        confirmCloseTab: (payload) => window.desktopApi.confirmCloseTab(payload),
        saveTabByPath,
        saveTabAsByPath,
        removeTabByPath
      });

      if (!result?.ok) {
        return result;
      }
    }

    return { ok: true };
  }, [isTabDirty, removeTabByPath, saveTabAsByPath, saveTabByPath]);

  const closeOtherTabs = React.useCallback(async (keepPath) => {
    const targets = tabsRef.current
      .filter((tab) => tab.path !== keepPath)
      .map((tab) => tab.path);
    return closeTabsSequentially(targets);
  }, [closeTabsSequentially]);

  const closeAllTabs = React.useCallback(async () => {
    const targets = tabsRef.current.map((tab) => tab.path);
    return closeTabsSequentially(targets);
  }, [closeTabsSequentially]);

  const closeTabsToRight = React.useCallback(async (anchorPath) => {
    const anchorIndex = tabsRef.current.findIndex((tab) => tab.path === anchorPath);
    if (anchorIndex === -1) {
      return { ok: false, reason: "missing-tab" };
    }

    const targets = tabsRef.current
      .slice(anchorIndex + 1)
      .map((tab) => tab.path);
    return closeTabsSequentially(targets);
  }, [closeTabsSequentially]);

  const closeSavedTabs = React.useCallback(async () => {
    const targets = tabsRef.current
      .filter((tab) => !isTabDirty(tab))
      .map((tab) => tab.path);
    return closeTabsSequentially(targets);
  }, [closeTabsSequentially, isTabDirty]);

  const copyTabPath = React.useCallback(async (filePath) => {
    if (!filePath || String(filePath).startsWith("untitled:")) {
      showError("当前标签还没有实际文件路径");
      return;
    }

    try {
      await navigator.clipboard.writeText(filePath);
      showSuccess("文件路径已复制");
    } catch {
      showError(UI_TEXT.toast.copyError);
    }
  }, [showError, showSuccess]);

  const moveTabToDocumentWindow = React.useCallback(async (filePath) => {
    const tab = tabsRef.current.find((item) => item.path === filePath);
    if (!tab || String(tab.path).startsWith("untitled:")) {
      return { ok: false, reason: "missing-tab" };
    }

    let targetPath = filePath;

    if (isTabDirty(tab)) {
      const decision = await window.desktopApi.confirmCloseTab({
        fileName: tab.name
      });

      if (decision?.action === "cancel") {
        return { ok: false, reason: "cancelled" };
      }

      if (decision?.action === "save") {
        const saveResult = await saveTabByPath(filePath);
        if (saveResult.requiresSaveAs) {
          const saveAsResult = await saveTabAsByPath(filePath);
          if (!saveAsResult?.ok || !saveAsResult.filePath) {
            return { ok: false, reason: "save-as-cancelled" };
          }
          targetPath = saveAsResult.filePath;
        } else if (!saveResult.ok) {
          return { ok: false, reason: "save-failed" };
        }
      }
    }

    const openResult = await window.desktopApi.openDocumentWindow(targetPath);
    if (!openResult?.ok) {
      return { ok: false, reason: "open-window-failed" };
    }

    removeTabByPath(targetPath);
    markDocumentPathDetached(targetPath);
    return { ok: true, filePath: targetPath };
  }, [isTabDirty, markDocumentPathDetached, removeTabByPath, saveTabAsByPath, saveTabByPath]);

  const moveTab = React.useCallback((sourcePath, targetPath, position) => {
    if (!sourcePath || !targetPath || sourcePath === targetPath) {
      return;
    }

    setTabs((previous) => {
      const sourceIndex = previous.findIndex((tab) => tab.path === sourcePath);
      const targetIndex = previous.findIndex((tab) => tab.path === targetPath);
      if (sourceIndex === -1 || targetIndex === -1) {
        return previous;
      }

      const next = previous.slice();
      const [moved] = next.splice(sourceIndex, 1);
      const adjustedTargetIndex = sourceIndex < targetIndex ? targetIndex - 1 : targetIndex;
      const insertIndex = position === "after" ? adjustedTargetIndex + 1 : adjustedTargetIndex;
      next.splice(insertIndex, 0, moved);
      return next;
    });
  }, []);

  const resetTabDragState = React.useCallback(() => {
    setDraggingTabPath(null);
    setDragOverTab(null);
  }, []);

  React.useEffect(() => {
    function handleKeyDown(event) {
      const key = event.key.toLowerCase();
      if ((event.ctrlKey || event.metaKey) && key === "s") {
        event.preventDefault();
        event.stopPropagation();
        if (event.shiftKey) {
          void saveCurrentAsWithToast();
        } else {
          void saveActiveFileWithToast();
        }
      }

      if ((event.ctrlKey || event.metaKey) && key === "o") {
        event.preventDefault();
        event.stopPropagation();
        void openFileDialog();
      }

      if ((event.ctrlKey || event.metaKey) && key === "t") {
        event.preventDefault();
        event.stopPropagation();
        void createTemporaryTabAction();
      }
    }

    document.addEventListener("keydown", handleKeyDown, true);
    return () => document.removeEventListener("keydown", handleKeyDown, true);
  }, [createTemporaryTabAction, openFileDialog, saveActiveFileWithToast, saveCurrentAsWithToast]);

  React.useEffect(() => {
    return window.desktopApi.onRequestWindowClose(() => {
      void attemptCloseWindow();
    });
  }, [attemptCloseWindow]);

  const handleSearchSelect = React.useCallback(async (filePath) => {
    setSearchOpen(false);
    setSearchQuery("");
    await openFile(filePath);
  }, [openFile]);

  const copyActiveContent = React.useCallback(async () => {
    if (activeTab) {
      try {
        await navigator.clipboard.writeText(await getPersistedContentForTab(activeTab));
        showSuccess(UI_TEXT.toast.copySuccess);
      } catch {
        showError(UI_TEXT.toast.copyError);
      }
    }
  }, [activeTab, getPersistedContentForTab, showError, showSuccess]);

  const handleOutlineChange = React.useCallback((tabPath: string, items: TiptapOutlineItem[]) => {
    setOutlineMap((previous) => {
      const currentItems = previous[tabPath] || [];
      const isSame = currentItems.length === items.length && currentItems.every((item, index) => (
        item.id === items[index]?.id
        && item.level === items[index]?.level
        && item.text === items[index]?.text
        && item.pos === items[index]?.pos
      ));

      if (isSame) {
        return previous;
      }

      return {
        ...previous,
        [tabPath]: items
      };
    });
  }, []);

  const handleOutlineApiReady = React.useCallback((tabPath: string, api: TiptapOutlineApi | null) => {
    if (api) {
      outlineApiMapRef.current.set(tabPath, api);
      return;
    }

    outlineApiMapRef.current.delete(tabPath);
  }, []);

  const handleCommandApiReady = React.useCallback((tabPath: string, api: TiptapCommandApi | null) => {
    if (api) {
      commandApiMapRef.current.set(tabPath, api);
      return;
    }

    commandApiMapRef.current.delete(tabPath);
  }, []);

  const handleOutlineItemClick = React.useCallback((itemId: string) => {
    if (!activeTabPath) {
      return;
    }

    outlineApiMapRef.current.get(activeTabPath)?.scrollToItem(itemId);
  }, [activeTabPath]);

  const exportActiveContent = React.useCallback(async () => {
    if (!activeTab) {
      return;
    }

    try {
      const result = await window.desktopApi.exportFile({
        defaultPath: activeTab.isTemporary ? activeTab.name : activeTab.path,
        content: await getPersistedContentForTab(activeTab)
      });
      if (result?.canceled) {
        return;
      }

      showSuccess(UI_TEXT.toast.exportSuccess);
    } catch {
      showError(UI_TEXT.toast.exportError);
    }
  }, [activeTab, getPersistedContentForTab, showError, showSuccess]);

  const searchResults = React.useMemo(() => {
    if (!searchOpen || !deferredSearchQuery.trim()) {
      return [];
    }

    const query = deferredSearchQuery.trim().toLowerCase();
    const tabResults = indexedSearchTabs
      .filter((tab) => tab.searchName.includes(query) || tab.searchPath.includes(query))
      .map((tab) => ({
        id: `tab:${tab.path}`,
        label: tab.name,
        description: tab.path,
        badge: UI_TEXT.search.openedBadge,
        path: tab.path
      }));

    const tabPaths = new Set(tabResults.map((item) => item.path));
    const fileResults = indexedSearchFiles
      .filter((file) => file.searchName.includes(query) || file.searchPath.includes(query))
      .filter((file) => !tabPaths.has(file.path))
      .slice(0, 8)
      .map((file) => ({
        id: `file:${file.path}`,
        label: file.name,
        description: file.path,
        badge: UI_TEXT.search.fileBadge,
        path: file.path
      }));

    return [...tabResults, ...fileResults].slice(0, 10);
  }, [deferredSearchQuery, indexedSearchFiles, indexedSearchTabs, searchOpen]);

  const handleTreeFileOpen = React.useCallback(async (filePath, fileName) => {
    await openFile(filePath);
    updateRecentItems({
      path: filePath,
      kind: "file",
      label: fileName,
      timestamp: Date.now()
    });
  }, [openFile, updateRecentItems]);

  const applyWorkspaceTreeMutation = React.useCallback(async (result, options: { expandPath?: string } = {}) => {
    if (!result?.tree || !result?.rootPath) {
      return;
    }

    treeRef.current = result.tree;
    setTree(result.tree);
    if (options.expandPath) {
      await ensureDirectoryVisible(options.expandPath);
    }
  }, [ensureDirectoryVisible]);

  const removeTabsInPath = React.useCallback((targetPath) => {
    if (!targetPath) {
      return;
    }

    const affectedPaths = tabsRef.current
      .filter((tab) => isSameOrDescendantPath(tab.path, targetPath))
      .map((tab) => tab.path);

    for (const filePath of affectedPaths) {
      removeTabByPath(filePath);
    }
  }, [removeTabByPath]);

  const remapOpenTabsInPath = React.useCallback((oldPath, newPath) => {
    if (!oldPath || !newPath || oldPath === newPath) {
      return;
    }

    setTabs((previous) => previous.map((tab) => {
      if (!isSameOrDescendantPath(tab.path, oldPath)) {
        return tab;
      }

      const nextPath = replacePathPrefix(tab.path, oldPath, newPath);
      return {
        ...tab,
        path: nextPath,
        name: getBaseName(nextPath),
        preferredDirectory: tab.isTemporary ? replacePathPrefix(tab.preferredDirectory, oldPath, newPath) : tab.preferredDirectory
      };
    }));

    setTabTextMap((previous) => {
      const entries = Object.entries(previous as Record<string, string>);
      const hasMatch = entries.some(([key]) => isSameOrDescendantPath(key, oldPath));
      if (!hasMatch) {
        return previous;
      }

      const next = {} as Record<string, string>;
      for (const [key, value] of entries) {
        const nextKey = isSameOrDescendantPath(key, oldPath)
          ? replacePathPrefix(key, oldPath, newPath)
          : key;
        next[nextKey] = value;
      }
      tabTextMapRef.current = next;
      return next;
    });

    setSavedTextMap((previous) => {
      const entries = Object.entries(previous as Record<string, string>);
      const hasMatch = entries.some(([key]) => isSameOrDescendantPath(key, oldPath));
      if (!hasMatch) {
        return previous;
      }

      const next = {} as Record<string, string>;
      for (const [key, value] of entries) {
        const nextKey = isSameOrDescendantPath(key, oldPath)
          ? replacePathPrefix(key, oldPath, newPath)
          : key;
        next[nextKey] = value;
      }
      savedTextMapRef.current = next;
      return next;
    });

    setMarkdownDraftMap((previous) => {
      const entries = Object.entries(previous as Record<string, unknown>);
      const hasMatch = entries.some(([key]) => isSameOrDescendantPath(key, oldPath));
      if (!hasMatch) {
        return previous;
      }

      const next = {} as Record<string, unknown>;
      for (const [key, value] of entries) {
        const nextKey = isSameOrDescendantPath(key, oldPath)
          ? replacePathPrefix(key, oldPath, newPath)
          : key;
        next[nextKey] = value;
      }
      markdownDraftMapRef.current = next;
      return next;
    });

    if (isSameOrDescendantPath(activeTabPathRef.current, oldPath)) {
      setActiveTabPath(replacePathPrefix(activeTabPathRef.current, oldPath, newPath));
    }
  }, []);

  const runTreeMutation = React.useCallback(async (
    runner: () => Promise<any>,
    options: { expandPath?: string; afterMutation?: (result: any) => Promise<void> | void } = {}
  ) => {
    if (!rootPath) {
      return;
    }

    try {
      const result = await runner();
      await applyWorkspaceTreeMutation(result, options);
      if (options.afterMutation) {
        await options.afterMutation(result);
      }
    } catch (error) {
      showError(error instanceof Error ? error.message : "操作失败");
    }
  }, [applyWorkspaceTreeMutation, rootPath, showError]);

  const handleTreeContextMenu = React.useCallback((node, event) => {
    event.preventDefault();
    setTabContextMenu(null);
    setSelectedTreePath(node.path);
    setTreeContextMenu({
      node,
      x: event.clientX,
      y: event.clientY
    });
  }, []);

  const handleCreateMarkdownAtNode = React.useCallback(async (node) => {
    const targetDirectory = node.type === "directory" ? node.path : getDirName(node.path);
    await runTreeMutation(
      () => window.desktopApi.createMarkdownFile({
        rootPath,
        parentPath: targetDirectory,
        fileName: "Untitled.md"
      }),
      {
        expandPath: targetDirectory,
        afterMutation: async (result) => {
          const filePath = result?.filePath;
          if (!filePath) {
            return;
          }
          setSelectedTreePath(filePath);
          setTreeRenamingPath(filePath);
          setTreeRenamingValue(getBaseName(filePath));
          await openFile(filePath);
        }
      }
    );
  }, [openFile, rootPath, runTreeMutation]);

  const handleCreateTextAtNode = React.useCallback(async (node) => {
    const targetDirectory = node.type === "directory" ? node.path : getDirName(node.path);
    await runTreeMutation(
      () => window.desktopApi.createTextFile({
        rootPath,
        parentPath: targetDirectory,
        fileName: "Untitled.txt"
      }),
      {
        expandPath: targetDirectory,
        afterMutation: async (result) => {
          const filePath = result?.targetPath;
          if (!filePath) {
            return;
          }
          setSelectedTreePath(filePath);
          setTreeRenamingPath(filePath);
          setTreeRenamingValue(getBaseName(filePath));
          await openFile(filePath);
        }
      }
    );
  }, [openFile, rootPath, runTreeMutation]);

  const handleCreateFolderAtNode = React.useCallback(async (node) => {
    const targetDirectory = node.type === "directory" ? node.path : getDirName(node.path);
    await runTreeMutation(
      () => window.desktopApi.createFolder({
        rootPath,
        parentPath: targetDirectory,
        folderName: "New Folder"
      }),
      {
        expandPath: targetDirectory,
        afterMutation: async (result) => {
          if (result?.targetPath) {
            setSelectedTreePath(result.targetPath);
            setTreeRenamingPath(result.targetPath);
            setTreeRenamingValue(getBaseName(result.targetPath));
          }
        }
      }
    );
  }, [rootPath, runTreeMutation]);

  const handleRevealTreeNode = React.useCallback(async (node) => {
    try {
      await window.desktopApi.revealInExplorer(node.path);
    } catch (error) {
      showError(error instanceof Error ? error.message : "无法在资源管理器中显示");
    }
  }, [showError]);

  const handleRenameTreeNode = React.useCallback((node) => {
    setSelectedTreePath(node.path);
    setTreeRenamingPath(node.path);
    setTreeRenamingValue(node.name);
  }, []);

  const submitTreeRename = React.useCallback(async () => {
    if (!treeRenamingPath) {
      return;
    }

    const node = findTreeNodeByPath(treeRef.current, treeRenamingPath);
    const nextName = treeRenamingValue.trim();
    setTreeRenamingPath(null);
    if (!node || !nextName || nextName === node.name) {
      return;
    }

    await runTreeMutation(
      () => window.desktopApi.renamePath({
        rootPath,
        targetPath: treeRenamingPath,
        nextName
      }),
      {
        expandPath: getDirName(treeRenamingPath),
        afterMutation: async (result) => {
          if (result?.targetPath) {
            setSelectedTreePath(result.targetPath);
            remapOpenTabsInPath(treeRenamingPath, result.targetPath);
          }
        }
      }
    );
  }, [remapOpenTabsInPath, rootPath, runTreeMutation, treeRenamingPath, treeRenamingValue]);

  const cancelTreeRename = React.useCallback(() => {
    setTreeRenamingPath(null);
    setTreeRenamingValue("");
  }, []);

  const handleDeleteTreeNode = React.useCallback(async (node) => {
    const confirmed = window.confirm(`确认删除 "${node.name}" 吗？`);
    if (!confirmed) {
      return;
    }

    if (treeRenamingPath && isSameOrDescendantPath(treeRenamingPath, node.path)) {
      setTreeRenamingPath(null);
      setTreeRenamingValue("");
    }

    await runTreeMutation(
      () => window.desktopApi.deletePath({
        rootPath,
        targetPath: node.path
      }),
      {
        expandPath: getDirName(node.path),
        afterMutation: async () => {
          setSelectedTreePath(getDirName(node.path) || rootPath || null);
          removeTabsInPath(node.path);
        }
      }
    );
  }, [removeTabsInPath, rootPath, runTreeMutation, treeRenamingPath]);

  const renderSidebarBody = () => {
    if (activeView === "search") {
      return (
        <div className="panel panel--placeholder">
          <div className="panel__title">{UI_TEXT.sidebar.searchTitle}</div>
          <p>{UI_TEXT.sidebar.searchDescription}</p>
        </div>
      );
    }

    if (activeView === "git") {
      return (
        <div className="panel panel--placeholder">
          <div className="panel__title">{UI_TEXT.sidebar.gitTitle}</div>
          <p>{UI_TEXT.sidebar.gitDescription}</p>
        </div>
      );
    }

    if (activeView === "extensions") {
      return (
        <div className="panel panel--placeholder">
          <div className="panel__title">{UI_TEXT.sidebar.extensionsTitle}</div>
          <p>{UI_TEXT.sidebar.extensionsDescription}</p>
        </div>
      );
    }

    if (showStartupPlaceholder) {
      return (
        <div className="panel panel--placeholder">
          <div className="panel__title">正在恢复工作区</div>
          <p>正在读取上次打开的文件夹...</p>
        </div>
      );
    }

    return (
      <>
        <TreeView
          tree={tree}
          expandedPaths={expandedPaths}
          loadingPaths={loadingTreePaths}
          activeFilePath={activeTabPath}
          selectedPath={selectedTreePath}
          renamingPath={treeRenamingPath}
          renamingValue={treeRenamingValue}
          onSelectNode={handleTreeSelect}
          onToggleDirectory={toggleDirectory}
          onOpenFile={handleTreeFileOpen}
          onContextMenu={handleTreeContextMenu}
          onRenamingChange={setTreeRenamingValue}
          onRenamingSubmit={() => void submitTreeRename()}
          onRenamingCancel={cancelTreeRename}
          onClearSelection={() => setSelectedTreePath(null)}
        />
      </>
    );
  };

  const handleSidebarResizeStart = React.useCallback((event) => {
    if (!sidebarVisible) {
      return;
    }

    event.preventDefault();
    const startX = event.clientX;
    const startWidth = sidebarWidth;

    function handlePointerMove(moveEvent) {
      const nextWidth = Math.min(
        SIDEBAR_MAX_WIDTH,
        Math.max(SIDEBAR_MIN_WIDTH, startWidth + (moveEvent.clientX - startX))
      );
      setSidebarWidth(nextWidth);
    }

    function handlePointerUp() {
      window.removeEventListener("mousemove", handlePointerMove);
      window.removeEventListener("mouseup", handlePointerUp);
    }

    window.addEventListener("mousemove", handlePointerMove);
    window.addEventListener("mouseup", handlePointerUp);
  }, [sidebarVisible, sidebarWidth]);

  const treeContextNode = treeContextMenu?.node || null;
  const isWorkspaceRootNode = Boolean(treeContextNode && rootPath && treeContextNode.path === rootPath);
  const canCreateInTreeNode = Boolean(treeContextNode && treeContextNode.type === "directory");
  const showStartupPlaceholder = isRestoringWorkspace && !rootPath && tabs.length === 0;

  return (
    <div
      id="app-shell"
      className={sidebarVisible ? "" : "app-shell--sidebar-collapsed"}
      style={{
        "--sidebar-width": `${sidebarWidth}px`
      } as CSSProperties}
    >
      <header className="titlebar">
        <div className="titlebar__left">
          <div className="titlebar__brand titlebar__brand--compact">
            <span className="titlebar__dot" />
            <span className="titlebar__title">DeskPilot</span>
          </div>
          <FileMenu
            recentItems={recentItems}
            onNewTab={createTemporaryTabAction}
            onNewWindow={() => window.desktopApi.newWindow()}
            onOpenFile={openFileDialog}
            onOpenFolder={pickDirectory}
            onOpenRecent={openRecentItem}
            onSave={saveActiveFileWithToast}
            onSaveAs={saveCurrentAsWithToast}
            onQuit={() => void attemptCloseWindow()}
            markdownEnabled={activeTab?.kind === "markdown" && !activeMarkdownSourceMode}
            formatActions={activeTab?.kind === "markdown" ? {
              onBold: () => runActiveMarkdownCommand((api) => api.toggleBold()),
              onItalic: () => runActiveMarkdownCommand((api) => api.toggleItalic()),
              onUnderline: () => runActiveMarkdownCommand((api) => api.toggleUnderline()),
              onStrike: () => runActiveMarkdownCommand((api) => api.toggleStrike()),
              onInlineCode: () => runActiveMarkdownCommand((api) => api.toggleInlineCode()),
              onBulletList: () => runActiveMarkdownCommand((api) => api.toggleBulletList()),
              onOrderedList: () => runActiveMarkdownCommand((api) => api.toggleOrderedList()),
              onTaskList: () => runActiveMarkdownCommand((api) => api.toggleTaskList()),
              onBlockquote: () => runActiveMarkdownCommand((api) => api.toggleBlockquote()),
              onCodeBlock: () => runActiveMarkdownCommand((api) => api.toggleCodeBlock()),
              onClearFormatting: () => runActiveMarkdownCommand((api) => api.clearFormatting())
            } : undefined}
            markdownActions={activeTab?.kind === "markdown" ? {
              onHeading: (level) => runActiveMarkdownCommand((api) => api.toggleHeading(level)),
              onHorizontalRule: () => runActiveMarkdownCommand((api) => api.insertHorizontalRule()),
              onInlineMath: () => runActiveMarkdownCommand((api) => api.insertInlineMath()),
              onBlockMath: () => runActiveMarkdownCommand((api) => api.insertBlockMath()),
              onImage: () => runActiveMarkdownCommand((api) => api.insertImageFromFile())
            } : undefined}
            helpActions={{
              onOpenGettingStarted: () => window.desktopApi.openExternalUrl(GETTING_STARTED_URL),
              onOpenMarkdownHandbook: () => window.desktopApi.openExternalUrl(MARKDOWN_HANDBOOK_URL),
              onOpenLicense: () => window.desktopApi.openExternalUrl(LICENSE_URL),
              version: "v0.0.2",
              contactEmail: "doveyh@foxmail.com",
              homepageUrl: REPOSITORY_URL
            }}
            viewActions={{
              sourceModeEnabled: activeTab?.kind === "markdown",
              sourceModeActive: activeMarkdownSourceMode,
              onToggleSourceMode: toggleActiveMarkdownSourceMode,
              showSidebarEnabled: true,
              showSidebarActive: sidebarVisible,
              onToggleSidebar: () => setSidebarVisible((previous) => !previous),
              showOutlineEnabled: canToggleOutline,
              showOutlineActive: showOutlinePane,
              onToggleOutline: () => setOutlineOpen((previous) => !previous),
              openInNewWindowEnabled: Boolean(activeTab && !String(activeTab.path).startsWith("untitled:")),
              onOpenInNewWindow: () => activeTab ? moveTabToDocumentWindow(activeTab.path) : undefined,
              onMinimizeWindow: () => window.desktopApi.minimizeWindow(),
              alwaysOnTopEnabled: true,
              alwaysOnTopActive: isAlwaysOnTop,
              onToggleAlwaysOnTop: async () => {
                const result = await window.desktopApi.toggleAlwaysOnTop();
                setIsAlwaysOnTop(result.alwaysOnTop);
              },
              onZoomInWindow: () => window.desktopApi.zoomInWindow(),
              onZoomOutWindow: () => window.desktopApi.zoomOutWindow()
            }}
          />
        </div>

        <div className="titlebar__center">
          <CommandSearch
            searchOpen={searchOpen}
            searchQuery={searchQuery}
            searchInputRef={searchInputRef}
            searchBoxRef={searchBoxRef}
            searchResults={searchResults}
            onOpen={() => setSearchOpen(true)}
            onClose={() => {
              setSearchOpen(false);
              setSearchQuery("");
            }}
            onQueryChange={setSearchQuery}
            onSelect={(path) => void handleSearchSelect(path)}
          />
        </div>

        <div className="titlebar__actions">
          <button type="button" className="window-btn" onClick={() => window.desktopApi.minimizeWindow()}>-</button>
          <button
            type="button"
            className="window-btn"
            onClick={async () => {
              window.desktopApi.toggleMaximizeWindow();
              window.setTimeout(async () => {
                setIsMaximized(await window.desktopApi.isWindowMaximized());
              }, 50);
            }}
          >
            {isMaximized ? UI_TEXT.window.restore : UI_TEXT.window.maximize}
          </button>
          <button type="button" className="window-btn window-btn--danger" onClick={() => window.desktopApi.closeWindow()}>{UI_TEXT.window.close}</button>
        </div>
      </header>

      <div className="app-body">
        <ActivityBar
          activeView={activeView}
          sidebarVisible={sidebarVisible}
          onSelect={(nextView) => {
            setActiveView((currentView) => {
              const resolvedView = currentView || nextView;
              setSidebarVisible((previous) => {
                if (previous && resolvedView === nextView) {
                  return false;
                }
                return true;
              });
              return nextView;
            });
          }}
        />

        <aside className="sidebar">
          {renderSidebarBody()}
        </aside>

        <div
          className="sidebar-resizer"
          role="separator"
          aria-orientation="vertical"
          aria-label={UI_TEXT.sidebar.resizeAriaLabel}
          onMouseDown={handleSidebarResizeStart}
        />

        <main className="content">
          <div className="tabs">
            {tabs.map((tab) => {
              const tabDisplayPath = getTemporaryTabDisplayPath(tab) || tab.path || tab.name;
              return (
                <button
                  type="button"
                  key={tab.path}
                  draggable
                  className={`tab ${tab.path === activeTabPath ? "tab--active" : ""} ${draggingTabPath === tab.path ? "tab--dragging" : ""} ${dragOverTab?.path === tab.path ? `tab--drop-${dragOverTab.position}` : ""}`}
                  title={tabDisplayPath}
                  onClick={() => setActiveTabPath(tab.path)}
                  onMouseDown={(event) => {
                    if (event.button === 1) {
                      event.preventDefault();
                      event.stopPropagation();
                      void closeTab(tab.path);
                    }
                  }}
                  onDragStart={(event) => {
                    setDraggingTabPath(tab.path);
                    setDragOverTab(null);
                    event.dataTransfer.effectAllowed = "move";
                    event.dataTransfer.setData("text/plain", tab.path);
                  }}
                  onDragOver={(event) => {
                    if (!draggingTabPath || draggingTabPath === tab.path) {
                      return;
                    }
                    event.preventDefault();
                    const rect = event.currentTarget.getBoundingClientRect();
                    const position = event.clientX - rect.left < rect.width / 2 ? "before" : "after";
                    setDragOverTab((previous) => (
                      previous?.path === tab.path && previous?.position === position
                        ? previous
                        : { path: tab.path, position }
                    ));
                  }}
                  onDrop={(event) => {
                    event.preventDefault();
                    const sourcePath = draggingTabPath || event.dataTransfer.getData("text/plain");
                    if (sourcePath && dragOverTab?.path === tab.path) {
                      moveTab(sourcePath, tab.path, dragOverTab.position);
                    }
                    resetTabDragState();
                  }}
                  onDragEnd={() => {
                    resetTabDragState();
                  }}
                  onContextMenu={(event) => {
                    event.preventDefault();
                    setActiveTabPath(tab.path);
                    setTreeContextMenu(null);
                    setTabContextMenu({
                      path: tab.path,
                      x: event.clientX,
                      y: event.clientY
                    });
                  }}
                >
                  <span className="tab__title">{tab.name}</span>
                  {(tab.kind === "markdown"
                    ? isMarkdownTabDirty(tab)
                    : tab.kind === "image" || tab.kind === "audio" || tab.kind === "video" || tab.kind === "pdf" || tab.kind === "webpage" || tab.kind === "notebook"
                      ? false
                    : tabTextMap[tab.path] !== (savedTextMap[tab.path] ?? tab.content ?? "")) ? (
                    <span className="tab__dirty-dot" title={UI_TEXT.tabs.dirtyTitle}>●</span>
                  ) : null}
                  <span
                    className="tab__close"
                    onClick={(event) => {
                      event.stopPropagation();
                      closeTab(tab.path);
                    }}
                  >
                    {UI_TEXT.window.close}
                  </span>
                </button>
              );
            })}
          </div>

          <section className={`viewer ${activeTab ? "" : "viewer--empty"}`}>
            {showStartupPlaceholder ? (
              <div className="viewer__empty">
                <h2>正在打开最近工作区</h2>
                <p>第二个实例启动时，正在恢复上次打开的文件夹。</p>
              </div>
            ) : (
              <div className={`viewer__layout ${showOutlinePane ? "viewer__layout--with-outline" : ""}`}>
            <EditorHost
              tabs={tabs}
              activeTabPath={activeTabPath}
              markdownDraftMap={markdownDraftMap}
              markdownSourceModeMap={markdownSourceModeMap}
              textContentMap={tabTextMap}
              onTextChange={handleTabTextChange}
              onSaveShortcut={() => void saveActiveFileWithToast()}
                  onOutlineChange={handleOutlineChange}
                  onOutlineApiReady={handleOutlineApiReady}
                  onCommandApiReady={handleCommandApiReady}
                  onPreviewStatusChange={(tabPath, status) => {
                    setPreviewStatusMap((previous) => {
                      if (!status) {
                        if (!(tabPath in previous)) {
                          return previous;
                        }

                        const next = { ...previous };
                        delete next[tabPath];
                        return next;
                      }

                      const current = previous[tabPath];
                      const nextStatus = { ...status };
                      if (current && JSON.stringify(current) === JSON.stringify(nextStatus)) {
                        return previous;
                      }

                      return {
                        ...previous,
                        [tabPath]: nextStatus
                      };
                    });
                  }}
                />
                {showOutlinePane ? (
                  <aside className="outline-pane" aria-label={UI_TEXT.statusbar.outline}>
                    <div className="outline-pane__header">{UI_TEXT.statusbar.outline}</div>
                    {activeOutlineItems.length ? (
                      <div className="outline-pane__list">
                        {activeOutlineItems.map((item) => (
                          <button
                            type="button"
                            key={item.id}
                            className={`outline-pane__item outline-pane__item--level-${Math.min(item.level, 6)}`}
                            onClick={() => handleOutlineItemClick(item.id)}
                            title={item.text}
                          >
                            <span className="outline-pane__level">H{item.level}</span>
                            <span className="outline-pane__text">{item.text}</span>
                          </button>
                        ))}
                      </div>
                    ) : (
                      <div className="outline-pane__empty">{UI_TEXT.statusbar.outlineEmpty}</div>
                    )}
                  </aside>
                ) : null}
              </div>
            )}
          </section>
        </main>
      </div>

      <footer className="statusbar">
        <div className="statusbar__left">
          {isPreviewTab ? (
            <>
              <span className="statusbar__item">{activeTabKindLabel}</span>
              <span className="statusbar__item">只读预览</span>
              {activePreviewDetailItems.map((item) => (
                <span key={item} className="statusbar__item">{item}</span>
              ))}
            </>
          ) : (
            <>
              <span className="statusbar__item">{UI_TEXT.statusbar.chars} {activeCharCount}</span>
              <span className="statusbar__item">{UI_TEXT.statusbar.lines} {activeLineCount}</span>
              <span className="statusbar__item">{activeIsDirty ? UI_TEXT.statusbar.unsaved : UI_TEXT.statusbar.saved}</span>
            </>
          )}
          <span className="statusbar__item statusbar__item--path" title={activeStatusPath.title}>{activeStatusPath.label}</span>
        </div>
        <div className="statusbar__right">
          {isEditableTab ? (
            activeTab?.kind === "markdown" ? (
              <>
                {activeMarkdownSourceMode ? (
                  <span className="statusbar__item">源码模式</span>
                ) : null}
                <button type="button" className="statusbar__item" onClick={() => void copyActiveContent()}>{UI_TEXT.statusbar.copy}</button>
              </>
            ) : (
              <>
                <button type="button" className="statusbar__item" onClick={() => void saveActiveFileWithToast()}>{UI_TEXT.statusbar.save}</button>
                <button type="button" className="statusbar__item" onClick={() => void copyActiveContent()}>{UI_TEXT.statusbar.copy}</button>
              </>
            )
          ) : null}
          {canToggleOutline ? (
            <button
              type="button"
              className={`statusbar__item ${showOutlinePane ? "statusbar__item--accent" : ""}`}
              onClick={() => setOutlineOpen((previous) => !previous)}
            >
              {UI_TEXT.statusbar.outline}
            </button>
          ) : null}
          {activeTab ? (
            <>
              <span className="statusbar__item">{activeTabKindLabel}</span>
              {!isPreviewTab ? (
                <span className="statusbar__item">UTF-8</span>
              ) : null}
            </>
          ) : null}
        </div>
      </footer>

      <Toast toast={toast} />
      {tabContextMenu ? (
        <div
          className="tab-context-menu"
          style={{
            left: `${tabContextMenu.x}px`,
            top: `${tabContextMenu.y}px`
          }}
        >
          <button
            type="button"
            className="tab-context-menu__item"
            disabled={!contextMenuTab}
            onClick={() => {
              if (!contextMenuTab) {
                return;
              }
              const targetPath = tabContextMenu.path;
              setTabContextMenu(null);
              void closeTab(targetPath);
            }}
          >
            关闭
          </button>
          <button
            type="button"
            className="tab-context-menu__item"
            disabled={!contextMenuTab || tabs.length <= 1}
            onClick={() => {
              if (!contextMenuTab || tabs.length <= 1) {
                return;
              }
              const targetPath = tabContextMenu.path;
              setTabContextMenu(null);
              void closeOtherTabs(targetPath);
            }}
          >
            关闭其它
          </button>
          <button
            type="button"
            className="tab-context-menu__item"
            disabled={tabs.length === 0}
            onClick={() => {
              if (tabs.length === 0) {
                return;
              }
              setTabContextMenu(null);
              void closeAllTabs();
            }}
          >
            关闭全部
          </button>
          <div className="tab-context-menu__separator" />
          <button
            type="button"
            className="tab-context-menu__item"
            disabled={contextMenuTabIndex === -1 || contextMenuTabIndex >= tabs.length - 1}
            onClick={() => {
              if (contextMenuTabIndex === -1 || contextMenuTabIndex >= tabs.length - 1) {
                return;
              }
              const targetPath = tabContextMenu.path;
              setTabContextMenu(null);
              void closeTabsToRight(targetPath);
            }}
          >
            向右关闭
          </button>
          <button
            type="button"
            className="tab-context-menu__item"
            disabled={savedTabCount === 0}
            onClick={() => {
              if (savedTabCount === 0) {
                return;
              }
              setTabContextMenu(null);
              void closeSavedTabs();
            }}
          >
            关闭已保存
          </button>
          <button
            type="button"
            className="tab-context-menu__item"
            disabled={!contextMenuTab || String(contextMenuTab.path).startsWith("untitled:")}
            onClick={() => {
              if (!contextMenuTab || String(contextMenuTab.path).startsWith("untitled:")) {
                return;
              }
              const targetPath = tabContextMenu.path;
              setTabContextMenu(null);
              void moveTabToDocumentWindow(targetPath);
            }}
          >
            在新窗口打开
          </button>
          <button
            type="button"
            className="tab-context-menu__item"
            disabled={!contextMenuTab || String(contextMenuTab.path).startsWith("untitled:")}
            onClick={() => {
              if (!contextMenuTab || String(contextMenuTab.path).startsWith("untitled:")) {
                return;
              }
              const targetPath = tabContextMenu.path;
              setTabContextMenu(null);
              void copyTabPath(targetPath);
            }}
          >
            复制文件路径
          </button>
        </div>
      ) : null}
      {treeContextMenu && treeContextNode ? (
        <div
          className="tree-context-menu"
          style={{
            left: `${treeContextMenu.x}px`,
            top: `${treeContextMenu.y}px`
          }}
        >
          <button type="button" className="tree-context-menu__item" disabled={!canCreateInTreeNode} onClick={() => {
            if (!canCreateInTreeNode) {
              return;
            }
            setTreeContextMenu(null);
            void handleCreateMarkdownAtNode(treeContextNode);
          }}>新建 Markdown</button>
          <button type="button" className="tree-context-menu__item" disabled={!canCreateInTreeNode} onClick={() => {
            if (!canCreateInTreeNode) {
              return;
            }
            setTreeContextMenu(null);
            void handleCreateTextAtNode(treeContextNode);
          }}>新建 Text</button>
          <button type="button" className="tree-context-menu__item" disabled={!canCreateInTreeNode} onClick={() => {
            if (!canCreateInTreeNode) {
              return;
            }
            setTreeContextMenu(null);
            void handleCreateFolderAtNode(treeContextNode);
          }}>新建文件夹</button>
          <div className="tree-context-menu__separator" />
          <button type="button" className="tree-context-menu__item" disabled={isWorkspaceRootNode} onClick={() => {
            if (isWorkspaceRootNode) {
              return;
            }
            setTreeContextMenu(null);
            void handleRenameTreeNode(treeContextNode);
          }}>重命名</button>
          <button type="button" className="tree-context-menu__item" onClick={() => {
            setTreeContextMenu(null);
            void handleRevealTreeNode(treeContextNode);
          }}>在资源管理器显示</button>
          <div className="tree-context-menu__separator" />
          <button type="button" className="tree-context-menu__item tree-context-menu__item--danger" disabled={isWorkspaceRootNode} onClick={() => {
            if (isWorkspaceRootNode) {
              return;
            }
            setTreeContextMenu(null);
            void handleDeleteTreeNode(treeContextNode);
          }}>删除</button>
        </div>
      ) : null}
    </div>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    {rendererMode === "document" ? (
      <DocumentApp targetPath={documentTargetPath} />
    ) : (
      <App />
    )}
  </React.StrictMode>
);
