import React from "react";
import katex from "katex";
import { marked } from "marked";
import { FindPanel } from "./FindPanel";
import type { TiptapOutlineApi, TiptapOutlineItem } from "./TiptapTabPane";

interface NotebookTabPaneProps {
  tabPath: string;
  content: string;
  name?: string;
  active: boolean;
  onOutlineChange?: (tabPath: string, items: TiptapOutlineItem[]) => void;
  onOutlineApiReady?: (tabPath: string, api: TiptapOutlineApi | null) => void;
}

interface NotebookHeadingItem extends TiptapOutlineItem {
  cellIndex: number;
}

interface NotebookOutputEntry {
  type: string;
  value: string;
}

function normalizeSource(value: unknown): string {
  if (Array.isArray(value)) {
    return value.map((item) => String(item ?? "")).join("");
  }

  return typeof value === "string" ? value : "";
}

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

function resolveRelativePath(target: string, tabPath: string): string {
  const rawTarget = String(target || "").trim();
  if (!rawTarget || /^(https?:|file:|data:|blob:|mailto:|#)/i.test(rawTarget)) {
    return rawTarget;
  }

  const normalizedTarget = rawTarget.replace(/\//g, "\\");
  if (/^[a-zA-Z]:\\/.test(normalizedTarget)) {
    return toFileUrl(normalizedTarget);
  }

  const separatorIndex = Math.max(tabPath.lastIndexOf("\\"), tabPath.lastIndexOf("/"));
  const baseDirectory = separatorIndex >= 0 ? tabPath.slice(0, separatorIndex + 1) : "";
  return toFileUrl(`${baseDirectory}${normalizedTarget}`);
}

function rewriteNotebookHtml(html: string, tabPath: string): string {
  if (!html || typeof window === "undefined") {
    return html;
  }

  const parser = new DOMParser();
  const documentFragment = parser.parseFromString(html, "text/html");

  for (const image of Array.from(documentFragment.querySelectorAll("img[src]"))) {
    const src = image.getAttribute("src") || "";
    image.setAttribute("src", resolveRelativePath(src, tabPath));
  }

  for (const link of Array.from(documentFragment.querySelectorAll("a[href]"))) {
    const href = link.getAttribute("href") || "";
    link.setAttribute("href", resolveRelativePath(href, tabPath));
    link.setAttribute("target", "_blank");
    link.setAttribute("rel", "noreferrer");
  }

  return documentFragment.body.innerHTML;
}

function renderMarkdown(source: string, tabPath: string): string {
  const rendered = marked.parse(source, {
    async: false,
    breaks: true,
    gfm: true
  }) as string;

  return rewriteNotebookHtml(rendered, tabPath);
}

function renderLatex(source: string): string {
  try {
    return katex.renderToString(source, {
      throwOnError: false,
      displayMode: true
    });
  } catch {
    return "";
  }
}

function getCellOutputs(cell: any): any[] {
  return Array.isArray(cell?.outputs) ? cell.outputs : [];
}

function getOutputEntries(output: any): NotebookOutputEntry[] {
  const data = output?.data;
  const entries: NotebookOutputEntry[] = [];

  if (output?.output_type === "stream") {
    const text = normalizeSource(output?.text);
    if (text) {
      entries.push({ type: "text/plain", value: text });
    }
    return entries;
  }

  if (output?.output_type === "error") {
    const traceback = Array.isArray(output?.traceback) ? output.traceback.join("\n") : "";
    const errorText = traceback || `${output?.ename || "Error"}: ${output?.evalue || ""}`.trim();
    if (errorText) {
      entries.push({ type: "text/error", value: errorText });
    }
    return entries;
  }

  if (!data || typeof data !== "object") {
    const fallback = normalizeSource(output?.text);
    if (fallback) {
      entries.push({ type: "text/plain", value: fallback });
    }
    return entries;
  }

  const supportedTypes = [
    "text/html",
    "text/markdown",
    "text/plain",
    "text/latex",
    "image/png",
    "image/jpeg",
    "image/svg+xml",
    "application/json",
    "application/vnd.plotly.v1+json"
  ];
  for (const type of supportedTypes) {
    const rawValue = data[type];
    const value = type === "application/vnd.plotly.v1+json"
      ? JSON.stringify(rawValue ?? null)
      : normalizeSource(rawValue);
    if (value) {
      entries.push({ type, value });
    }
  }

  if (entries.length === 0) {
    for (const [type, rawValue] of Object.entries(data)) {
      if (!type.startsWith("application/vnd.")) {
        continue;
      }

      const normalizedValue = Array.isArray(rawValue)
        ? rawValue.map((item) => String(item ?? "")).join("")
        : typeof rawValue === "string"
          ? rawValue
          : JSON.stringify(rawValue, null, 2);

      if (normalizedValue) {
        entries.push({ type, value: normalizedValue });
      }
    }
  }

  return entries;
}

function safeJsonStringify(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value ?? "");
  }
}

function normalizePlotlySpec(spec: any) {
  if (!spec || typeof spec !== "object") {
    return null;
  }

  const data = Array.isArray(spec.data) ? spec.data : [];
  const layout = spec.layout && typeof spec.layout === "object" ? spec.layout : {};
  const config = spec.config && typeof spec.config === "object" ? spec.config : {};

  return {
    data,
    layout,
    config: {
      displaylogo: false,
      responsive: true,
      ...config
    }
  };
}

function PlotlyOutput({ value }: { value: string }) {
  const containerRef = React.useRef<HTMLDivElement | null>(null);
  const [failed, setFailed] = React.useState(false);
  const parsedSpec = React.useMemo(() => {
    try {
      return normalizePlotlySpec(JSON.parse(value));
    } catch {
      return null;
    }
  }, [value]);

  React.useEffect(() => {
    if (!containerRef.current || !parsedSpec) {
      return undefined;
    }

    let cancelled = false;
    let resizeObserver: ResizeObserver | null = null;
    let plotlyInstance: any = null;

    void import("plotly.js-basic-dist-min").then((module) => {
      if (cancelled || !containerRef.current) {
        return;
      }

      plotlyInstance = module.default || module;
      return plotlyInstance.react(containerRef.current, parsedSpec.data, parsedSpec.layout, parsedSpec.config)
        .then(() => {
          if (cancelled || !containerRef.current) {
            return;
          }

          resizeObserver = new ResizeObserver(() => {
            if (!containerRef.current || !plotlyInstance?.Plots?.resize) {
              return;
            }
            plotlyInstance.Plots.resize(containerRef.current);
          });
          resizeObserver.observe(containerRef.current);
        });
    }).catch(() => {
      if (!cancelled) {
        setFailed(true);
      }
    });

    return () => {
      cancelled = true;
      resizeObserver?.disconnect();
      if (containerRef.current && plotlyInstance?.purge) {
        plotlyInstance.purge(containerRef.current);
      }
    };
  }, [parsedSpec]);

  if (!parsedSpec || failed) {
    return (
      <div className="notebook-output__vendor">
        <div className="notebook-output__vendor-type">application/vnd.plotly.v1+json</div>
        <pre className="notebook-output__text">
          <code>{safeJsonStringify(parsedSpec ? JSON.parse(value) : value)}</code>
        </pre>
      </div>
    );
  }

  return <div ref={containerRef} className="notebook-output__plotly" />;
}

export function NotebookTabPane({
  tabPath,
  content,
  name,
  active,
  onOutlineChange,
  onOutlineApiReady
}: NotebookTabPaneProps) {
  const bodyRef = React.useRef<HTMLDivElement | null>(null);
  const [copiedKey, setCopiedKey] = React.useState("");
  const [findOpen, setFindOpen] = React.useState(false);
  const [findQuery, setFindQuery] = React.useState("");
  const [activeMatchIndex, setActiveMatchIndex] = React.useState(-1);
  const parsedNotebook = React.useMemo(() => {
    try {
      const parsed = JSON.parse(content);
      return {
        error: "",
        notebook: parsed && typeof parsed === "object" ? parsed : null
      };
    } catch (error) {
      return {
        error: error instanceof Error ? error.message : "Failed to parse notebook.",
        notebook: null
      };
    }
  }, [content]);

  const cells = React.useMemo(() => (
    Array.isArray(parsedNotebook.notebook?.cells) ? parsedNotebook.notebook.cells : []
  ), [parsedNotebook.notebook]);

  const headingItems = React.useMemo<NotebookHeadingItem[]>(() => {
    return cells.flatMap((cell: any, index: number) => {
      if (cell?.cell_type !== "markdown") {
        return [];
      }

      const source = normalizeSource(cell?.source);
      return source
        .split(/\r?\n/)
        .map((line) => line.match(/^(#{1,6})\s+(.+?)\s*$/))
        .filter(Boolean)
        .map((match, headingIndex) => ({
          id: `cell-${index}-heading-${headingIndex}`,
          text: String(match?.[2] || "").trim(),
          level: String(match?.[1] || "").length,
          pos: index,
          cellIndex: index
        }))
        .filter((item) => item.text);
    });
  }, [cells]);

  const findMatches = React.useMemo(() => {
    const query = String(findQuery || "").trim().toLowerCase();
    if (!query) {
      return [];
    }

    return cells.flatMap((cell: any, index: number) => {
      const matches = [];
      const source = normalizeSource(cell?.source);
      if (source.toLowerCase().includes(query)) {
        matches.push({
          cellIndex: index,
          key: `cell-${index}-source`
        });
      }

      const outputs = cell?.cell_type === "code" ? getCellOutputs(cell) : [];
      for (let outputIndex = 0; outputIndex < outputs.length; outputIndex += 1) {
        const entries = getOutputEntries(outputs[outputIndex]);
        if (entries.some((entry) => String(entry.value || "").toLowerCase().includes(query))) {
          matches.push({
            cellIndex: index,
            key: `cell-${index}-output-${outputIndex}`
          });
        }
      }

      return matches;
    });
  }, [cells, findQuery]);

  React.useEffect(() => {
    if (!copiedKey) {
      return undefined;
    }

    const timer = window.setTimeout(() => {
      setCopiedKey("");
    }, 1200);

    return () => window.clearTimeout(timer);
  }, [copiedKey]);

  React.useEffect(() => {
    if (findMatches.length === 0 && activeMatchIndex !== -1) {
      setActiveMatchIndex(-1);
      return;
    }

    if (activeMatchIndex >= findMatches.length) {
      setActiveMatchIndex(findMatches.length > 0 ? 0 : -1);
    }
  }, [activeMatchIndex, findMatches.length]);

  React.useEffect(() => {
    if (!findOpen || findMatches.length === 0 || activeMatchIndex < 0) {
      return;
    }

    const nextMatch = findMatches[activeMatchIndex];
    const bodyElement = bodyRef.current;
    const target = bodyElement?.querySelector<HTMLElement>(`[data-notebook-cell-index="${nextMatch.cellIndex}"]`);
    target?.scrollIntoView({
      behavior: "smooth",
      block: "start"
    });
  }, [activeMatchIndex, findMatches, findOpen]);

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

  const handleContentClick = React.useCallback((event: React.MouseEvent<HTMLDivElement>) => {
    const target = event.target instanceof HTMLElement ? event.target : null;
    const link = target?.closest("a[href]") as HTMLAnchorElement | null;
    if (!link) {
      return;
    }

    const href = link.getAttribute("href") || "";
    if (/^(http:|https:|mailto:)/i.test(href)) {
      event.preventDefault();
      void window.desktopApi.openExternalUrl(href);
    }
  }, []);

  const handleCopyCode = React.useCallback(async (copyKey: string, code: string) => {
    const value = normalizeSource(code);
    if (!value) {
      return;
    }

    const result = await window.desktopApi.writeClipboardText(value);
    if (result?.ok) {
      setCopiedKey(copyKey);
    }
  }, []);

  const handleJumpToCell = React.useCallback((cellIndex: number) => {
    const bodyElement = bodyRef.current;
    const target = bodyElement?.querySelector<HTMLElement>(`[data-notebook-cell-index="${cellIndex}"]`);
    if (!target) {
      return;
    }

    target.scrollIntoView({
      behavior: "smooth",
      block: "start"
    });
  }, []);

  React.useEffect(() => {
    onOutlineChange?.(tabPath, headingItems);
  }, [headingItems, onOutlineChange, tabPath]);

  React.useEffect(() => {
    onOutlineApiReady?.(tabPath, {
      scrollToItem: (itemId: string) => {
        const targetItem = headingItems.find((item) => item.id === itemId);
        if (!targetItem) {
          return;
        }

        handleJumpToCell(targetItem.cellIndex);
      }
    });

    return () => {
      onOutlineApiReady?.(tabPath, null);
    };
  }, [handleJumpToCell, headingItems, onOutlineApiReady, tabPath]);

  const handlePrevMatch = React.useCallback(() => {
    if (findMatches.length === 0) {
      return;
    }

    setActiveMatchIndex((previous) => (
      previous < 0 ? findMatches.length - 1 : (previous - 1 + findMatches.length) % findMatches.length
    ));
  }, [findMatches.length]);

  const handleNextMatch = React.useCallback(() => {
    if (findMatches.length === 0) {
      return;
    }

    setActiveMatchIndex((previous) => (
      previous < 0 ? 0 : (previous + 1) % findMatches.length
    ));
  }, [findMatches.length]);

  return (
    <div className={`editor-shell editor-shell--notebook ${active ? "" : "editor-shell--hidden"}`}>
      <FindPanel
        visible={findOpen}
        query={findQuery}
        currentIndex={activeMatchIndex}
        totalCount={findMatches.length}
        onQueryChange={(value) => {
          setFindQuery(value);
          setActiveMatchIndex(-1);
        }}
        onPrev={handlePrevMatch}
        onNext={handleNextMatch}
        onClose={() => setFindOpen(false)}
      />
      <div className="notebook-tab" onClick={handleContentClick}>
        <div className="notebook-tab__layout">
          <div ref={bodyRef} className="notebook-tab__body">
            {parsedNotebook.error ? (
              <div className="notebook-tab__error">
                <h3>Unable to parse .ipynb file</h3>
                <pre>{parsedNotebook.error}</pre>
              </div>
            ) : cells.length === 0 ? (
              <div className="notebook-tab__empty">
                <h3>Empty notebook</h3>
                <p>This .ipynb file has no cells to preview.</p>
              </div>
            ) : (
              cells.map((cell: any, index: number) => {
                const cellType = cell?.cell_type === "code" ? "code" : "markdown";
                const source = normalizeSource(cell?.source);
                const renderedMarkdown = cellType === "markdown" ? renderMarkdown(source, tabPath) : "";
                const outputs = cellType === "code" ? getCellOutputs(cell) : [];
                const copyKey = `cell-${index}`;

                return (
                  <section
                    key={`${cellType}-${index}`}
                    className={`notebook-cell notebook-cell--${cellType} ${activeMatchIndex >= 0 && findMatches[activeMatchIndex]?.cellIndex === index ? "notebook-cell--search-active" : ""}`}
                    data-notebook-cell-index={index}
                  >
                    <div className="notebook-cell__meta">
                      <span className="notebook-cell__index">#{index + 1}</span>
                      <span className="notebook-cell__type">{cellType === "code" ? "Code" : "MD"}</span>
                    </div>
                    <div className="notebook-cell__main">
                      {cellType === "markdown" ? (
                        <div
                          className="notebook-cell__markdown"
                          dangerouslySetInnerHTML={{ __html: renderedMarkdown }}
                        />
                      ) : (
                        <>
                          <div className="notebook-cell__code-wrap">
                            <button
                              type="button"
                              className="notebook-cell__copy"
                              onClick={() => void handleCopyCode(copyKey, source)}
                            >
                              {copiedKey === copyKey ? "Copied" : "Copy"}
                            </button>
                            <pre className="notebook-cell__code"><code>{source}</code></pre>
                          </div>
                          {outputs.length ? (
                            <div className="notebook-cell__outputs">
                              {outputs.map((output: any, outputIndex: number) => (
                                <div key={`output-${index}-${outputIndex}`} className="notebook-output">
                                  {getOutputEntries(output).map((entry, entryIndex) => {
                                    if (entry.type === "image/png" || entry.type === "image/jpeg") {
                                      return (
                                        <img
                                          key={`${entry.type}-${entryIndex}`}
                                          className="notebook-output__image"
                                          src={`data:${entry.type};base64,${entry.value}`}
                                          alt={`Notebook output ${entryIndex + 1}`}
                                        />
                                      );
                                    }

                                    if (entry.type === "text/html") {
                                      return (
                                        <div
                                          key={`${entry.type}-${entryIndex}`}
                                          className="notebook-output__html"
                                          dangerouslySetInnerHTML={{ __html: rewriteNotebookHtml(entry.value, tabPath) }}
                                        />
                                      );
                                    }

                                    if (entry.type === "text/markdown") {
                                      return (
                                        <div
                                          key={`${entry.type}-${entryIndex}`}
                                          className="notebook-output__markdown"
                                          dangerouslySetInnerHTML={{ __html: renderMarkdown(entry.value, tabPath) }}
                                        />
                                      );
                                    }

                                    if (entry.type === "text/latex") {
                                      const renderedLatex = renderLatex(entry.value);
                                      return renderedLatex ? (
                                        <div
                                          key={`${entry.type}-${entryIndex}`}
                                          className="notebook-output__latex"
                                          dangerouslySetInnerHTML={{ __html: renderedLatex }}
                                        />
                                      ) : (
                                        <pre key={`${entry.type}-${entryIndex}`} className="notebook-output__text">
                                          <code>{entry.value}</code>
                                        </pre>
                                      );
                                    }

                                    if (entry.type === "image/svg+xml") {
                                      return (
                                        <div
                                          key={`${entry.type}-${entryIndex}`}
                                          className="notebook-output__svg"
                                          dangerouslySetInnerHTML={{ __html: entry.value }}
                                        />
                                      );
                                    }

                                    if (entry.type === "application/json") {
                                      return (
                                        <pre key={`${entry.type}-${entryIndex}`} className="notebook-output__text">
                                          <code>{(() => {
                                            try {
                                              return JSON.stringify(JSON.parse(entry.value), null, 2);
                                            } catch {
                                              return entry.value;
                                            }
                                          })()}</code>
                                        </pre>
                                      );
                                    }

                                    if (entry.type === "application/vnd.plotly.v1+json") {
                                      return (
                                        <PlotlyOutput
                                          key={`${entry.type}-${entryIndex}`}
                                          value={entry.value}
                                        />
                                      );
                                    }

                                    if (entry.type.startsWith("application/vnd.")) {
                                      return (
                                        <div key={`${entry.type}-${entryIndex}`} className="notebook-output__vendor">
                                          <div className="notebook-output__vendor-type">{entry.type}</div>
                                          <pre className="notebook-output__text">
                                            <code>{entry.value}</code>
                                          </pre>
                                        </div>
                                      );
                                    }

                                    return (
                                      <pre key={`${entry.type}-${entryIndex}`} className="notebook-output__text">
                                        <code>{entry.value}</code>
                                      </pre>
                                    );
                                  })}
                                </div>
                              ))}
                            </div>
                          ) : null}
                        </>
                      )}
                    </div>
                  </section>
                );
              })
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
