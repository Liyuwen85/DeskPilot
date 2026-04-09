import React from "react";
import { FindPanel } from "./FindPanel";

function toFileUrl(targetPath: string): string {
  const normalized = String(targetPath || "").replace(/\\/g, "/");
  if (!normalized) {
    return "";
  }

  if (/^(https?:|file:|data:|blob:)/i.test(normalized)) {
    return normalized;
  }

  if (/^[a-zA-Z]:\//.test(normalized)) {
    return `file:///${encodeURI(normalized)}`;
  }

  return `file://${encodeURI(normalized)}`;
}

interface WebPageTabPaneProps {
  path: string;
  name?: string;
  active: boolean;
}

export function WebPageTabPane({ path, name, active }: WebPageTabPaneProps) {
  const src = React.useMemo(() => toFileUrl(path), [path]);
  const frameRef = React.useRef<HTMLIFrameElement | null>(null);
  const frameKeydownCleanupRef = React.useRef<(() => void) | null>(null);
  const [findOpen, setFindOpen] = React.useState(false);
  const [findQuery, setFindQuery] = React.useState("");
  const [matchCount, setMatchCount] = React.useState(0);
  const [activeMatchIndex, setActiveMatchIndex] = React.useState(-1);

  const refreshMatchCount = React.useCallback((query: string) => {
    const frame = frameRef.current;
    const doc = frame?.contentDocument;
    const text = String(doc?.body?.innerText || "");
    const normalizedQuery = String(query || "").trim().toLowerCase();
    if (!normalizedQuery || !text) {
      setMatchCount(0);
      setActiveMatchIndex(-1);
      return;
    }

    const lowerText = text.toLowerCase();
    let count = 0;
    let index = 0;
    while (index <= lowerText.length) {
      const nextIndex = lowerText.indexOf(normalizedQuery, index);
      if (nextIndex === -1) {
        break;
      }
      count += 1;
      index = nextIndex + Math.max(1, normalizedQuery.length);
    }

    setMatchCount(count);
    setActiveMatchIndex(-1);
  }, []);

  React.useEffect(() => {
    if (!active) {
      setFindOpen(false);
    }
  }, [active]);

  React.useEffect(() => {
    if (!active) {
      return;
    }

    return window.desktopApi.onWindowEscape(() => {
      setFindOpen(false);
    });
  }, [active]);

  React.useEffect(() => {
    if (!active) {
      return undefined;
    }

    function handleKeyDown(event: KeyboardEvent) {
      const key = String(event.key || "").toLowerCase();
      if ((event.ctrlKey || event.metaKey) && key === "f") {
        event.preventDefault();
        setFindOpen(true);
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [active]);

  const handleFrameLoad = React.useCallback(() => {
    frameKeydownCleanupRef.current?.();
    frameKeydownCleanupRef.current = null;
    refreshMatchCount(findQuery);

    const frameWindow = frameRef.current?.contentWindow;
    const frameDocument = frameRef.current?.contentDocument;
    if (!frameWindow || !frameDocument) {
      return;
    }

    const handleFrameKeyDown = (event: KeyboardEvent) => {
      const key = String(event.key || "").toLowerCase();
      if ((event.ctrlKey || event.metaKey) && key === "f") {
        event.preventDefault();
        setFindOpen(true);
      }
    };

    frameWindow.addEventListener("keydown", handleFrameKeyDown);
    frameDocument.addEventListener("keydown", handleFrameKeyDown);
    frameKeydownCleanupRef.current = () => {
      frameWindow.removeEventListener("keydown", handleFrameKeyDown);
      frameDocument.removeEventListener("keydown", handleFrameKeyDown);
    };
  }, [findQuery, refreshMatchCount]);

  React.useEffect(() => {
    return () => {
      frameKeydownCleanupRef.current?.();
      frameKeydownCleanupRef.current = null;
    };
  }, []);

  const runFind = React.useCallback((backwards: boolean) => {
    const frameWindow = frameRef.current?.contentWindow;
    const normalizedQuery = String(findQuery || "").trim();
    if (!frameWindow || !normalizedQuery || matchCount === 0) {
      return;
    }

    frameWindow.focus();
    frameWindow.find(normalizedQuery, false, backwards, true, false, false, false);
    setActiveMatchIndex((previous) => {
      if (backwards) {
        return previous < 0 ? matchCount - 1 : (previous - 1 + matchCount) % matchCount;
      }
      return previous < 0 ? 0 : (previous + 1) % matchCount;
    });
  }, [findQuery, matchCount]);

  return (
    <div className={`editor-shell editor-shell--webpage ${active ? "" : "editor-shell--hidden"}`}>
      <FindPanel
        visible={findOpen}
        query={findQuery}
        currentIndex={activeMatchIndex}
        totalCount={matchCount}
        onQueryChange={(value) => {
          setFindQuery(value);
          refreshMatchCount(value);
        }}
        onPrev={() => runFind(true)}
        onNext={() => runFind(false)}
        onClose={() => setFindOpen(false)}
      />
      <div className="webpage-tab">
        <iframe
          ref={frameRef}
          className="webpage-tab__frame"
          src={src}
          title={name || "Web Page Preview"}
          onLoad={handleFrameLoad}
        />
      </div>
    </div>
  );
}
