import React from "react";
import { EditorSelection, EditorState, StateEffect, StateField } from "@codemirror/state";
import { defaultKeymap, history, historyKeymap, indentWithTab } from "@codemirror/commands";
import { Decoration, EditorView, gutter, keymap, lineNumbers } from "@codemirror/view";
import { HighlightStyle, StreamLanguage, defaultHighlightStyle, syntaxHighlighting } from "@codemirror/language";
import { tags } from "@lezer/highlight";
import { markdown } from "@codemirror/lang-markdown";
import { javascript } from "@codemirror/lang-javascript";
import { java } from "@codemirror/lang-java";
import { python } from "@codemirror/lang-python";
import { json } from "@codemirror/lang-json";
import { html } from "@codemirror/lang-html";
import { css } from "@codemirror/lang-css";
import { xml } from "@codemirror/lang-xml";
import { yaml } from "@codemirror/lang-yaml";
import { cpp } from "@codemirror/lang-cpp";
import { go } from "@codemirror/lang-go";
import { rust } from "@codemirror/lang-rust";
import { sql } from "@codemirror/lang-sql";
import { shell as shellMode } from "@codemirror/legacy-modes/mode/shell";
import { powerShell as powershellMode } from "@codemirror/legacy-modes/mode/powershell";
import { toml as tomlMode } from "@codemirror/legacy-modes/mode/toml";
import { dockerFile as dockerfileMode } from "@codemirror/legacy-modes/mode/dockerfile";
import { FindPanel } from "./FindPanel";

const textTabScrollPositionMap = new Map();

function normalizeText(value) {
  return typeof value === "string" ? value : "";
}

function normalizeEditorText(value) {
  return normalizeText(value).replace(/\r\n/g, "\n");
}

function getFileExtension(tabPath) {
  const normalizedPath = String(tabPath || "").toLowerCase();
  const match = normalizedPath.match(/\.([a-z0-9.+_-]+)$/i);
  return match ? match[1] : "";
}

function getBaseName(tabPath) {
  const normalizedPath = String(tabPath || "").replace(/[\\/]+/g, "/").replace(/\/$/, "");
  if (!normalizedPath) {
    return "";
  }

  const segments = normalizedPath.split("/");
  return String(segments[segments.length - 1] || "").toLowerCase();
}

function getLanguageExtension(tabPath) {
  const ext = getFileExtension(tabPath);
  const baseName = getBaseName(tabPath);

  if (baseName === "dockerfile" || ext === "dockerfile") {
    return [StreamLanguage.define(dockerfileMode)];
  }

  if (!ext) {
    return [];
  }

  if (["md", "markdown", "mdx"].includes(ext)) {
    return [markdown()];
  }

  if (["js", "mjs", "cjs"].includes(ext)) {
    return [javascript()];
  }

  if (ext === "jsx") {
    return [javascript({ jsx: true })];
  }

  if (["ts"].includes(ext)) {
    return [javascript({ typescript: true })];
  }

  if (ext === "tsx") {
    return [javascript({ typescript: true, jsx: true })];
  }

  if (ext === "py") {
    return [python()];
  }

  if (ext === "java") {
    return [java()];
  }

  if (ext === "json") {
    return [json()];
  }

  if (["html", "htm"].includes(ext)) {
    return [html()];
  }

  if (["css", "scss", "sass", "less"].includes(ext)) {
    return [css()];
  }

  if (["xml", "svg", "xhtml"].includes(ext)) {
    return [xml()];
  }

  if (["yaml", "yml"].includes(ext)) {
    return [yaml()];
  }

  if (["c", "cpp", "cc", "cxx", "h", "hpp"].includes(ext)) {
    return [cpp()];
  }

  if (ext === "go") {
    return [go()];
  }

  if (ext === "rs") {
    return [rust()];
  }

  if (ext === "sql") {
    return [sql()];
  }

  if (["sh", "bash", "zsh"].includes(ext)) {
    return [StreamLanguage.define(shellMode)];
  }

  if (ext === "ps1") {
    return [StreamLanguage.define(powershellMode)];
  }

  if (ext === "toml") {
    return [StreamLanguage.define(tomlMode)];
  }

  return [];
}

function findMatches(text, query) {
  const normalizedQuery = String(query || "");
  if (!normalizedQuery) {
    return [];
  }

  const lowerText = text.toLowerCase();
  const lowerQuery = normalizedQuery.toLowerCase();
  const nextMatches = [];
  let searchIndex = 0;

  while (searchIndex <= lowerText.length) {
    const index = lowerText.indexOf(lowerQuery, searchIndex);
    if (index === -1) {
      break;
    }

    nextMatches.push({
      start: index,
      end: index + normalizedQuery.length
    });
    searchIndex = index + Math.max(1, normalizedQuery.length);
  }

  return nextMatches;
}

const setCurrentMatchEffect = StateEffect.define();

const currentMatchField = StateField.define({
  create() {
    return Decoration.none;
  },
  update(decorations, transaction) {
    let nextDecorations = decorations.map(transaction.changes);

    for (const effect of transaction.effects) {
      if (effect.is(setCurrentMatchEffect)) {
        const range = effect.value;
        nextDecorations = range
          ? Decoration.set([Decoration.mark({ class: "cm-search-match-current" }).range(range.from, range.to)])
          : Decoration.none;
      }
    }

    return nextDecorations;
  },
  provide: (field) => EditorView.decorations.from(field)
});

const strongerHighlightStyle = HighlightStyle.define([
  { tag: [tags.keyword, tags.modifier, tags.controlKeyword], color: "#0000cc", fontWeight: "700" },
  { tag: [tags.operatorKeyword, tags.definitionKeyword], color: "#0000cc", fontWeight: "700" },
  { tag: [tags.string, tags.special(tags.string)], color: "#067d17" },
  { tag: [tags.number, tags.integer, tags.float], color: "#1750eb" },
  { tag: [tags.bool, tags.null], color: "#0000cc", fontWeight: "700" },
  { tag: [tags.comment, tags.lineComment, tags.blockComment], color: "#8c8c8c", fontStyle: "italic" },
  { tag: [tags.function(tags.variableName), tags.function(tags.propertyName)], color: "#003f5c" },
  { tag: [tags.typeName, tags.className, tags.namespace], color: "#0033b3" },
  { tag: [tags.propertyName], color: "#7a3e9d" },
  { tag: [tags.attributeName], color: "#174ad4" },
  { tag: [tags.variableName, tags.labelName], color: "#000000" },
  { tag: [tags.definition(tags.variableName), tags.definition(tags.propertyName)], color: "#000000" },
  { tag: [tags.link, tags.url], color: "#0b57d0", textDecoration: "underline" },
  { tag: [tags.heading], color: "#0000cc", fontWeight: "700" },
  { tag: [tags.emphasis], fontStyle: "italic" },
  { tag: [tags.strong], fontWeight: "700" },
  { tag: [tags.monospace], color: "#0033b3" }
]);

function createEditorTheme() {
  return EditorView.theme({
    "&": {
      height: "100%",
      backgroundColor: "var(--editor-surface)",
      color: "var(--text)"
    },
    ".cm-scroller": {
      overflow: "auto",
      fontFamily: 'Consolas, "Cascadia Mono", monospace',
      lineHeight: "24px"
    },
    ".cm-content, .cm-gutter": {
      fontFamily: 'Consolas, "Cascadia Mono", monospace',
      fontSize: "12px",
      lineHeight: "24px"
    },
    ".cm-content": {
      padding: "16px 12px"
    },
    ".cm-line": {
      padding: "0",
      minHeight: "24px"
    },
    ".cm-gutters": {
      flex: "0 0 auto",
      borderRight: "1px solid var(--editor-border)",
      backgroundColor: "#f8fafc",
      color: "#94a3b8"
    },
    ".cm-lineNumbers": {
      minWidth: "52px"
    },
    ".cm-gutterElement": {
      minHeight: "24px",
      lineHeight: "24px",
      boxSizing: "border-box"
    },
    ".cm-lineNumbers .cm-gutterElement": {
      padding: "0 12px"
    },
    ".cm-lineNumbers > :first-child": {
      display: "none"
    },
    ".cm-selectionBackground, &.cm-focused .cm-selectionBackground": {
      backgroundColor: "rgba(59, 130, 246, 0.22)"
    },
    ".cm-cursor, &.cm-focused .cm-cursor": {
      borderLeftColor: "#2563eb"
    }
  });
}

function createSimpleLineNumbers() {
  return [
    lineNumbers({
      formatNumber: (lineNo) => String(lineNo)
    }),
    gutter({
      class: "cm-gutter-spacer"
    })
  ];
}

function getStoredScrollPosition(tabPath) {
  const cached = textTabScrollPositionMap.get(tabPath);
  if (!cached) {
    return { top: 0, left: 0 };
  }

  return {
    top: Math.max(0, Number(cached.top) || 0),
    left: Math.max(0, Number(cached.left) || 0)
  };
}

function storeScrollPosition(tabPath, element) {
  if (!tabPath || !element) {
    return;
  }

  textTabScrollPositionMap.set(tabPath, {
    top: element.scrollTop,
    left: element.scrollLeft
  });
}

export function TextTabPane({
  tabPath,
  content,
  active,
  onTextChange,
  onSaveShortcut
}) {
  const hostRef = React.useRef(null);
  const editorViewRef = React.useRef(null);
  const scrollElementRef = React.useRef(null);
  const activeRef = React.useRef(active);
  const onTextChangeRef = React.useRef(onTextChange);
  const onSaveShortcutRef = React.useRef(onSaveShortcut);
  const lastExternalValueRef = React.useRef(normalizeEditorText(content));
  const [findOpen, setFindOpen] = React.useState(false);
  const [findQuery, setFindQuery] = React.useState("");
  const [activeMatchIndex, setActiveMatchIndex] = React.useState(-1);
  const [findJumpToken, setFindJumpToken] = React.useState(0);
  const normalizedContent = React.useMemo(() => normalizeEditorText(content), [content]);
  const matches = React.useMemo(() => findMatches(normalizedContent, findQuery), [findQuery, normalizedContent]);

  React.useEffect(() => {
    lastExternalValueRef.current = normalizedContent;
  }, [normalizedContent]);

  React.useEffect(() => {
    activeRef.current = active;
  }, [active]);

  React.useEffect(() => {
    onTextChangeRef.current = onTextChange;
  }, [onTextChange]);

  React.useEffect(() => {
    onSaveShortcutRef.current = onSaveShortcut;
  }, [onSaveShortcut]);

  React.useEffect(() => {
    if (!hostRef.current || editorViewRef.current) {
      return;
    }

    const saveKeymap = {
      key: "Mod-s",
      run: () => {
        onSaveShortcutRef.current?.();
        return true;
      }
    };

    const findKeymap = {
      key: "Mod-f",
      run: () => {
        setFindOpen(true);
        return true;
      }
    };

    const escapeKeymap = {
      key: "Escape",
      run: () => {
        setFindOpen(false);
        return false;
      }
    };

    const state = EditorState.create({
      doc: lastExternalValueRef.current,
      extensions: [
        ...createSimpleLineNumbers(),
        history(),
        currentMatchField,
        syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
        syntaxHighlighting(strongerHighlightStyle),
        ...getLanguageExtension(tabPath),
        keymap.of([saveKeymap, findKeymap, escapeKeymap, indentWithTab, ...defaultKeymap, ...historyKeymap]),
        EditorView.updateListener.of((update) => {
          if (!update.docChanged) {
            return;
          }

          const value = update.state.doc.toString();
          lastExternalValueRef.current = value;
          onTextChangeRef.current(tabPath, value);
        }),
        createEditorTheme()
      ]
    });

    editorViewRef.current = new EditorView({
      state,
      parent: hostRef.current
    });

    const scrollElement = editorViewRef.current.scrollDOM;
    scrollElementRef.current = scrollElement;
    const handleScroll = () => {
      if (!activeRef.current) {
        return;
      }
      storeScrollPosition(tabPath, scrollElement);
    };
    scrollElement.addEventListener("scroll", handleScroll, { passive: true });
    const restoreInitialPosition = () => {
      const initialPosition = getStoredScrollPosition(tabPath);
      scrollElement.scrollTop = initialPosition.top;
      scrollElement.scrollLeft = initialPosition.left;
    };
    restoreInitialPosition();
    const frameId = window.requestAnimationFrame(restoreInitialPosition);

    return () => {
      window.cancelAnimationFrame(frameId);
      storeScrollPosition(tabPath, scrollElement);
      scrollElement.removeEventListener("scroll", handleScroll);
      scrollElementRef.current = null;
      editorViewRef.current?.destroy();
      editorViewRef.current = null;
    };
  }, [tabPath]);

  React.useEffect(() => {
    const view = editorViewRef.current;
    if (!view) {
      return;
    }

    const currentValue = view.state.doc.toString();
    if (currentValue === normalizedContent) {
      return;
    }

    view.dispatch({
      changes: {
        from: 0,
        to: currentValue.length,
        insert: normalizedContent
      }
    });
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
    const view = editorViewRef.current;
    if (!view) {
      return;
    }

    if (!findOpen || !target || activeMatchIndex < 0) {
      view.dispatch({
        effects: setCurrentMatchEffect.of(null)
      });
      return;
    }

    if (findJumpToken === 0) {
      view.dispatch({
        effects: setCurrentMatchEffect.of({
          from: target.start,
          to: target.end
        })
      });
      return;
    }

    view.dispatch({
      effects: setCurrentMatchEffect.of({
        from: target.start,
        to: target.end
      }),
      selection: EditorSelection.single(target.start, target.end),
      scrollIntoView: true
    });
    view.focus();
  }, [activeMatchIndex, findJumpToken, findOpen, matches]);

  React.useEffect(() => {
    if (!active) {
      setFindOpen(false);
      storeScrollPosition(tabPath, scrollElementRef.current);
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
        <div
          ref={hostRef}
          className="editor-content editor-content--codemirror"
        />
      </div>
    </div>
  );
}
