import React from "react";
import { FindPanel } from "./FindPanel";

function normalizeText(value) {
  return typeof value === "string" ? value : "";
}

function normalizeTextareaText(value) {
  return normalizeText(value).replace(/\r\n/g, "\n");
}

export function TextTabPane({
  tabPath,
  content,
  active,
  onTextChange,
  onSaveShortcut
}) {
  const gutterRef = React.useRef(null);
  const contentRef = React.useRef(null);
  const [findOpen, setFindOpen] = React.useState(false);
  const [findQuery, setFindQuery] = React.useState("");
  const [activeMatchIndex, setActiveMatchIndex] = React.useState(-1);
  const [findJumpToken, setFindJumpToken] = React.useState(0);
  const normalizedContent = React.useMemo(() => normalizeTextareaText(content), [content]);
  const lines = React.useMemo(() => normalizedContent.split("\n"), [normalizedContent]);
  const matches = React.useMemo(() => {
    const text = normalizedContent;
    const query = String(findQuery || "");
    if (!query) {
      return [];
    }

    const lowerText = text.toLowerCase();
    const lowerQuery = query.toLowerCase();
    const nextMatches = [];
    let searchIndex = 0;

    while (searchIndex <= lowerText.length) {
      const index = lowerText.indexOf(lowerQuery, searchIndex);
      if (index === -1) {
        break;
      }

      nextMatches.push({
        start: index,
        end: index + query.length
      });
      searchIndex = index + Math.max(1, query.length);
    }

    return nextMatches;
  }, [findQuery, normalizedContent]);

  React.useEffect(() => {
    if (contentRef.current && contentRef.current.value !== normalizedContent) {
      contentRef.current.value = normalizedContent;
    }
  }, [normalizedContent]);

  React.useEffect(() => {
    if (matches.length === 0 && activeMatchIndex !== -1) {
      setActiveMatchIndex(-1);
      return;
    }

    if (activeMatchIndex >= matches.length) {
      setActiveMatchIndex(matches.length > 0 ? 0 : -1);
    }
  }, [activeMatchIndex, matches.length]);

  React.useEffect(() => {
    const target = matches[activeMatchIndex];
    const textarea = contentRef.current;
    if (!findOpen || !target || !textarea || findJumpToken === 0 || activeMatchIndex < 0) {
      return;
    }

    textarea.focus();
    textarea.setSelectionRange(target.start, target.end);

    const before = textarea.value.slice(0, target.start);
    const lineHeight = 21;
    const lineIndex = before.replace(/\r\n/g, "\n").split("\n").length - 1;
    textarea.scrollTop = Math.max(0, lineIndex * lineHeight - textarea.clientHeight / 2);
    if (gutterRef.current) {
      gutterRef.current.scrollTop = textarea.scrollTop;
    }
  }, [activeMatchIndex, findJumpToken, findOpen, matches]);

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

  const handleScroll = React.useCallback(() => {
    if (gutterRef.current && contentRef.current) {
      gutterRef.current.scrollTop = contentRef.current.scrollTop;
    }
  }, []);

  const handleKeyDown = React.useCallback((event) => {
    const key = String(event.key || "").toLowerCase();
    if ((event.ctrlKey || event.metaKey) && key === "s") {
      event.preventDefault();
      event.stopPropagation();
      onSaveShortcut?.();
      return;
    }

    if ((event.ctrlKey || event.metaKey) && key === "f") {
      event.preventDefault();
      event.stopPropagation();
      setFindOpen(true);
    }
  }, [onSaveShortcut]);

  const handlePrevMatch = React.useCallback(() => {
    if (matches.length === 0) {
      return;
    }
    setFindJumpToken((previous) => previous + 1);
    setActiveMatchIndex((previous) => (
      previous < 0 ? matches.length - 1 : (previous - 1 + matches.length) % matches.length
    ));
  }, [matches.length]);

  const handleNextMatch = React.useCallback(() => {
    if (matches.length === 0) {
      return;
    }
    setFindJumpToken((previous) => previous + 1);
    setActiveMatchIndex((previous) => (
      previous < 0 ? 0 : (previous + 1) % matches.length
    ));
  }, [matches.length]);

  return (
    <div className={`editor-shell ${active ? "" : "editor-shell--hidden"}`}>
      <FindPanel
        visible={findOpen}
        query={findQuery}
        currentIndex={activeMatchIndex}
        totalCount={matches.length}
        onQueryChange={(value) => {
          setFindQuery(value);
          setActiveMatchIndex(-1);
          setFindJumpToken(0);
        }}
        onPrev={handlePrevMatch}
        onNext={handleNextMatch}
        onClose={() => setFindOpen(false)}
      />
      <div className="code-view">
        <div ref={gutterRef} className="code-view__gutter" aria-hidden="true">
          {lines.map((_, index) => (
            <div key={index + 1} className="code-view__line-number">{index + 1}</div>
          ))}
        </div>
        <textarea
          ref={contentRef}
          className="editor-content editor-content--text editor-content--textarea"
          spellCheck={false}
          defaultValue={normalizedContent}
          onKeyDown={handleKeyDown}
          onScroll={handleScroll}
          onChange={(event) => onTextChange(tabPath, event.target.value)}
        />
      </div>
    </div>
  );
}
