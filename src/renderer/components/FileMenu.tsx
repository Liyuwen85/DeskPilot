import React from "react";

interface RecentItemLike {
  kind: string;
  path: string;
  label: string;
}

interface MarkdownMenuActions {
  onHeading: (level: number) => void;
  onHorizontalRule: () => void;
  onImage: () => void | Promise<void>;
}

interface FileMenuProps {
  recentItems: RecentItemLike[];
  onNewTab: () => void | Promise<void>;
  onNewWindow: () => void | Promise<void>;
  onOpenFile: () => void | Promise<void>;
  onOpenFolder: () => void | Promise<void>;
  onOpenRecent: (item: RecentItemLike) => void | Promise<void>;
  onSave: () => void | Promise<void>;
  onSaveAs: () => void | Promise<void>;
  onQuit: () => void | Promise<void>;
  markdownEnabled?: boolean;
  markdownActions?: MarkdownMenuActions;
}

export function FileMenu({
  recentItems,
  onNewTab,
  onNewWindow,
  onOpenFile,
  onOpenFolder,
  onOpenRecent,
  onSave,
  onSaveAs,
  onQuit,
  markdownEnabled = false,
  markdownActions
}: FileMenuProps) {
  const [openMenu, setOpenMenu] = React.useState<string | null>(null);
  const [recentOpen, setRecentOpen] = React.useState(false);
  const menuRef = React.useRef<HTMLDivElement | null>(null);

  React.useEffect(() => {
    function handlePointerDown(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setOpenMenu(null);
        setRecentOpen(false);
      }
    }

    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, []);

  const closeAll = React.useCallback(() => {
    setOpenMenu(null);
    setRecentOpen(false);
  }, []);

  const handleAction = React.useCallback(async (action: () => void | Promise<void>) => {
    closeAll();
    await action();
  }, [closeAll]);

  return (
    <nav className="titlebar__menu" aria-label="App menu" ref={menuRef}>
      <div className="menu-dropdown">
        <button
          type="button"
          className={`menu-btn ${openMenu === "file" ? "menu-btn--active" : ""}`}
          onClick={() => {
            setOpenMenu((current) => current === "file" ? null : "file");
            setRecentOpen(false);
          }}
        >
          文件
        </button>
        {openMenu === "file" ? (
          <div className="menu-dropdown__panel">
            <button type="button" className="menu-dropdown__item" onClick={() => void handleAction(onNewTab)}>
              <span className="menu-dropdown__label">新建 Markdown</span>
              <span className="menu-dropdown__hint">Ctrl+T</span>
            </button>
            <button type="button" className="menu-dropdown__item" onClick={() => void handleAction(onNewWindow)}>
              <span className="menu-dropdown__label">新建窗口</span>
              <span className="menu-dropdown__hint">Ctrl+Shift+N</span>
            </button>
            <div className="menu-dropdown__separator" />
            <button type="button" className="menu-dropdown__item" onClick={() => void handleAction(onOpenFile)}>
              <span className="menu-dropdown__label">打开文件</span>
              <span className="menu-dropdown__hint">Ctrl+O</span>
            </button>
            <button type="button" className="menu-dropdown__item" onClick={() => void handleAction(onOpenFolder)}>
              <span className="menu-dropdown__label">打开文件夹</span>
              <span className="menu-dropdown__hint">Ctrl+K Ctrl+O</span>
            </button>
            <div
              className="menu-dropdown__item menu-dropdown__item--submenu"
              onMouseEnter={() => setRecentOpen(true)}
              onMouseLeave={() => setRecentOpen(false)}
            >
              <span className="menu-dropdown__label">打开最近</span>
              <span className="menu-dropdown__hint">›</span>
              {recentOpen ? (
                <div className="menu-dropdown__submenu">
                  {recentItems.length > 0 ? (
                    recentItems.map((item) => (
                      <button
                        key={`${item.kind}:${item.path}`}
                        type="button"
                        className="menu-dropdown__item menu-dropdown__item--recent"
                        onClick={() => void handleAction(() => onOpenRecent(item))}
                      >
                        <span className="menu-dropdown__label">{item.label}</span>
                      </button>
                    ))
                  ) : (
                    <div className="menu-dropdown__empty">暂无最近记录</div>
                  )}
                </div>
              ) : null}
            </div>
            <div className="menu-dropdown__separator" />
            <button type="button" className="menu-dropdown__item" onClick={() => void handleAction(onSave)}>
              <span className="menu-dropdown__label">保存</span>
              <span className="menu-dropdown__hint">Ctrl+S</span>
            </button>
            <button type="button" className="menu-dropdown__item" onClick={() => void handleAction(onSaveAs)}>
              <span className="menu-dropdown__label">另存为</span>
              <span className="menu-dropdown__hint">Ctrl+Shift+S</span>
            </button>
            <div className="menu-dropdown__separator" />
            <button type="button" className="menu-dropdown__item" onClick={() => void handleAction(onQuit)}>
              <span className="menu-dropdown__label">退出</span>
              <span className="menu-dropdown__hint">Alt+F4</span>
            </button>
          </div>
        ) : null}
      </div>

      <div className="menu-dropdown">
        <button
          type="button"
          disabled={!markdownEnabled}
          className={`menu-btn ${openMenu === "markdown" ? "menu-btn--active" : ""}`}
          onClick={() => {
            if (!markdownEnabled) {
              return;
            }

            setOpenMenu((current) => current === "markdown" ? null : "markdown");
            setRecentOpen(false);
          }}
        >
          Markdown
        </button>
        {openMenu === "markdown" && markdownEnabled && markdownActions ? (
          <div className="menu-dropdown__panel">
            {[1, 2, 3, 4, 5].map((level) => (
              <button
                key={level}
                type="button"
                className="menu-dropdown__item"
                onClick={() => void handleAction(() => markdownActions.onHeading(level))}
              >
                <span className="menu-dropdown__label">{`H${level}`}</span>
              </button>
            ))}
            <div className="menu-dropdown__separator" />
            <button type="button" className="menu-dropdown__item" onClick={() => void handleAction(markdownActions.onHorizontalRule)}>
              <span className="menu-dropdown__label">分割线</span>
            </button>
            <button type="button" className="menu-dropdown__item" onClick={() => void handleAction(markdownActions.onImage)}>
              <span className="menu-dropdown__label">图片</span>
            </button>
          </div>
        ) : null}
      </div>
    </nav>
  );
}
