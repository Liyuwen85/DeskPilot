import React, { type CSSProperties } from "react";
import { closeWindowWithPrompt } from "./close-workflow";
import { serializeMarkdownDraftAsync } from "./markdown-serializer";
import { saveActiveTab, saveTabAsWithPath, saveTabWithPath } from "./save-workflow";
import { UI_TEXT } from "./ui-text";
import { EditorHost } from "./components/EditorHost";
import { FileMenu } from "./components/FileMenu";
import { Toast } from "./components/Toast";
import type { TiptapCommandApi, TiptapOutlineApi, TiptapOutlineItem } from "./components/TiptapTabPane";
import { useToast } from "./use-toast";
import { isMarkdownTabDirty as computeMarkdownTabDirty } from "./close-guards";

const REPOSITORY_URL = "https://github.com/Liyuwen85/DeskPilot";
const GETTING_STARTED_URL = `${REPOSITORY_URL}/blob/main/README.md`;
const MARKDOWN_HANDBOOK_URL = `${REPOSITORY_URL}/blob/main/docs/markdown-handbook.zh-CN.md`;
const LICENSE_URL = `${REPOSITORY_URL}/blob/main/LICENSE`;

function normalizeText(value: unknown) {
  return typeof value === "string" ? value : "";
}

function joinFilePath(basePath: string, fileName: string) {
  if (!basePath) {
    return fileName;
  }

  const normalizedBase = String(basePath).replace(/[\\/]+$/, "");
  return `${normalizedBase}\\${fileName}`;
}

function getDirName(targetPath: string) {
  const normalized = String(targetPath || "").replace(/[\\/]+/g, "/").replace(/\/$/, "");
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

function getBaseName(targetPath: string) {
  const normalized = String(targetPath || "").replace(/[\\/]+/g, "/").replace(/\/$/, "");
  if (!normalized) {
    return "";
  }

  const segments = normalized.split("/");
  return segments[segments.length - 1] || normalized;
}

function getLanguageLabel(targetPath: string, kind?: string) {
  if (kind === "markdown") {
    return "Markdown";
  }

  if (kind !== "text") {
    return "";
  }

  const normalizedPath = String(targetPath || "").toLowerCase();
  const normalizedBaseName = normalizedPath.replace(/[\\/]+/g, "/").split("/").pop() || "";
  const match = normalizedPath.match(/\.([a-z0-9.+_-]+)$/i);
  const ext = match ? match[1] : "";

  if (normalizedBaseName === "dockerfile" || ext === "dockerfile") {
    return "Dockerfile";
  }

  const labels: Record<string, string> = {
    txt: "Plain Text",
    json: "JSON",
    js: "JavaScript",
    mjs: "JavaScript",
    cjs: "JavaScript",
    jsx: "JavaScript React",
    ts: "TypeScript",
    tsx: "TypeScript React",
    py: "Python",
    html: "HTML",
    htm: "HTML",
    css: "CSS",
    scss: "SCSS",
    sass: "Sass",
    less: "Less",
    xml: "XML",
    svg: "SVG",
    xhtml: "XHTML",
    yml: "YAML",
    yaml: "YAML",
    md: "Markdown",
    markdown: "Markdown",
    mdx: "MDX",
    sh: "Shell",
    ps1: "PowerShell",
    bat: "Batch",
    java: "Java",
    c: "C",
    h: "C Header",
    cc: "C++",
    cpp: "C++",
    cxx: "C++",
    hpp: "C++ Header",
    rs: "Rust",
    go: "Go",
    toml: "TOML",
    ini: "INI",
    log: "Log",
    csv: "CSV",
    sql: "SQL",
    bash: "Shell",
    zsh: "Shell"
  };

  return labels[ext] || (ext ? ext.toUpperCase() : "Plain Text");
}

function formatPreviewDuration(totalSeconds: number) {
  const safeSeconds = Math.max(0, Math.floor(Number(totalSeconds) || 0));
  const hours = Math.floor(safeSeconds / 3600);
  const minutes = Math.floor((safeSeconds % 3600) / 60);
  const seconds = safeSeconds % 60;

  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  }

  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

function formatFileSize(bytes: number) {
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

interface DocumentAppProps {
  targetPath: string;
}

export function DocumentApp({ targetPath }: DocumentAppProps) {
  const [appVersion, setAppVersion] = React.useState("");
  const [tab, setTab] = React.useState<any | null>(null);
  const [tabTextMap, setTabTextMap] = React.useState<Record<string, string | undefined>>({});
  const [savedTextMap, setSavedTextMap] = React.useState<Record<string, string | undefined>>({});
  const [markdownDraftMap, setMarkdownDraftMap] = React.useState<Record<string, any>>({});
  const [previewStatusMap, setPreviewStatusMap] = React.useState<Record<string, any>>({});
  const [markdownSourceMode, setMarkdownSourceMode] = React.useState(false);
  const [outlineOpen, setOutlineOpen] = React.useState(false);
  const [outlineItems, setOutlineItems] = React.useState<TiptapOutlineItem[]>([]);
  const [isMaximized, setIsMaximized] = React.useState(false);
  const [isAlwaysOnTop, setIsAlwaysOnTop] = React.useState(false);
  const [loadError, setLoadError] = React.useState("");
  const commandApiRef = React.useRef<TiptapCommandApi | null>(null);
  const outlineApiRef = React.useRef<TiptapOutlineApi | null>(null);
  const tabRef = React.useRef<any | null>(tab);
  const markdownDraftMapRef = React.useRef(markdownDraftMap);
  const tabTextMapRef = React.useRef(tabTextMap);
  const savedTextMapRef = React.useRef(savedTextMap);
  const { toast, showSuccess, showError } = useToast();
  // EditorHost is sensitive to unstable props here; keep the single-tab array memoized.
  const editorTabs = React.useMemo(() => (tab ? [tab] : []), [tab]);

  React.useEffect(() => {
    let cancelled = false;

    void window.desktopApi.getAppVersion()
      .then((version) => {
        if (!cancelled) {
          setAppVersion(typeof version === "string" ? version : "");
        }
      })
      .catch(() => {
        if (!cancelled) {
          setAppVersion("");
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  React.useEffect(() => {
    tabRef.current = tab;
  }, [tab]);

  React.useEffect(() => {
    markdownDraftMapRef.current = markdownDraftMap;
  }, [markdownDraftMap]);

  React.useEffect(() => {
    tabTextMapRef.current = tabTextMap;
  }, [tabTextMap]);

  React.useEffect(() => {
    savedTextMapRef.current = savedTextMap;
  }, [savedTextMap]);

  React.useEffect(() => {
    void window.desktopApi.isWindowMaximized().then(setIsMaximized);
    void window.desktopApi.isWindowAlwaysOnTop().then(setIsAlwaysOnTop);
  }, []);

  React.useEffect(() => {
    if (!targetPath) {
      setLoadError("Missing file path.");
      return;
    }

    let cancelled = false;

    void window.desktopApi.readFile(targetPath)
      .then((file) => {
        if (cancelled) {
          return;
        }

        const content = normalizeText(file.content);
        setTab({ ...file, content });
        setTabTextMap({ [file.path]: content });
        setSavedTextMap({ [file.path]: content });
        setMarkdownDraftMap({});
        setMarkdownSourceMode(false);
        setPreviewStatusMap({});
        setOutlineItems([]);
        setLoadError("");
      })
      .catch(() => {
        if (!cancelled) {
          setLoadError("Failed to open file.");
        }
      });

    return () => {
      cancelled = true;
    };
  }, [targetPath]);

  React.useEffect(() => {
    if (tab?.name) {
      document.title = `${tab.name} - DeskPilot`;
    }
  }, [tab?.name]);

  React.useEffect(() => {
    if (tab?.path) {
      window.desktopApi.updateDocumentWindowState({
        targetPath: tab.path
      });
    }
  }, [tab?.path]);

  const getPersistedContentForTab = React.useCallback(async (currentTab: any) => {
    if (!currentTab || currentTab.kind === "binary" || currentTab.kind === "image" || currentTab.kind === "audio" || currentTab.kind === "video" || currentTab.kind === "pdf" || currentTab.kind === "webpage" || currentTab.kind === "notebook") {
      return "";
    }

    if (currentTab.kind === "markdown") {
      return serializeMarkdownDraftAsync(markdownDraftMapRef.current[currentTab.path], currentTab.content);
    }

    return normalizeText(tabTextMapRef.current[currentTab.path] ?? currentTab.content);
  }, []);

  const applySavedContent = React.useCallback(({ filePath, content }) => {
    setSavedTextMap((previous) => ({ ...previous, [filePath]: content }));
    setTabTextMap((previous) => ({ ...previous, [filePath]: content }));
    setMarkdownDraftMap((previous) => {
      if (!(filePath in previous)) {
        return previous;
      }
      const next = { ...previous };
      delete next[filePath];
      return next;
    });
    setTab((previous: any) => (previous && previous.path === filePath ? { ...previous, content } : previous));
  }, []);

  const applySavedAsContent = React.useCallback(({ oldPath, newPath, content, savedFile }) => {
    setTab({ ...savedFile, isTemporary: false, content });
    setTabTextMap({ [newPath]: content });
    setSavedTextMap({ [newPath]: content });
    setMarkdownDraftMap({});
    setPreviewStatusMap((previous) => {
      const next = { ...previous };
      delete next[oldPath];
      return next;
    });
    setOutlineItems([]);
  }, []);

  const saveTabByPath = React.useCallback(async (filePath: string) => {
    return saveTabWithPath(filePath, {
      findTabByPath: (target: string) => (tabRef.current?.path === target ? tabRef.current : null),
      getPersistedContentForTab,
      saveFile: (payload: any) => window.desktopApi.saveFile(payload),
      applySavedContent
    });
  }, [applySavedContent, getPersistedContentForTab]);

  const saveTabAsByPath = React.useCallback(async (filePath: string) => {
    return saveTabAsWithPath(filePath, {
      findTabByPath: (target: string) => (tabRef.current?.path === target ? tabRef.current : null),
      getPersistedContentForTab,
      buildDefaultPath: (currentTab: any) => (
        currentTab.isTemporary
          ? joinFilePath(currentTab.preferredDirectory || getDirName(targetPath) || "C:\\", currentTab.name)
          : currentTab.path
      ),
      saveFileAs: (payload: any) => window.desktopApi.saveFileAs(payload),
      readFile: (pathToRead: string) => window.desktopApi.readFile(pathToRead),
      applySavedAsContent
    });
  }, [applySavedAsContent, getPersistedContentForTab, targetPath]);

  const saveCurrent = React.useCallback(async () => {
    return saveActiveTab({
      getActiveTabPath: () => tabRef.current?.path || null,
      saveTabByPath,
      saveTabAsByPath
    });
  }, [saveTabAsByPath, saveTabByPath]);

  const saveCurrentWithToast = React.useCallback(async () => {
    const result = await saveCurrent();
    if (result?.ok) {
      showSuccess(UI_TEXT.toast.saveSuccess);
    }
    return result;
  }, [saveCurrent, showSuccess]);

  const attemptCloseWindow = React.useCallback(async () => {
    const currentTab = tabRef.current;
    if (!currentTab) {
      window.desktopApi.confirmWindowClose();
      return;
    }

    await closeWindowWithPrompt({
      getDirtyTabs: () => {
        const target = tabRef.current;
        if (!target) {
          return [];
        }

        const isDirty = target.kind === "markdown"
          ? computeMarkdownTabDirty(target, savedTextMapRef.current, markdownDraftMapRef.current, null, normalizeText)
          : normalizeText(tabTextMapRef.current[target.path] ?? target.content) !== normalizeText(savedTextMapRef.current[target.path] ?? target.content);

        return isDirty ? [target] : [];
      },
      confirmCloseWindow: (payload: any) => window.desktopApi.confirmCloseWindow(payload),
      saveTabByPath,
      saveTabAsByPath,
      confirmWindowClose: () => window.desktopApi.confirmWindowClose()
    });
  }, [saveTabAsByPath, saveTabByPath]);

  React.useEffect(() => {
    return window.desktopApi.onRequestWindowClose(() => {
      void attemptCloseWindow();
    });
  }, [attemptCloseWindow]);

  const activeMarkdownDraft = tab ? markdownDraftMap[tab.path] : null;
  const activeMarkdownSourceMode = Boolean(tab?.kind === "markdown" && markdownSourceMode);
  const activeTabText = tab
    ? tab.kind === "markdown"
      ? normalizeText(activeMarkdownDraft?.text ?? savedTextMap[tab.path] ?? tab.content)
      : tab.kind === "image" || tab.kind === "audio" || tab.kind === "video" || tab.kind === "pdf" || tab.kind === "webpage" || tab.kind === "notebook"
        ? ""
        : normalizeText(tabTextMap[tab.path] ?? tab.content)
    : "";
  const activeSavedText = tab ? normalizeText(savedTextMap[tab.path] ?? tab.content) : "";
  const activeIsDirty = Boolean(tab) && (
    tab.kind === "markdown"
      ? computeMarkdownTabDirty(tab, savedTextMap, markdownDraftMap, null, normalizeText)
      : tab.kind === "image" || tab.kind === "audio" || tab.kind === "video" || tab.kind === "pdf" || tab.kind === "webpage" || tab.kind === "notebook"
        ? false
      : activeTabText !== activeSavedText
  );
  const activeCharCount = activeTabText.length;
  const activeLineCount = activeTabText ? activeTabText.replace(/\r\n/g, "\n").split("\n").length : 0;
  const activePreviewStatus = tab ? previewStatusMap[tab.path] || null : null;
  const activeLanguageLabel = tab ? getLanguageLabel(tab.path || targetPath, tab.kind) : "";
  const activeTabKindLabel = tab?.kind === "markdown"
    ? "Markdown"
    : tab?.kind === "image"
      ? "Image"
      : tab?.kind === "audio"
        ? "Audio"
        : tab?.kind === "video"
          ? "Video"
        : tab?.kind === "pdf"
          ? "PDF"
          : tab?.kind === "webpage"
            ? "Web"
            : tab?.kind === "notebook"
              ? "Notebook"
              : tab
                ? "Text"
                : "Ready";
  const isPreviewTab = Boolean(tab && (tab.kind === "image" || tab.kind === "audio" || tab.kind === "video" || tab.kind === "pdf" || tab.kind === "webpage" || tab.kind === "notebook"));
  const canToggleOutline = tab?.kind === "markdown" || tab?.kind === "notebook";
  const showOutlinePane = Boolean(outlineOpen && canToggleOutline);
  const activePreviewDetailItems = React.useMemo(() => {
    if (!tab || !activePreviewStatus) {
      return [];
    }

    if (tab.kind === "image") {
      const items = [];
      if (activePreviewStatus.width && activePreviewStatus.height) {
        items.push(`${activePreviewStatus.width} x ${activePreviewStatus.height}`);
      }
      if (activePreviewStatus.zoomPercent) {
        items.push(`Zoom ${activePreviewStatus.zoomPercent}%`);
      }
      if (activePreviewStatus.fileSizeBytes > 0) {
        items.push(formatFileSize(activePreviewStatus.fileSizeBytes));
      }
      return items;
    }

    if (tab.kind === "audio" || tab.kind === "video") {
      const items = [activePreviewStatus.playing ? "Playing" : "Paused"];
      if (activePreviewStatus.duration > 0) {
        items.push(`${formatPreviewDuration(activePreviewStatus.currentTime)} / ${formatPreviewDuration(activePreviewStatus.duration)}`);
      }
      if (activePreviewStatus.fileSizeBytes > 0) {
        items.push(formatFileSize(activePreviewStatus.fileSizeBytes));
      }
      return items;
    }

    return [];
  }, [activePreviewStatus, tab]);

  const handleTextChange = React.useCallback((filePath: string, nextText: any) => {
    const currentTab = tabRef.current;
    if (!currentTab || currentTab.path !== filePath || currentTab.kind === "binary") {
      return;
    }

    if (currentTab.kind === "markdown") {
      if (typeof nextText === "string" || markdownSourceMode) {
        const content = normalizeText(nextText);
        const savedContent = normalizeText(savedTextMapRef.current[filePath] ?? currentTab.content);
        setMarkdownDraftMap((previous) => {
          const isDirty = content !== savedContent;
          if (!isDirty) {
            if (!(filePath in previous)) {
              return previous;
            }

            const next = { ...previous };
            delete next[filePath];
            return next;
          }

          return {
            ...previous,
            [filePath]: {
              html: null,
              text: content,
              isDirty: true,
              sourceMode: true
            }
          };
        });
        return;
      }

      setMarkdownDraftMap((previous) => {
        const current = previous[filePath];
        if (current?.html === nextText?.html && current?.text === nextText?.text && current?.isDirty === Boolean(nextText?.isDirty) && current?.sourceMode === false) {
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
          return next;
        }

        return {
          ...previous,
          [filePath]: nextDraft
        };
      });
      return;
    }

    const content = normalizeText(nextText);
    setTabTextMap((previous) => ({ ...previous, [filePath]: content }));
    setTab((previous: any) => (previous && previous.path === filePath ? { ...previous, content } : previous));
  }, [markdownSourceMode]);

  const copyActiveContent = React.useCallback(async () => {
    if (!activeTabText) {
      return;
    }

    try {
      await navigator.clipboard.writeText(activeTabText);
      showSuccess(UI_TEXT.toast.copySuccess);
    } catch {
      showError(UI_TEXT.toast.copyError);
    }
  }, [activeTabText, showError, showSuccess]);

  const runMarkdownCommand = React.useCallback((runner: (api: TiptapCommandApi) => void | Promise<void>) => {
    if (commandApiRef.current) {
      return runner(commandApiRef.current);
    }
  }, []);

  const handleOutlineChange = React.useCallback((_tabPath: string, items: TiptapOutlineItem[]) => {
    setOutlineItems(items);
  }, []);

  const handleOutlineApiReady = React.useCallback((_tabPath: string, api: TiptapOutlineApi | null) => {
    outlineApiRef.current = api;
  }, []);

  const handleCommandApiReady = React.useCallback((_tabPath: string, api: TiptapCommandApi | null) => {
    commandApiRef.current = api;
  }, []);

  const handlePreviewStatusChange = React.useCallback((tabPath: string, status: any) => {
    setPreviewStatusMap((previous) => {
      if (!status) {
        if (!(tabPath in previous)) {
          return previous;
        }
        const next = { ...previous };
        delete next[tabPath];
        return next;
      }
      return { ...previous, [tabPath]: status };
    });
  }, []);

  const toggleMarkdownSourceMode = React.useCallback(() => {
    const currentTab = tabRef.current;
    if (!currentTab || currentTab.kind !== "markdown") {
      return;
    }

    setMarkdownSourceMode((previous) => {
      const nextActive = !previous;
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
            return next;
          }

          return {
            ...draftPrevious,
            [currentTab.path]: {
              ...currentDraft,
              text: sourceText,
              html: null,
              sourceMode: false
            }
          };
        }

        return {
          ...draftPrevious,
          [currentTab.path]: {
            html: null,
            text: sourceText,
            isDirty: Boolean(currentDraft?.isDirty),
            sourceMode: true
          }
        };
      });

      return nextActive;
    });
  }, []);

  if (loadError) {
    return (
      <div id="app-shell" className="app-shell--document">
        <header className="titlebar">
          <div className="titlebar__left">
            <div className="titlebar__brand titlebar__brand--compact">
              <span className="titlebar__dot" />
              <span className="titlebar__title">DeskPilot</span>
            </div>
          </div>
          <div className="titlebar__actions">
            <button type="button" className="window-btn" onClick={() => window.desktopApi.minimizeWindow()}>-</button>
            <button type="button" className="window-btn" onClick={() => window.desktopApi.toggleMaximizeWindow()}>
              {isMaximized ? UI_TEXT.window.restore : UI_TEXT.window.maximize}
            </button>
            <button type="button" className="window-btn window-btn--danger" onClick={() => window.desktopApi.closeWindow()}>
              {UI_TEXT.window.close}
            </button>
          </div>
        </header>
        <main className="document-content viewer viewer--empty">
          <div className="viewer__empty">
            <h2>Unable to open document window</h2>
            <p>{loadError}</p>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div
      id="app-shell"
      className="app-shell--document"
      style={{
        "--sidebar-width": "0px"
      } as CSSProperties}
    >
      <header className="titlebar">
        <div className="titlebar__left">
          <div className="titlebar__brand titlebar__brand--compact">
            <span className="titlebar__dot" />
            <span className="titlebar__title">DeskPilot</span>
          </div>
          <FileMenu
            showFileMenu={false}
            showViewMenu={true}
            showHelpMenu={true}
            recentItems={[]}
            onNewTab={() => {}}
            onNewWindow={() => {}}
            onOpenFile={() => {}}
            onOpenFolder={() => {}}
            onOpenRecent={() => {}}
            onSave={() => void saveCurrentWithToast()}
            onSaveAs={() => void saveTabAsByPath(tabRef.current?.path || "")}
            onQuit={() => void attemptCloseWindow()}
            markdownEnabled={tab?.kind === "markdown" && !activeMarkdownSourceMode}
            formatActions={tab?.kind === "markdown" ? {
              onBold: () => runMarkdownCommand((api) => api.toggleBold()),
              onItalic: () => runMarkdownCommand((api) => api.toggleItalic()),
              onUnderline: () => runMarkdownCommand((api) => api.toggleUnderline()),
              onStrike: () => runMarkdownCommand((api) => api.toggleStrike()),
              onInlineCode: () => runMarkdownCommand((api) => api.toggleInlineCode()),
              onBulletList: () => runMarkdownCommand((api) => api.toggleBulletList()),
              onOrderedList: () => runMarkdownCommand((api) => api.toggleOrderedList()),
              onTaskList: () => runMarkdownCommand((api) => api.toggleTaskList()),
              onBlockquote: () => runMarkdownCommand((api) => api.toggleBlockquote()),
              onCodeBlock: () => runMarkdownCommand((api) => api.toggleCodeBlock()),
              onClearFormatting: () => runMarkdownCommand((api) => api.clearFormatting())
            } : undefined}
            markdownActions={tab?.kind === "markdown" ? {
              onHeading: (level) => runMarkdownCommand((api) => api.toggleHeading(level)),
              onHorizontalRule: () => runMarkdownCommand((api) => api.insertHorizontalRule()),
              onInlineMath: () => runMarkdownCommand((api) => api.insertInlineMath()),
              onBlockMath: () => runMarkdownCommand((api) => api.insertBlockMath()),
              onImage: () => runMarkdownCommand((api) => api.insertImageFromFile())
            } : undefined}
            helpActions={{
              onOpenGettingStarted: () => window.desktopApi.openExternalUrl(GETTING_STARTED_URL),
              onOpenMarkdownHandbook: () => window.desktopApi.openExternalUrl(MARKDOWN_HANDBOOK_URL),
              onOpenLicense: () => window.desktopApi.openExternalUrl(LICENSE_URL),
              version: appVersion ? `v${appVersion}` : "",
              contactEmail: "doveyh@foxmail.com",
              homepageUrl: REPOSITORY_URL
            }}
            viewActions={{
              sourceModeEnabled: tab?.kind === "markdown",
              sourceModeActive: activeMarkdownSourceMode,
              onToggleSourceMode: toggleMarkdownSourceMode,
              showSidebarItem: false,
              showSidebarEnabled: false,
              showSidebarActive: false,
              showOutlineEnabled: canToggleOutline,
              showOutlineActive: showOutlinePane,
              onToggleOutline: () => setOutlineOpen((previous) => !previous),
              showOpenInNewWindowItem: false,
              openInNewWindowEnabled: false,
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

        <div className="titlebar__center titlebar__center--document">
          <span className="titlebar__doc-path" title={tab?.path || targetPath}>{tab?.name || getBaseName(tab?.path || targetPath) || targetPath}</span>
        </div>

        <div className="titlebar__actions">
          <button type="button" className="window-btn" onClick={() => window.desktopApi.minimizeWindow()}>-</button>
          <button
            type="button"
            className="window-btn"
            onClick={() => {
              window.desktopApi.toggleMaximizeWindow();
              window.setTimeout(async () => {
                setIsMaximized(await window.desktopApi.isWindowMaximized());
              }, 50);
            }}
          >
            {isMaximized ? UI_TEXT.window.restore : UI_TEXT.window.maximize}
          </button>
          <button type="button" className="window-btn window-btn--danger" onClick={() => window.desktopApi.closeWindow()}>
            {UI_TEXT.window.close}
          </button>
        </div>
      </header>

      <main className="document-content">
        <section className={`viewer ${tab ? "" : "viewer--empty"}`}>
          <div className={`viewer__layout ${showOutlinePane ? "viewer__layout--with-outline" : ""}`}>
            <EditorHost
              tabs={editorTabs}
              activeTabPath={tab?.path || null}
              markdownDraftMap={markdownDraftMap}
              markdownSourceModeMap={tab?.path ? { [tab.path]: markdownSourceMode } : {}}
              textContentMap={tabTextMap}
              onTextChange={handleTextChange}
              onSaveShortcut={() => void saveCurrentWithToast()}
              onOutlineChange={handleOutlineChange}
              onOutlineApiReady={handleOutlineApiReady}
              onCommandApiReady={handleCommandApiReady}
              onPreviewStatusChange={handlePreviewStatusChange}
            />
            {showOutlinePane ? (
              <aside className="outline-pane" aria-label={UI_TEXT.statusbar.outline}>
                <div className="outline-pane__header">{UI_TEXT.statusbar.outline}</div>
                {outlineItems.length ? (
                  <div className="outline-pane__list">
                    {outlineItems.map((item) => (
                      <button
                        type="button"
                        key={item.id}
                        className={`outline-pane__item outline-pane__item--level-${Math.min(item.level, 6)}`}
                        onClick={() => outlineApiRef.current?.scrollToItem(item.id)}
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
        </section>
      </main>

      <footer className="statusbar statusbar--document">
        <div className="statusbar__left">
          {isPreviewTab ? (
            <>
              <span className="statusbar__item">{activeTabKindLabel}</span>
              <span className="statusbar__item">Preview</span>
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
          <span className="statusbar__item statusbar__item--path" title={tab?.path || targetPath}>{tab?.path || targetPath}</span>
        </div>
        <div className="statusbar__right">
          {!isPreviewTab ? (
            tab?.kind === "markdown" ? (
              <>
                {activeMarkdownSourceMode ? (
                  <span className="statusbar__item">源码模式</span>
                ) : null}
                <button type="button" className="statusbar__item" onClick={() => void copyActiveContent()}>{UI_TEXT.statusbar.copy}</button>
              </>
            ) : (
              <>
                <button type="button" className="statusbar__item" onClick={() => void saveCurrentWithToast()}>{UI_TEXT.statusbar.save}</button>
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
          {tab ? (
            <>
              {!isPreviewTab && activeLanguageLabel ? (
                <span className="statusbar__item">{activeLanguageLabel}</span>
              ) : null}
              {!isPreviewTab ? (
                <span className="statusbar__item">UTF-8</span>
              ) : null}
            </>
          ) : null}
        </div>
      </footer>

      <Toast toast={toast} />
    </div>
  );
}
