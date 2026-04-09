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

interface PdfTabPaneProps {
  path: string;
  active: boolean;
}

export function PdfTabPane({ path, active }: PdfTabPaneProps) {
  return (
    <div className={`editor-shell editor-shell--pdf ${active ? "" : "editor-shell--hidden"}`}>
      <div className="pdf-tab">
        <iframe
          className="pdf-tab__frame"
          src={toFileUrl(path)}
          title="PDF Preview"
        />
      </div>
    </div>
  );
}
