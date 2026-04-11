import React from "react";
import deskpilotLogoUrl from "../../../screenshot/deskpilot_logo.png";

interface RecentItemLike {
  kind: string;
  path: string;
  label: string;
}

interface MarkdownMenuActions {
  onHeading: (level: number) => void;
  onHorizontalRule: () => void;
  onInlineMath: () => void;
  onBlockMath: () => void;
  onImage: () => void | Promise<void>;
}

interface FormatMenuActions {
  onBold: () => void;
  onItalic: () => void;
  onUnderline: () => void;
  onStrike: () => void;
  onInlineCode: () => void;
  onBulletList: () => void;
  onOrderedList: () => void;
  onTaskList: () => void;
  onBlockquote: () => void;
  onCodeBlock: () => void;
  onClearFormatting: () => void;
}

interface ViewMenuActions {
  sourceModeEnabled?: boolean;
  sourceModeActive?: boolean;
  onToggleSourceMode?: () => void | Promise<void>;
  showSidebarItem?: boolean;
  showSidebarEnabled?: boolean;
  showSidebarActive?: boolean;
  onToggleSidebar?: () => void | Promise<void>;
  showOutlineEnabled?: boolean;
  showOutlineActive?: boolean;
  onToggleOutline?: () => void | Promise<void>;
  showOpenInNewWindowItem?: boolean;
  openInNewWindowEnabled?: boolean;
  onOpenInNewWindow?: () => void | Promise<void>;
  onMinimizeWindow?: () => void | Promise<void>;
  alwaysOnTopEnabled?: boolean;
  alwaysOnTopActive?: boolean;
  onToggleAlwaysOnTop?: () => void | Promise<void>;
  onZoomInWindow?: () => void | Promise<void>;
  onZoomOutWindow?: () => void | Promise<void>;
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
  formatActions?: FormatMenuActions;
  viewActions?: ViewMenuActions;
  helpActions?: {
    onOpenGettingStarted?: () => void | Promise<void>;
    onOpenMarkdownHandbook?: () => void | Promise<void>;
    onOpenLicense?: () => void | Promise<void>;
    version: string;
    contactEmail: string;
    homepageUrl: string;
  };
  showFileMenu?: boolean;
  showViewMenu?: boolean;
  showHelpMenu?: boolean;
}

type MenuKey = "file" | "markdown" | "format" | "view" | "help";

function MenuCheck({ active }: { active?: boolean }) {
  return <span className={`menu-check ${active ? "menu-check--active" : ""}`}>{"\u2713"}</span>;
}

function MenuCheckSpacer() {
  return <span className="menu-check menu-check--placeholder" aria-hidden="true">{"\u2713"}</span>;
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
  markdownActions,
  formatActions,
  viewActions,
  helpActions,
  showFileMenu = true,
  showViewMenu = true,
  showHelpMenu = true
}: FileMenuProps) {
  const [openMenu, setOpenMenu] = React.useState<MenuKey | null>(null);
  const [recentOpen, setRecentOpen] = React.useState(false);
  const [aboutOpen, setAboutOpen] = React.useState(false);
  const menuRef = React.useRef<HTMLDivElement | null>(null);

  const topLevelMenus = React.useMemo(
    () => [
      { key: "file" as const, enabled: showFileMenu },
      { key: "markdown" as const, enabled: markdownEnabled },
      { key: "format" as const, enabled: markdownEnabled },
      { key: "view" as const, enabled: showViewMenu },
      { key: "help" as const, enabled: showHelpMenu }
    ],
    [markdownEnabled, showFileMenu, showViewMenu, showHelpMenu]
  );

  const closeAll = React.useCallback(() => {
    setOpenMenu(null);
    setRecentOpen(false);
  }, []);

  const preventFocusSteal = React.useCallback((event: React.MouseEvent<HTMLElement>) => {
    event.preventDefault();
  }, []);

  const handleAction = React.useCallback(
    async (action?: () => void | Promise<void>) => {
      closeAll();
      if (action) {
        await action();
      }
    },
    [closeAll]
  );

  const showSidebarItem = viewActions?.showSidebarItem !== false;
  const showOpenInNewWindowItem = viewActions?.showOpenInNewWindowItem !== false;
  const hasVisibilityGroup = true;

  const getVisibleMenuItems = React.useCallback(
    (menuKey: MenuKey | null, includeSubmenu = recentOpen) => {
      if (!menuKey || !menuRef.current) {
        return [] as HTMLElement[];
      }

      const dropdown = menuRef.current.querySelector<HTMLElement>(`[data-menu="${menuKey}"]`);
      if (!dropdown) {
        return [] as HTMLElement[];
      }

      if (menuKey === "file" && includeSubmenu) {
        const submenu = dropdown.querySelector<HTMLElement>(".menu-dropdown__submenu");
        if (submenu) {
          return Array.from(submenu.querySelectorAll<HTMLElement>('[data-menu-nav-item="true"]')).filter(
            (item) => !item.hasAttribute("disabled")
          );
        }
      }

      const panel = dropdown.querySelector<HTMLElement>(".menu-dropdown__panel");
      if (!panel) {
        return [] as HTMLElement[];
      }

      return Array.from(panel.children)
        .filter((item): item is HTMLElement => item instanceof HTMLElement)
        .filter((item) => item.dataset.menuNavItem === "true" && !item.hasAttribute("disabled"));
    },
    [recentOpen]
  );

  const focusMenuTarget = React.useCallback(
    (
      menuKey: MenuKey,
      options: { includeSubmenu?: boolean; position?: "first" | "last"; submenuTrigger?: boolean } = {}
    ) => {
      window.requestAnimationFrame(() => {
        if (!menuRef.current) {
          return;
        }

        const dropdown = menuRef.current.querySelector<HTMLElement>(`[data-menu="${menuKey}"]`);
        if (!dropdown) {
          return;
        }

        if (options.submenuTrigger) {
          dropdown.querySelector<HTMLElement>('[data-submenu-trigger="recent"]')?.focus();
          return;
        }

        const items = getVisibleMenuItems(menuKey, options.includeSubmenu);
        if (items.length === 0) {
          return;
        }

        const targetIndex = options.position === "last" ? items.length - 1 : 0;
        items[targetIndex]?.focus();
      });
    },
    [getVisibleMenuItems]
  );

  const openMenuWithKeyboard = React.useCallback(
    (menuKey: MenuKey) => {
      setOpenMenu(menuKey);
      setRecentOpen(false);
      focusMenuTarget(menuKey, { position: "first" });
    },
    [focusMenuTarget]
  );

  React.useEffect(() => {
    function handlePointerDown(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        closeAll();
      }
    }

    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, [closeAll]);

  React.useEffect(() => {
    if (!openMenu && !recentOpen) {
      return;
    }

    function handleEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        closeAll();
      }
    }

    window.addEventListener("keydown", handleEscape);
    return () => window.removeEventListener("keydown", handleEscape);
  }, [closeAll, openMenu, recentOpen]);

  React.useEffect(() => {
    if (!openMenu) {
      return;
    }

    function handleMenuKeyDown(event: KeyboardEvent) {
      const activeElement = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      const visibleItems = getVisibleMenuItems(openMenu);
      const currentIndex = activeElement ? visibleItems.indexOf(activeElement) : -1;

      if (event.key === "ArrowDown") {
        if (visibleItems.length === 0) {
          return;
        }

        event.preventDefault();
        const nextIndex = currentIndex >= 0 ? (currentIndex + 1) % visibleItems.length : 0;
        visibleItems[nextIndex]?.focus();
        return;
      }

      if (event.key === "ArrowUp") {
        if (visibleItems.length === 0) {
          return;
        }

        event.preventDefault();
        const nextIndex = currentIndex >= 0
          ? (currentIndex - 1 + visibleItems.length) % visibleItems.length
          : visibleItems.length - 1;
        visibleItems[nextIndex]?.focus();
        return;
      }

      if (event.key === "ArrowRight") {
        if (openMenu === "file" && activeElement?.dataset.submenuTrigger === "recent") {
          event.preventDefault();
          setRecentOpen(true);
          focusMenuTarget("file", { includeSubmenu: true, position: "first" });
          return;
        }

        const currentMenuIndex = topLevelMenus.findIndex((menu) => menu.key === openMenu);
        const nextMenu =
          topLevelMenus.slice(currentMenuIndex + 1).find((menu) => menu.enabled) ||
          topLevelMenus.find((menu) => menu.enabled);

        if (nextMenu && nextMenu.key !== openMenu) {
          event.preventDefault();
          setOpenMenu(nextMenu.key);
          setRecentOpen(false);
          focusMenuTarget(nextMenu.key, { position: "first" });
        }
        return;
      }

      if (event.key === "ArrowLeft") {
        if (openMenu === "file" && recentOpen) {
          event.preventDefault();
          setRecentOpen(false);
          focusMenuTarget("file", { submenuTrigger: true });
          return;
        }

        const enabledMenus = topLevelMenus.filter((menu) => menu.enabled);
        const currentMenuIndex = enabledMenus.findIndex((menu) => menu.key === openMenu);
        const previousMenu =
          currentMenuIndex > 0 ? enabledMenus[currentMenuIndex - 1] : enabledMenus[enabledMenus.length - 1];

        if (previousMenu && previousMenu.key !== openMenu) {
          event.preventDefault();
          setOpenMenu(previousMenu.key);
          setRecentOpen(false);
          focusMenuTarget(previousMenu.key, { position: "first" });
        }
        return;
      }

      if (event.key === "Enter" || event.key === " ") {
        if (!activeElement) {
          return;
        }

        if (activeElement.dataset.submenuTrigger === "recent") {
          event.preventDefault();
          setRecentOpen((current) => {
            const next = !current;
            if (next) {
              focusMenuTarget("file", { includeSubmenu: true, position: "first" });
            }
            return next;
          });
          return;
        }

        if (activeElement.dataset.menuNavItem === "true") {
          event.preventDefault();
          activeElement.click();
        }
      }
    }

    window.addEventListener("keydown", handleMenuKeyDown);
    return () => window.removeEventListener("keydown", handleMenuKeyDown);
  }, [focusMenuTarget, getVisibleMenuItems, openMenu, recentOpen, topLevelMenus]);

  return (
    <>
      <nav className="titlebar__menu" aria-label="App menu" ref={menuRef}>
        {showFileMenu ? (
        <div className="menu-dropdown" data-menu="file">
          <button
            type="button"
            className={`menu-btn ${openMenu === "file" ? "menu-btn--active" : ""}`}
            onMouseDown={preventFocusSteal}
            onKeyDown={(event) => {
              if (event.key === "ArrowDown" || event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                openMenuWithKeyboard("file");
              }
            }}
            onClick={() => {
              setOpenMenu((current) => (current === "file" ? null : "file"));
              setRecentOpen(false);
            }}
          >
            {"\u6587\u4ef6"}
          </button>
          {openMenu === "file" ? (
            <div className="menu-dropdown__panel">
              <button type="button" className="menu-dropdown__item" data-menu-nav-item="true" onMouseDown={preventFocusSteal} onClick={() => void handleAction(onNewTab)}>
                <span className="menu-dropdown__label">{"\u65b0\u5efa Markdown"}</span>
                <span className="menu-dropdown__hint">Ctrl+T</span>
              </button>
              <button type="button" className="menu-dropdown__item" data-menu-nav-item="true" onMouseDown={preventFocusSteal} onClick={() => void handleAction(onNewWindow)}>
                <span className="menu-dropdown__label">{"\u65b0\u5efa\u7a97\u53e3"}</span>
                <span className="menu-dropdown__hint">Ctrl+Shift+N</span>
              </button>
              <div className="menu-dropdown__separator" />
              <button type="button" className="menu-dropdown__item" data-menu-nav-item="true" onMouseDown={preventFocusSteal} onClick={() => void handleAction(onOpenFile)}>
                <span className="menu-dropdown__label">{"\u6253\u5f00\u6587\u4ef6"}</span>
                <span className="menu-dropdown__hint">Ctrl+O</span>
              </button>
              <button type="button" className="menu-dropdown__item" data-menu-nav-item="true" onMouseDown={preventFocusSteal} onClick={() => void handleAction(onOpenFolder)}>
                <span className="menu-dropdown__label">{"\u6253\u5f00\u6587\u4ef6\u5939"}</span>
                <span className="menu-dropdown__hint">Ctrl+K Ctrl+O</span>
              </button>
              <div
                className="menu-dropdown__item menu-dropdown__item--submenu"
                role="button"
                tabIndex={-1}
                data-menu-nav-item="true"
                data-submenu-trigger="recent"
                onMouseDown={preventFocusSteal}
                onMouseEnter={() => setRecentOpen(true)}
                onMouseLeave={() => setRecentOpen(false)}
              >
                <span className="menu-dropdown__label">{"\u6253\u5f00\u6700\u8fd1"}</span>
                <span className="menu-dropdown__hint">{"\u2026"}</span>
                {recentOpen ? (
                  <div className="menu-dropdown__submenu">
                    {recentItems.length > 0 ? (
                      recentItems.map((item) => (
                        <button
                          key={`${item.kind}:${item.path}`}
                          type="button"
                          className="menu-dropdown__item menu-dropdown__item--recent"
                          data-menu-nav-item="true"
                          onMouseDown={preventFocusSteal}
                          onClick={() => void handleAction(() => onOpenRecent(item))}
                        >
                          <span className="menu-dropdown__recent-main">
                            <span className="menu-dropdown__label">{item.label}</span>
                            <span className="menu-dropdown__recent-path">{item.path}</span>
                          </span>
                          <span className="menu-dropdown__recent-badge">
                            {item.kind === "directory" ? "Folder" : "File"}
                          </span>
                        </button>
                      ))
                    ) : (
                      <div className="menu-dropdown__empty">{"\u6682\u65e0\u6700\u8fd1\u8bb0\u5f55"}</div>
                    )}
                  </div>
                ) : null}
              </div>
              <div className="menu-dropdown__separator" />
              <button type="button" className="menu-dropdown__item" data-menu-nav-item="true" onMouseDown={preventFocusSteal} onClick={() => void handleAction(onSave)}>
                <span className="menu-dropdown__label">{"\u4fdd\u5b58"}</span>
                <span className="menu-dropdown__hint">Ctrl+S</span>
              </button>
              <button type="button" className="menu-dropdown__item" data-menu-nav-item="true" onMouseDown={preventFocusSteal} onClick={() => void handleAction(onSaveAs)}>
                <span className="menu-dropdown__label">{"\u53e6\u5b58\u4e3a"}</span>
                <span className="menu-dropdown__hint">Ctrl+Shift+S</span>
              </button>
              <div className="menu-dropdown__separator" />
              <button type="button" className="menu-dropdown__item" data-menu-nav-item="true" onMouseDown={preventFocusSteal} onClick={() => void handleAction(onQuit)}>
                <span className="menu-dropdown__label">{"\u9000\u51fa"}</span>
                <span className="menu-dropdown__hint">Alt+F4</span>
              </button>
            </div>
          ) : null}
        </div>
      ) : null}

      <div className="menu-dropdown" data-menu="markdown">
        <button
          type="button"
          disabled={!markdownEnabled}
          className={`menu-btn ${openMenu === "markdown" ? "menu-btn--active" : ""}`}
          onMouseDown={preventFocusSteal}
          onKeyDown={(event) => {
            if (!markdownEnabled) {
              return;
            }

            if (event.key === "ArrowDown" || event.key === "Enter" || event.key === " ") {
              event.preventDefault();
              openMenuWithKeyboard("markdown");
            }
          }}
          onClick={() => {
            if (!markdownEnabled) {
              return;
            }

            setOpenMenu((current) => (current === "markdown" ? null : "markdown"));
            setRecentOpen(false);
          }}
        >
          Markdown
        </button>
        {openMenu === "markdown" && markdownEnabled && markdownActions ? (
          <div className="menu-dropdown__panel">
            <div className="menu-dropdown__empty">{"\u6807\u9898"}</div>
            {[1, 2, 3, 4, 5].map((level) => (
              <button key={level} type="button" className="menu-dropdown__item" data-menu-nav-item="true" onMouseDown={preventFocusSteal} onClick={() => void handleAction(() => markdownActions.onHeading(level))}>
                <span className="menu-dropdown__label">{`H${level}`}</span>
                <span className="menu-dropdown__hint">{`Ctrl+Alt+${level}`}</span>
              </button>
            ))}
            <div className="menu-dropdown__separator" />
            <div className="menu-dropdown__empty">{"\u63d2\u5165"}</div>
            <button type="button" className="menu-dropdown__item" data-menu-nav-item="true" onMouseDown={preventFocusSteal} onClick={() => void handleAction(markdownActions.onHorizontalRule)}>
              <span className="menu-dropdown__label">{"\u5206\u5272\u7ebf"}</span>
              <span className="menu-dropdown__hint">Ctrl+Alt+-</span>
            </button>
            <button type="button" className="menu-dropdown__item" data-menu-nav-item="true" onMouseDown={preventFocusSteal} onClick={() => void handleAction(markdownActions.onImage)}>
              <span className="menu-dropdown__label">{"\u56fe\u7247"}</span>
              <span className="menu-dropdown__hint">Ctrl+Alt+I</span>
            </button>
            <div className="menu-dropdown__separator" />
            <div className="menu-dropdown__empty">{"\u6570\u5b66\u516c\u5f0f"}</div>
            <button type="button" className="menu-dropdown__item" data-menu-nav-item="true" onMouseDown={preventFocusSteal} onClick={() => void handleAction(markdownActions.onInlineMath)}>
              <span className="menu-dropdown__label">{"\u884c\u5185\u516c\u5f0f"}</span>
              <span className="menu-dropdown__hint">Ctrl+Alt+M</span>
            </button>
            <button type="button" className="menu-dropdown__item" data-menu-nav-item="true" onMouseDown={preventFocusSteal} onClick={() => void handleAction(markdownActions.onBlockMath)}>
              <span className="menu-dropdown__label">{"\u5757\u7ea7\u516c\u5f0f"}</span>
              <span className="menu-dropdown__hint">Ctrl+Alt+Shift+M</span>
            </button>
          </div>
        ) : null}
      </div>

      <div className="menu-dropdown" data-menu="format">
        <button
          type="button"
          disabled={!markdownEnabled}
          className={`menu-btn ${openMenu === "format" ? "menu-btn--active" : ""}`}
          onMouseDown={preventFocusSteal}
          onKeyDown={(event) => {
            if (!markdownEnabled) {
              return;
            }

            if (event.key === "ArrowDown" || event.key === "Enter" || event.key === " ") {
              event.preventDefault();
              openMenuWithKeyboard("format");
            }
          }}
          onClick={() => {
            if (!markdownEnabled) {
              return;
            }

            setOpenMenu((current) => (current === "format" ? null : "format"));
            setRecentOpen(false);
          }}
        >
          {"\u683c\u5f0f"}
        </button>
        {openMenu === "format" && markdownEnabled && formatActions ? (
          <div className="menu-dropdown__panel">
            <div className="menu-dropdown__empty">{"\u6587\u672c\u6837\u5f0f"}</div>
            <button type="button" className="menu-dropdown__item" data-menu-nav-item="true" onMouseDown={preventFocusSteal} onClick={() => void handleAction(formatActions.onBold)}>
              <span className="menu-dropdown__label">{"\u52a0\u7c97"}</span>
              <span className="menu-dropdown__hint">Ctrl+B</span>
            </button>
            <button type="button" className="menu-dropdown__item" data-menu-nav-item="true" onMouseDown={preventFocusSteal} onClick={() => void handleAction(formatActions.onItalic)}>
              <span className="menu-dropdown__label">{"\u659c\u4f53"}</span>
              <span className="menu-dropdown__hint">Ctrl+I</span>
            </button>
            <button type="button" className="menu-dropdown__item" data-menu-nav-item="true" onMouseDown={preventFocusSteal} onClick={() => void handleAction(formatActions.onUnderline)}>
              <span className="menu-dropdown__label">{"\u4e0b\u5212\u7ebf"}</span>
              <span className="menu-dropdown__hint">Ctrl+U</span>
            </button>
            <button type="button" className="menu-dropdown__item" data-menu-nav-item="true" onMouseDown={preventFocusSteal} onClick={() => void handleAction(formatActions.onStrike)}>
              <span className="menu-dropdown__label">{"\u5220\u9664\u7ebf"}</span>
              <span className="menu-dropdown__hint">Ctrl+Shift+S</span>
            </button>
            <button type="button" className="menu-dropdown__item" data-menu-nav-item="true" onMouseDown={preventFocusSteal} onClick={() => void handleAction(formatActions.onInlineCode)}>
              <span className="menu-dropdown__label">{"\u884c\u5185\u4ee3\u7801"}</span>
              <span className="menu-dropdown__hint">Ctrl+E</span>
            </button>
            <div className="menu-dropdown__separator" />
            <div className="menu-dropdown__empty">{"\u5217\u8868"}</div>
            <button type="button" className="menu-dropdown__item" data-menu-nav-item="true" onMouseDown={preventFocusSteal} onClick={() => void handleAction(formatActions.onBulletList)}>
              <span className="menu-dropdown__label">{"\u65e0\u5e8f\u5217\u8868"}</span>
              <span className="menu-dropdown__hint">Ctrl+Shift+8</span>
            </button>
            <button type="button" className="menu-dropdown__item" data-menu-nav-item="true" onMouseDown={preventFocusSteal} onClick={() => void handleAction(formatActions.onOrderedList)}>
              <span className="menu-dropdown__label">{"\u6709\u5e8f\u5217\u8868"}</span>
              <span className="menu-dropdown__hint">Ctrl+Shift+7</span>
            </button>
            <button type="button" className="menu-dropdown__item" data-menu-nav-item="true" onMouseDown={preventFocusSteal} onClick={() => void handleAction(formatActions.onTaskList)}>
              <span className="menu-dropdown__label">{"\u4efb\u52a1\u5217\u8868"}</span>
              <span className="menu-dropdown__hint">Ctrl+Shift+9</span>
            </button>
            <div className="menu-dropdown__separator" />
            <div className="menu-dropdown__empty">{"\u5757\u7ea7"}</div>
            <button type="button" className="menu-dropdown__item" data-menu-nav-item="true" onMouseDown={preventFocusSteal} onClick={() => void handleAction(formatActions.onBlockquote)}>
              <span className="menu-dropdown__label">{"\u5f15\u7528"}</span>
              <span className="menu-dropdown__hint">Ctrl+Shift+B</span>
            </button>
            <button type="button" className="menu-dropdown__item" data-menu-nav-item="true" onMouseDown={preventFocusSteal} onClick={() => void handleAction(formatActions.onCodeBlock)}>
              <span className="menu-dropdown__label">{"\u4ee3\u7801\u5757"}</span>
              <span className="menu-dropdown__hint">Ctrl+Alt+C</span>
            </button>
            <div className="menu-dropdown__separator" />
            <div className="menu-dropdown__empty">{"\u6e05\u7406"}</div>
            <button type="button" className="menu-dropdown__item" data-menu-nav-item="true" onMouseDown={preventFocusSteal} onClick={() => void handleAction(formatActions.onClearFormatting)}>
              <span className="menu-dropdown__label">{"\u6e05\u9664\u683c\u5f0f"}</span>
              <span className="menu-dropdown__hint">Ctrl+\\</span>
            </button>
          </div>
        ) : null}
      </div>

      {showViewMenu ? (
      <div className="menu-dropdown" data-menu="view">
        <button
          type="button"
          className={`menu-btn ${openMenu === "view" ? "menu-btn--active" : ""}`}
          onMouseDown={preventFocusSteal}
          onKeyDown={(event) => {
            if (event.key === "ArrowDown" || event.key === "Enter" || event.key === " ") {
              event.preventDefault();
              openMenuWithKeyboard("view");
            }
          }}
          onClick={() => {
            setOpenMenu((current) => (current === "view" ? null : "view"));
            setRecentOpen(false);
          }}
        >
          {"\u89c6\u56fe"}
        </button>
        {openMenu === "view" ? (
          <div className="menu-dropdown__panel">
            <button type="button" className="menu-dropdown__item" data-menu-nav-item="true" disabled={!viewActions?.sourceModeEnabled} onMouseDown={preventFocusSteal} onClick={() => void handleAction(() => viewActions?.onToggleSourceMode?.())}>
              <span className="menu-dropdown__label">
                <MenuCheck active={viewActions?.sourceModeActive} />
                {"\u6e90\u7801\u6a21\u5f0f"}
              </span>
            </button>
            {hasVisibilityGroup ? (
              <>
                <div className="menu-dropdown__separator" />
                {showSidebarItem ? (
                  <button type="button" className="menu-dropdown__item" data-menu-nav-item="true" disabled={!viewActions?.showSidebarEnabled} onMouseDown={preventFocusSteal} onClick={() => void handleAction(() => viewActions?.onToggleSidebar?.())}>
                    <span className="menu-dropdown__label">
                      <MenuCheck active={viewActions?.showSidebarActive} />
                      {"\u663e\u793a\u5bfc\u822a\u680f"}
                    </span>
                  </button>
                ) : null}
                <button type="button" className="menu-dropdown__item" data-menu-nav-item="true" disabled={!viewActions?.showOutlineEnabled} onMouseDown={preventFocusSteal} onClick={() => void handleAction(() => viewActions?.onToggleOutline?.())}>
                  <span className="menu-dropdown__label">
                    <MenuCheck active={viewActions?.showOutlineActive} />
                    {"\u663e\u793a\u5927\u7eb2"}
                  </span>
                </button>
              </>
            ) : null}
            {showOpenInNewWindowItem ? (
              <>
                <div className="menu-dropdown__separator" />
                <button type="button" className="menu-dropdown__item" data-menu-nav-item="true" disabled={!viewActions?.openInNewWindowEnabled} onMouseDown={preventFocusSteal} onClick={() => void handleAction(() => viewActions?.onOpenInNewWindow?.())}>
                  <span className="menu-dropdown__label">
                    <MenuCheckSpacer />
                    {"\u65b0\u7a97\u53e3\u6253\u5f00"}
                  </span>
                </button>
              </>
            ) : null}
            <div className="menu-dropdown__separator" />
            <button type="button" className="menu-dropdown__item" data-menu-nav-item="true" onMouseDown={preventFocusSteal} onClick={() => void handleAction(() => viewActions?.onMinimizeWindow?.())}>
              <span className="menu-dropdown__label">
                <MenuCheckSpacer />
                {"\u6700\u5c0f\u5316"}
              </span>
            </button>
            <button type="button" className="menu-dropdown__item" data-menu-nav-item="true" disabled={!viewActions?.alwaysOnTopEnabled} onMouseDown={preventFocusSteal} onClick={() => void handleAction(() => viewActions?.onToggleAlwaysOnTop?.())}>
              <span className="menu-dropdown__label">
                <MenuCheck active={viewActions?.alwaysOnTopActive} />
                {"\u9876\u90e8\u663e\u793a"}
              </span>
            </button>
            <div className="menu-dropdown__separator" />
            <button type="button" className="menu-dropdown__item" data-menu-nav-item="true" onMouseDown={preventFocusSteal} onClick={() => void handleAction(() => viewActions?.onZoomInWindow?.())}>
              <span className="menu-dropdown__label">
                <MenuCheckSpacer />
                {"\u653e\u5927"}
              </span>
            </button>
            <button type="button" className="menu-dropdown__item" data-menu-nav-item="true" onMouseDown={preventFocusSteal} onClick={() => void handleAction(() => viewActions?.onZoomOutWindow?.())}>
              <span className="menu-dropdown__label">
                <MenuCheckSpacer />
                {"\u7f29\u5c0f"}
              </span>
            </button>
          </div>
        ) : null}
      </div>
      ) : null}
        {showHelpMenu ? (
        <div className="menu-dropdown" data-menu="help">
          <button
            type="button"
            className={`menu-btn ${openMenu === "help" ? "menu-btn--active" : ""}`}
            onMouseDown={preventFocusSteal}
            onKeyDown={(event) => {
              if (event.key === "ArrowDown" || event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                openMenuWithKeyboard("help");
              }
            }}
            onClick={() => {
              setOpenMenu((current) => (current === "help" ? null : "help"));
              setRecentOpen(false);
            }}
          >
            {"\u5e2e\u52a9"}
          </button>
          {openMenu === "help" ? (
            <div className="menu-dropdown__panel">
              <button type="button" className="menu-dropdown__item" data-menu-nav-item="true" onMouseDown={preventFocusSteal} onClick={() => void handleAction(helpActions?.onOpenGettingStarted)}>
                <span className="menu-dropdown__label">
                  <MenuCheckSpacer />
                  {"\u5f00\u59cb"}
                </span>
              </button>
              <button type="button" className="menu-dropdown__item" data-menu-nav-item="true" onMouseDown={preventFocusSteal} onClick={() => void handleAction(helpActions?.onOpenMarkdownHandbook)}>
                <span className="menu-dropdown__label">
                  <MenuCheckSpacer />
                  {"Markdown\u624b\u518c"}
                </span>
              </button>
              <div className="menu-dropdown__separator" />
              <button type="button" className="menu-dropdown__item" data-menu-nav-item="true" onMouseDown={preventFocusSteal} onClick={() => void handleAction(helpActions?.onOpenLicense)}>
                <span className="menu-dropdown__label">
                  <MenuCheckSpacer />
                  LICENSE
                </span>
              </button>
              <div className="menu-dropdown__separator" />
              <button
                type="button"
                className="menu-dropdown__item"
                data-menu-nav-item="true"
                onMouseDown={preventFocusSteal}
                onClick={() => void handleAction(() => setAboutOpen(true))}
              >
                <span className="menu-dropdown__label">
                  <MenuCheckSpacer />
                  {"\u5173\u4e8e"}
                </span>
              </button>
            </div>
          ) : null}
        </div>
        ) : null}
      </nav>

      {aboutOpen ? (
        <div className="about-dialog" role="dialog" aria-modal="true" aria-label="关于 DeskPilot">
          <div className="about-dialog__backdrop" onClick={() => setAboutOpen(false)} />
          <div className="about-dialog__panel">
            <button type="button" className="about-dialog__close" onClick={() => setAboutOpen(false)}>×</button>
            <img className="about-dialog__logo" src={deskpilotLogoUrl} alt="DeskPilot logo" />
            <div className="about-dialog__title">DeskPilot</div>
            <div className="about-dialog__version">{helpActions?.version || ""}</div>
            <div className="about-dialog__meta">
              <span>{"\u90ae\u7bb1"}</span>
              <button
                type="button"
                className="about-dialog__link"
                onClick={() => void window.desktopApi.openExternalUrl(`mailto:${helpActions?.contactEmail || "doveyh@foxmail.com"}`)}
              >
                {helpActions?.contactEmail || "doveyh@foxmail.com"}
              </button>
            </div>
            <div className="about-dialog__meta">
              <span>GitHub</span>
              <button
                type="button"
                className="about-dialog__link"
                onClick={() => void window.desktopApi.openExternalUrl(helpActions?.homepageUrl || "https://github.com/Liyuwen85/DeskPilot")}
              >
                {helpActions?.homepageUrl || "https://github.com/Liyuwen85/DeskPilot"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
