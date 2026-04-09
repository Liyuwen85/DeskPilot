import React from "react";

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
}

type MenuKey = "file" | "markdown" | "format";

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
  formatActions
}: FileMenuProps) {
  const [openMenu, setOpenMenu] = React.useState<MenuKey | null>(null);
  const [recentOpen, setRecentOpen] = React.useState(false);
  const menuRef = React.useRef<HTMLDivElement | null>(null);

  const topLevelMenus = React.useMemo(
    () => [
      { key: "file" as const, enabled: true },
      { key: "markdown" as const, enabled: markdownEnabled },
      { key: "format" as const, enabled: markdownEnabled }
    ],
    [markdownEnabled]
  );

  const closeAll = React.useCallback(() => {
    setOpenMenu(null);
    setRecentOpen(false);
  }, []);

  const preventFocusSteal = React.useCallback((event: React.MouseEvent<HTMLElement>) => {
    event.preventDefault();
  }, []);

  const handleAction = React.useCallback(
    async (action: () => void | Promise<void>) => {
      closeAll();
      await action();
    },
    [closeAll]
  );

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
      if (!openMenu) {
        return;
      }

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
        const nextIndex = currentIndex >= 0 ? (currentIndex - 1 + visibleItems.length) % visibleItems.length : visibleItems.length - 1;
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
    <nav className="titlebar__menu" aria-label="App menu" ref={menuRef}>
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
          文件
        </button>
        {openMenu === "file" ? (
          <div className="menu-dropdown__panel">
            <button
              type="button"
              className="menu-dropdown__item"
              data-menu-nav-item="true"
              onMouseDown={preventFocusSteal}
              onClick={() => void handleAction(onNewTab)}
            >
              <span className="menu-dropdown__label">新建 Markdown</span>
              <span className="menu-dropdown__hint">Ctrl+T</span>
            </button>
            <button
              type="button"
              className="menu-dropdown__item"
              data-menu-nav-item="true"
              onMouseDown={preventFocusSteal}
              onClick={() => void handleAction(onNewWindow)}
            >
              <span className="menu-dropdown__label">新建窗口</span>
              <span className="menu-dropdown__hint">Ctrl+Shift+N</span>
            </button>
            <div className="menu-dropdown__separator" />
            <button
              type="button"
              className="menu-dropdown__item"
              data-menu-nav-item="true"
              onMouseDown={preventFocusSteal}
              onClick={() => void handleAction(onOpenFile)}
            >
              <span className="menu-dropdown__label">打开文件</span>
              <span className="menu-dropdown__hint">Ctrl+O</span>
            </button>
            <button
              type="button"
              className="menu-dropdown__item"
              data-menu-nav-item="true"
              onMouseDown={preventFocusSteal}
              onClick={() => void handleAction(onOpenFolder)}
            >
              <span className="menu-dropdown__label">打开文件夹</span>
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
                        data-menu-nav-item="true"
                        onMouseDown={preventFocusSteal}
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
            <button
              type="button"
              className="menu-dropdown__item"
              data-menu-nav-item="true"
              onMouseDown={preventFocusSteal}
              onClick={() => void handleAction(onSave)}
            >
              <span className="menu-dropdown__label">保存</span>
              <span className="menu-dropdown__hint">Ctrl+S</span>
            </button>
            <button
              type="button"
              className="menu-dropdown__item"
              data-menu-nav-item="true"
              onMouseDown={preventFocusSteal}
              onClick={() => void handleAction(onSaveAs)}
            >
              <span className="menu-dropdown__label">另存为</span>
              <span className="menu-dropdown__hint">Ctrl+Shift+S</span>
            </button>
            <div className="menu-dropdown__separator" />
            <button
              type="button"
              className="menu-dropdown__item"
              data-menu-nav-item="true"
              onMouseDown={preventFocusSteal}
              onClick={() => void handleAction(onQuit)}
            >
              <span className="menu-dropdown__label">退出</span>
              <span className="menu-dropdown__hint">Alt+F4</span>
            </button>
          </div>
        ) : null}
      </div>

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
            <div className="menu-dropdown__empty">标题</div>
            {[1, 2, 3, 4, 5].map((level) => (
              <button
                key={level}
                type="button"
                className="menu-dropdown__item"
                data-menu-nav-item="true"
                onMouseDown={preventFocusSteal}
                onClick={() => void handleAction(() => markdownActions.onHeading(level))}
              >
                <span className="menu-dropdown__label">{`H${level}`}</span>
                <span className="menu-dropdown__hint">{`Ctrl+Alt+${level}`}</span>
              </button>
            ))}
            <div className="menu-dropdown__separator" />
            <div className="menu-dropdown__empty">插入</div>
            <button
              type="button"
              className="menu-dropdown__item"
              data-menu-nav-item="true"
              onMouseDown={preventFocusSteal}
              onClick={() => void handleAction(markdownActions.onHorizontalRule)}
            >
              <span className="menu-dropdown__label">分割线</span>
              <span className="menu-dropdown__hint">Ctrl+Alt+-</span>
            </button>
            <button
              type="button"
              className="menu-dropdown__item"
              data-menu-nav-item="true"
              onMouseDown={preventFocusSteal}
              onClick={() => void handleAction(markdownActions.onImage)}
            >
              <span className="menu-dropdown__label">图片</span>
              <span className="menu-dropdown__hint">Ctrl+Alt+I</span>
            </button>
            <div className="menu-dropdown__separator" />
            <div className="menu-dropdown__empty">数学公式</div>
            <button
              type="button"
              className="menu-dropdown__item"
              data-menu-nav-item="true"
              onMouseDown={preventFocusSteal}
              onClick={() => void handleAction(markdownActions.onInlineMath)}
            >
              <span className="menu-dropdown__label">行内公式</span>
              <span className="menu-dropdown__hint">Ctrl+Alt+M</span>
            </button>
            <button
              type="button"
              className="menu-dropdown__item"
              data-menu-nav-item="true"
              onMouseDown={preventFocusSteal}
              onClick={() => void handleAction(markdownActions.onBlockMath)}
            >
              <span className="menu-dropdown__label">块级公式</span>
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
          格式
        </button>
        {openMenu === "format" && markdownEnabled && formatActions ? (
          <div className="menu-dropdown__panel">
            <div className="menu-dropdown__empty">文本样式</div>
            <button
              type="button"
              className="menu-dropdown__item"
              data-menu-nav-item="true"
              onMouseDown={preventFocusSteal}
              onClick={() => void handleAction(formatActions.onBold)}
            >
              <span className="menu-dropdown__label">加粗</span>
              <span className="menu-dropdown__hint">Ctrl+B</span>
            </button>
            <button
              type="button"
              className="menu-dropdown__item"
              data-menu-nav-item="true"
              onMouseDown={preventFocusSteal}
              onClick={() => void handleAction(formatActions.onItalic)}
            >
              <span className="menu-dropdown__label">斜体</span>
              <span className="menu-dropdown__hint">Ctrl+I</span>
            </button>
            <button
              type="button"
              className="menu-dropdown__item"
              data-menu-nav-item="true"
              onMouseDown={preventFocusSteal}
              onClick={() => void handleAction(formatActions.onUnderline)}
            >
              <span className="menu-dropdown__label">下划线</span>
              <span className="menu-dropdown__hint">Ctrl+U</span>
            </button>
            <button
              type="button"
              className="menu-dropdown__item"
              data-menu-nav-item="true"
              onMouseDown={preventFocusSteal}
              onClick={() => void handleAction(formatActions.onStrike)}
            >
              <span className="menu-dropdown__label">删除线</span>
              <span className="menu-dropdown__hint">Ctrl+Shift+S</span>
            </button>
            <button
              type="button"
              className="menu-dropdown__item"
              data-menu-nav-item="true"
              onMouseDown={preventFocusSteal}
              onClick={() => void handleAction(formatActions.onInlineCode)}
            >
              <span className="menu-dropdown__label">行内代码</span>
              <span className="menu-dropdown__hint">Ctrl+E</span>
            </button>
            <div className="menu-dropdown__separator" />
            <div className="menu-dropdown__empty">列表</div>
            <button
              type="button"
              className="menu-dropdown__item"
              data-menu-nav-item="true"
              onMouseDown={preventFocusSteal}
              onClick={() => void handleAction(formatActions.onBulletList)}
            >
              <span className="menu-dropdown__label">无序列表</span>
              <span className="menu-dropdown__hint">Ctrl+Shift+8</span>
            </button>
            <button
              type="button"
              className="menu-dropdown__item"
              data-menu-nav-item="true"
              onMouseDown={preventFocusSteal}
              onClick={() => void handleAction(formatActions.onOrderedList)}
            >
              <span className="menu-dropdown__label">有序列表</span>
              <span className="menu-dropdown__hint">Ctrl+Shift+7</span>
            </button>
            <button
              type="button"
              className="menu-dropdown__item"
              data-menu-nav-item="true"
              onMouseDown={preventFocusSteal}
              onClick={() => void handleAction(formatActions.onTaskList)}
            >
              <span className="menu-dropdown__label">任务列表</span>
              <span className="menu-dropdown__hint">Ctrl+Shift+9</span>
            </button>
            <div className="menu-dropdown__separator" />
            <div className="menu-dropdown__empty">块级</div>
            <button
              type="button"
              className="menu-dropdown__item"
              data-menu-nav-item="true"
              onMouseDown={preventFocusSteal}
              onClick={() => void handleAction(formatActions.onBlockquote)}
            >
              <span className="menu-dropdown__label">引用</span>
              <span className="menu-dropdown__hint">Ctrl+Shift+B</span>
            </button>
            <button
              type="button"
              className="menu-dropdown__item"
              data-menu-nav-item="true"
              onMouseDown={preventFocusSteal}
              onClick={() => void handleAction(formatActions.onCodeBlock)}
            >
              <span className="menu-dropdown__label">代码块</span>
              <span className="menu-dropdown__hint">Ctrl+Alt+C</span>
            </button>
            <div className="menu-dropdown__separator" />
            <div className="menu-dropdown__empty">清理</div>
            <button
              type="button"
              className="menu-dropdown__item"
              data-menu-nav-item="true"
              onMouseDown={preventFocusSteal}
              onClick={() => void handleAction(formatActions.onClearFormatting)}
            >
              <span className="menu-dropdown__label">清除格式</span>
              <span className="menu-dropdown__hint">Ctrl+\\</span>
            </button>
          </div>
        ) : null}
      </div>
    </nav>
  );
}
