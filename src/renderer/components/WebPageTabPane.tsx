import React from "react";

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

  return (
    <div className={`editor-shell editor-shell--webpage ${active ? "" : "editor-shell--hidden"}`}>
      <div className="webpage-tab">
        <div className="webpage-tab__toolbar">
          <span className="webpage-tab__badge">Web</span>
          <span className="webpage-tab__name" title={name || path}>{name || path}</span>
        </div>
        <iframe
          className="webpage-tab__frame"
          src={src}
          title={name || "Web Page Preview"}
        />
      </div>
    </div>
  );
}
