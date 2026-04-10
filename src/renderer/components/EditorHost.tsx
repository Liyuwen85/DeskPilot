import React from "react";
import { ImageTabPane } from "./ImageTabPane";
import { MediaTabPane } from "./MediaTabPane";
import { NotebookTabPane } from "./NotebookTabPane";
import { PdfTabPane } from "./PdfTabPane";
import { TextTabPane } from "./TextTabPane";
import { WebPageTabPane } from "./WebPageTabPane";
import { UI_TEXT } from "../ui-text";
import type { TiptapCommandApi, TiptapOutlineApi, TiptapOutlineItem } from "./TiptapTabPane";

const LazyTiptapTabPane = React.lazy(async () => {
  const module = await import("./TiptapTabPane");
  return { default: module.TiptapTabPane };
});

interface FileTabLike {
  path: string;
  name?: string;
  content: string;
  kind: "markdown" | "text" | "image" | "audio" | "video" | "pdf" | "webpage" | "notebook" | "binary";
}

interface MarkdownDraftLike {
  html: string;
  text: string;
}

interface PreviewStatusLike {
  zoomPercent?: number;
  width?: number;
  height?: number;
  playing?: boolean;
  currentTime?: number;
  duration?: number;
  fileSizeBytes?: number;
}

interface EditorHostProps {
  tabs: FileTabLike[];
  activeTabPath: string | null;
  markdownDraftMap: Record<string, MarkdownDraftLike | undefined>;
  textContentMap: Record<string, string | undefined>;
  onTextChange: (tabPath: string, value: string | MarkdownDraftLike) => void;
  onSaveShortcut: () => void;
  onOutlineChange?: (tabPath: string, items: TiptapOutlineItem[]) => void;
  onOutlineApiReady?: (tabPath: string, api: TiptapOutlineApi | null) => void;
  onCommandApiReady?: (tabPath: string, api: TiptapCommandApi | null) => void;
  onPreviewStatusChange?: (tabPath: string, status: PreviewStatusLike | null) => void;
}

export const EditorHost = React.memo(function EditorHost({
  tabs,
  activeTabPath,
  markdownDraftMap,
  textContentMap,
  onTextChange,
  onSaveShortcut,
  onOutlineChange,
  onOutlineApiReady,
  onCommandApiReady,
  onPreviewStatusChange
}: EditorHostProps) {
  const [mountedTabPaths, setMountedTabPaths] = React.useState<string[]>(() => (
    activeTabPath ? [activeTabPath] : []
  ));

  React.useEffect(() => {
    setMountedTabPaths((previous) => {
      const availablePaths = new Set(tabs.map((tab) => tab.path));
      const stickyPaths = new Set(
        tabs
          .filter((tab) => tab.kind === "pdf" || tab.kind === "image" || tab.kind === "webpage" || tab.kind === "notebook")
          .map((tab) => tab.path)
      );
      const filtered = previous.filter((path) => availablePaths.has(path));
      if (!activeTabPath || !availablePaths.has(activeTabPath)) {
        const persistedPaths = filtered.filter((path) => stickyPaths.has(path));
        return Array.from(new Set(persistedPaths));
      }

      const persistedPaths = filtered.filter((path) => stickyPaths.has(path) && path !== activeTabPath);
      const recentPaths = filtered.filter((path) => !stickyPaths.has(path) && path !== activeTabPath);
      const next = [activeTabPath, ...persistedPaths, ...recentPaths];
      const uniqueNext = Array.from(new Set(next)).slice(0, 2 + persistedPaths.length);
      if (previous.length === uniqueNext.length && previous.every((path, index) => path === uniqueNext[index])) {
        return previous;
      }
      return uniqueNext;
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
                onOutlineChange={onOutlineChange}
                onOutlineApiReady={onOutlineApiReady}
                onCommandApiReady={onCommandApiReady}
              />
            </React.Suspense>
          );
        }

        if (tab.kind === "image") {
          return (
            <ImageTabPane
              key={tab.path}
              path={tab.content || tab.path}
              name={tab.name}
              active={active}
              onStatusChange={(status) => onPreviewStatusChange?.(tab.path, status)}
            />
          );
        }

        if (tab.kind === "pdf") {
          return (
            <PdfTabPane
              key={tab.path}
              path={tab.content || tab.path}
              active={active}
            />
          );
        }

        if (tab.kind === "webpage") {
          return (
            <WebPageTabPane
              key={tab.path}
              path={tab.content || tab.path}
              name={tab.name}
              active={active}
            />
          );
        }

        if (tab.kind === "notebook") {
          return (
            <NotebookTabPane
              key={tab.path}
              tabPath={tab.path}
              content={tab.content}
              name={tab.name}
              active={active}
              onOutlineChange={onOutlineChange}
              onOutlineApiReady={onOutlineApiReady}
            />
          );
        }

        if (tab.kind === "audio" || tab.kind === "video") {
          return (
            <MediaTabPane
              key={tab.path}
              path={tab.content || tab.path}
              name={tab.name}
              kind={tab.kind}
              active={active}
              onStatusChange={(status) => onPreviewStatusChange?.(tab.path, status)}
            />
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
