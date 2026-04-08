import React from "react";

function normalizeText(value) {
  return typeof value === "string" ? value : "";
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
  const lines = React.useMemo(() => normalizeText(content).replace(/\r\n/g, "\n").split("\n"), [content]);

  React.useEffect(() => {
    if (contentRef.current && contentRef.current.value !== normalizeText(content)) {
      contentRef.current.value = normalizeText(content);
    }
  }, [content]);

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
    }
  }, [onSaveShortcut]);

  return (
    <div className={`editor-shell ${active ? "" : "editor-shell--hidden"}`}>
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
          defaultValue={content}
          onKeyDown={handleKeyDown}
          onScroll={handleScroll}
          onChange={(event) => onTextChange(tabPath, event.target.value)}
        />
      </div>
    </div>
  );
}
