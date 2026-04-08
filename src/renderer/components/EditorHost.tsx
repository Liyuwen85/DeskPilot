import React from "react";
import { TextTabPane } from "./TextTabPane";
import { UI_TEXT } from "../ui-text";

const LazyTiptapTabPane = React.lazy(async () => {
  const module = await import("./TiptapTabPane");
  return { default: module.TiptapTabPane };
});

interface FileTabLike {
  path: string;
  name?: string;
  content: string;
  kind: "markdown" | "text" | "binary";
}

interface MarkdownDraftLike {
  html: string;
  text: string;
}

interface EditorHostProps {
  tabs: FileTabLike[];
  activeTabPath: string | null;
  markdownDraftMap: Record<string, MarkdownDraftLike | undefined>;
  textContentMap: Record<string, string | undefined>;
  onTextChange: (tabPath: string, value: string | MarkdownDraftLike) => void;
  onSaveShortcut: () => void;
}

export const EditorHost = React.memo(function EditorHost({
  tabs,
  activeTabPath,
  markdownDraftMap,
  textContentMap,
  onTextChange,
  onSaveShortcut
}: EditorHostProps) {
  const [mountedTabPaths, setMountedTabPaths] = React.useState<string[]>(() => (
    activeTabPath ? [activeTabPath] : []
  ));

  React.useEffect(() => {
    setMountedTabPaths((previous) => {
      const availablePaths = new Set(tabs.map((tab) => tab.path));
      const filtered = previous.filter((path) => availablePaths.has(path));
      if (!activeTabPath || !availablePaths.has(activeTabPath)) {
        return filtered;
      }

      const next = [activeTabPath, ...filtered.filter((path) => path !== activeTabPath)];
      return next.slice(0, 2);
    });
  }, [activeTabPath, tabs]);

  if (!tabs.length || !activeTabPath) {
    return (
      <div className="viewer__empty">
        <h2>{UI_TEXT.editor.emptyTitle}</h2>
        <p>{UI_TEXT.editor.emptyDescription}</p>
      </div>
    );
  }

  const mountedTabs = tabs.filter((tab) => mountedTabPaths.includes(tab.path));

  return (
    <div className="viewer__host viewer__host--react">
      {mountedTabs.map((tab) => {
        const active = tab.path === activeTabPath;
        if (tab.kind === "markdown") {
          return (
            <React.Suspense key={tab.path} fallback={active ? <div className="viewer__loading">{UI_TEXT.editor.loadingMarkdown}</div> : null}>
              <LazyTiptapTabPane
                tabPath={tab.path}
                markdown={tab.content}
                draftHtml={markdownDraftMap[tab.path]?.html ?? null}
                active={active}
                onTextChange={onTextChange}
                onSaveShortcut={onSaveShortcut}
              />
            </React.Suspense>
          );
        }

        return (
          <TextTabPane
            key={tab.path}
            tabPath={tab.path}
            content={textContentMap[tab.path] ?? tab.content}
            active={active}
            onTextChange={onTextChange}
            onSaveShortcut={onSaveShortcut}
          />
        );
      })}
    </div>
  );
});
