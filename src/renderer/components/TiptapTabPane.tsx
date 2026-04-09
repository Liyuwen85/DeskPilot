import React from "react";
import Image from "@tiptap/extension-image";
import { TaskItem, TaskList } from "@tiptap/extension-list";
import Mathematics from "@tiptap/extension-mathematics";
import { EditorContent, useEditor } from "@tiptap/react";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import { marked } from "marked";
import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";
import { FindPanel } from "./FindPanel";
import { UI_TEXT } from "../ui-text";

interface MarkdownDraftPayload {
  html: string;
  text: string;
  isDirty: boolean;
}

export interface TiptapOutlineItem {
  id: string;
  level: number;
  text: string;
  pos: number;
}

export interface TiptapOutlineApi {
  scrollToItem: (itemId: string) => void;
}

export interface TiptapCommandApi {
  toggleBold: () => void;
  toggleItalic: () => void;
  toggleUnderline: () => void;
  toggleStrike: () => void;
  toggleInlineCode: () => void;
  toggleBulletList: () => void;
  toggleOrderedList: () => void;
  toggleTaskList: () => void;
  toggleBlockquote: () => void;
  toggleCodeBlock: () => void;
  clearFormatting: () => void;
  toggleHeading: (level: number) => void;
  insertHorizontalRule: () => void;
  insertInlineMath: () => void;
  insertBlockMath: () => void;
  insertImageFromFile: () => Promise<void>;
}

interface ImagePreviewState {
  pos: number;
  src: string;
  alt: string;
  title: string;
}

type MathNodeType = "inlineMath" | "blockMath";

interface MathEditorState {
  type: MathNodeType;
  latex: string;
  pos: number | null;
}

interface StoredSelection {
  anchor: number;
  head: number;
}

interface MathSelectionTarget {
  type: MathNodeType;
  latex: string;
  pos: number;
}

interface CodeBlockOverlayItem {
  id: string;
  top: number;
  left: number;
  text: string;
}

function getElementOffsetWithinAncestor(element: HTMLElement, ancestor: HTMLElement) {
  let top = 0;
  let left = 0;
  let current: HTMLElement | null = element;

  while (current && current !== ancestor) {
    top += current.offsetTop;
    left += current.offsetLeft;
    current = current.offsetParent as HTMLElement | null;
  }

  return { top, left };
}

function getTextFromNode(node: ProseMirrorNode): string {
  const parts: string[] = [];
  node.descendants((descendant) => {
    if (descendant.isText && descendant.text) {
      parts.push(descendant.text);
    }
  });
  return parts.join("").trim();
}

function getOutlineFromDocument(doc: ProseMirrorNode): TiptapOutlineItem[] {
  const items: TiptapOutlineItem[] = [];
  doc.descendants((node, pos) => {
    if (node.type.name !== "heading") {
      return;
    }

    const level = Number(node.attrs.level) || 1;
    const text = getTextFromNode(node);
    items.push({
      id: `heading-${pos}`,
      level,
      text: text || `Heading ${items.length + 1}`,
      pos
    });
  });
  return items;
}

function getDirectoryPath(filePath: string): string {
  return String(filePath || "").replace(/[\\/][^\\/]*$/, "");
}

function toRelativePath(targetPath: string, fromDirectory: string): string {
  const normalizedTarget = String(targetPath || "").replace(/\\/g, "/");
  const normalizedBase = String(fromDirectory || "").replace(/\\/g, "/");
  const targetParts = normalizedTarget.split("/").filter(Boolean);
  const baseParts = normalizedBase.split("/").filter(Boolean);

  if (targetParts.length > 0 && baseParts.length > 0 && targetParts[0].toLowerCase() !== baseParts[0].toLowerCase()) {
    return targetPath;
  }

  let sharedIndex = 0;
  while (
    sharedIndex < targetParts.length
    && sharedIndex < baseParts.length
    && targetParts[sharedIndex].toLowerCase() === baseParts[sharedIndex].toLowerCase()
  ) {
    sharedIndex += 1;
  }

  const upwardParts = baseParts.slice(sharedIndex).map(() => "..");
  const downwardParts = targetParts.slice(sharedIndex);
  return [...upwardParts, ...downwardParts].join("/") || ".";
}

function joinPath(basePath: string, relativePath: string): string {
  const normalizedBase = String(basePath || "").replace(/\\/g, "/");
  const normalizedRelative = String(relativePath || "").replace(/\\/g, "/");
  const baseParts = normalizedBase.split("/").filter(Boolean);
  const relativeParts = normalizedRelative.split("/");
  const resolvedParts = [...baseParts];

  for (const part of relativeParts) {
    if (!part || part === ".") {
      continue;
    }

    if (part === "..") {
      resolvedParts.pop();
      continue;
    }

    resolvedParts.push(part);
  }

  const hasDriveLetter = /^[a-zA-Z]:$/.test(resolvedParts[0] || "");
  if (hasDriveLetter) {
    return `${resolvedParts[0]}\\${resolvedParts.slice(1).join("\\")}`;
  }

  return `/${resolvedParts.join("/")}`;
}

function toFileUrl(targetPath: string): string {
  const normalized = String(targetPath || "").replace(/\\/g, "/");
  if (/^[a-zA-Z]:\//.test(normalized)) {
    return `file:///${encodeURI(normalized)}`;
  }

  return `file://${encodeURI(normalized)}`;
}

function resolveImageSource(src: string, tabPath: string): string {
  const value = String(src || "").trim();
  if (!value || /^(https?:|file:|data:|blob:|app:)/i.test(value)) {
    return value;
  }

  if (!tabPath || tabPath.startsWith("untitled:")) {
    return value;
  }

  const baseDirectory = getDirectoryPath(tabPath);
  if (!baseDirectory) {
    return value;
  }

  if (/^[a-zA-Z]:[\\/]/.test(value)) {
    return toFileUrl(value);
  }

  if (value.startsWith("/")) {
    return value;
  }

  return toFileUrl(joinPath(baseDirectory, value));
}

function getPreviewImageSource(src: string, tabPath: string): string {
  return resolveImageSource(src, tabPath);
}

function resolveHtmlImageSources(html: string, tabPath: string): string {
  if (typeof window === "undefined" || !html) {
    return html;
  }

  const parser = new window.DOMParser();
  const document = parser.parseFromString(html, "text/html");
  const images = Array.from(document.querySelectorAll("img[src]"));

  for (const image of images) {
    const currentSrc = image.getAttribute("src");
    if (!currentSrc) {
      continue;
    }

    image.setAttribute("src", resolveImageSource(currentSrc, tabPath));
  }

  return document.body.innerHTML;
}

function clampSelection(selection: StoredSelection, docSize: number): StoredSelection {
  return {
    anchor: Math.max(0, Math.min(selection.anchor, docSize)),
    head: Math.max(0, Math.min(selection.head, docSize))
  };
}

function getMathSelectionTarget(
  doc: ProseMirrorNode,
  selection: StoredSelection | null | undefined
): MathSelectionTarget | null {
  if (!selection) {
    return null;
  }

  const positions = Array.from(new Set([selection.anchor, selection.head]));
  for (const pos of positions) {
    const node = doc.nodeAt(pos);
    if (!node) {
      continue;
    }

    if (node.type.name === "inlineMath" || node.type.name === "blockMath") {
      return {
        type: node.type.name,
        latex: String(node.attrs.latex || ""),
        pos
      };
    }
  }

  return null;
}

interface TiptapTabPaneProps {
  tabPath: string;
  markdown: string;
  draftHtml?: string | null;
  active: boolean;
  onTextChange: (tabPath: string, value: MarkdownDraftPayload) => void;
  onSaveShortcut?: () => void;
  onOutlineChange?: (tabPath: string, items: TiptapOutlineItem[]) => void;
  onOutlineApiReady?: (tabPath: string, api: TiptapOutlineApi | null) => void;
  onCommandApiReady?: (tabPath: string, api: TiptapCommandApi | null) => void;
}

export function TiptapTabPane({
  tabPath,
  markdown,
  draftHtml,
  active,
  onTextChange,
  onSaveShortcut,
  onOutlineChange,
  onOutlineApiReady,
  onCommandApiReady
}: TiptapTabPaneProps) {
  const resolvedHtml = React.useMemo(
    () => resolveHtmlImageSources(draftHtml ?? marked.parse(markdown || ""), tabPath),
    [draftHtml, markdown, tabPath]
  );
  const lastSyncedHtmlRef = React.useRef(resolvedHtml);
  const lastSyncedDocJsonRef = React.useRef<string>("");
  const isHydratingRef = React.useRef(true);
  const editorRef = React.useRef<any>(null);
  const lastKnownSelectionRef = React.useRef<StoredSelection | null>(null);
  const [imagePreview, setImagePreview] = React.useState<ImagePreviewState | null>(null);
  const [imageEditSrc, setImageEditSrc] = React.useState("");
  const [imageEditAlt, setImageEditAlt] = React.useState("");
  const [imageEditTitle, setImageEditTitle] = React.useState("");
  const [mathEditor, setMathEditor] = React.useState<MathEditorState | null>(null);
  const [mathLatex, setMathLatex] = React.useState("");
  const [copiedCodeBlockId, setCopiedCodeBlockId] = React.useState<string | null>(null);
  const [copyHintId, setCopyHintId] = React.useState<string | null>(null);
  const [codeBlockOverlays, setCodeBlockOverlays] = React.useState<CodeBlockOverlayItem[]>([]);
  const [findOpen, setFindOpen] = React.useState(false);
  const [findQuery, setFindQuery] = React.useState("");
  const [findMatchIndex, setFindMatchIndex] = React.useState(-1);
  const [findMatchCount, setFindMatchCount] = React.useState(0);
  const [findJumpToken, setFindJumpToken] = React.useState(0);
  const copyResetTimerRef = React.useRef<number | null>(null);
  const editorBodyRef = React.useRef<HTMLDivElement | null>(null);
  const findMatchesRef = React.useRef<Array<{ from: number; to: number }>>([]);

  const syncLastSavedSnapshot = React.useCallback((nextEditor: { getHTML: () => string; getJSON: () => unknown }) => {
    lastSyncedHtmlRef.current = nextEditor.getHTML();
    lastSyncedDocJsonRef.current = JSON.stringify(nextEditor.getJSON());
  }, []);

  const handleSaveKeyDownCapture = React.useCallback((event: React.KeyboardEvent<HTMLDivElement>) => {
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

  const handleLinkClickCapture = React.useCallback((event: React.MouseEvent<HTMLDivElement>) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) {
      return;
    }

    const linkElement = target.closest("a[href]");
    if (!(linkElement instanceof HTMLAnchorElement)) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    void window.desktopApi.openExternalUrl(linkElement.href);
  }, []);

  const syncCodeBlockCopyButtons = React.useCallback(() => {
    const rootElement = editorRef.current?.view.dom;
    if (!(rootElement instanceof HTMLElement)) {
      return;
    }

    const codeBlocks = Array.from(rootElement.querySelectorAll("pre"));
    codeBlocks.forEach((block, index) => {
      if (!(block instanceof HTMLElement)) {
        return;
      }

      const blockId = block.dataset.codeCopyId || `code-block-${index + 1}`;
      block.dataset.codeCopyId = blockId;

      let button = block.querySelector(".code-copy-button");
      if (!(button instanceof HTMLButtonElement)) {
        button = document.createElement("button");
        button.type = "button";
        button.className = "code-copy-button";
        button.dataset.codeCopyTarget = blockId;
        block.appendChild(button);
      }

      button.textContent = copiedCodeBlockId === blockId ? "已复制" : "复制";
    });
  }, [copiedCodeBlockId]);

  const handleCopyCodeBlock = React.useCallback(async (codeBlockId: string) => {
    if (!codeBlockId) {
      return;
    }

    const targetOverlay = codeBlockOverlays.find((item) => item.id === codeBlockId);
    const text = String(targetOverlay?.text || "").trimEnd();
    if (!text) {
      return;
    }

    try {
      const result = await window.desktopApi.writeClipboardText(text);
      if (!result?.ok) {
        await navigator.clipboard.writeText(text);
      }

      setCopiedCodeBlockId(codeBlockId);
      setCopyHintId(codeBlockId);
      if (copyResetTimerRef.current) {
        window.clearTimeout(copyResetTimerRef.current);
      }
      copyResetTimerRef.current = window.setTimeout(() => {
        setCopiedCodeBlockId((current) => (current === codeBlockId ? null : current));
        setCopyHintId((current) => (current === codeBlockId ? null : current));
        copyResetTimerRef.current = null;
      }, 1600);
    } catch {
      setCopyHintId(null);
    }
  }, [codeBlockOverlays]);

  const closeImagePreview = React.useCallback(() => {
    setImagePreview(null);
    setImageEditSrc("");
    setImageEditAlt("");
    setImageEditTitle("");
  }, []);

  const closeMathEditor = React.useCallback(() => {
    setMathEditor(null);
    setMathLatex("");
  }, []);

  const openMathEditor = React.useCallback((nextState: MathEditorState) => {
    setMathEditor(nextState);
    setMathLatex(nextState.latex);
  }, []);

  React.useEffect(() => {
    lastSyncedHtmlRef.current = resolvedHtml;
    lastSyncedDocJsonRef.current = "";
    isHydratingRef.current = true;
  }, [tabPath, resolvedHtml]);

  React.useEffect(() => {
    if (!imagePreview && !mathEditor) {
      return;
    }

    function handleEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        closeImagePreview();
        closeMathEditor();
      }
    }

    window.addEventListener("keydown", handleEscape);
    return () => window.removeEventListener("keydown", handleEscape);
  }, [closeImagePreview, closeMathEditor, imagePreview, mathEditor]);

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
    return () => {
      if (copyResetTimerRef.current) {
        window.clearTimeout(copyResetTimerRef.current);
      }
    };
  }, []);

  const emitOutline = React.useCallback((nextDoc: ProseMirrorNode) => {
    onOutlineChange?.(tabPath, getOutlineFromDocument(nextDoc));
  }, [onOutlineChange, tabPath]);

  const rememberSelection = React.useCallback((anchor: number, head: number) => {
    lastKnownSelectionRef.current = { anchor, head };
  }, []);

  // Keep the editor instance stable. Recreating it from external draft updates
  // causes the "one character at a time" regression because every keystroke
  // feeds back into parent state and would rebuild the editor.
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        link: {
          openOnClick: false,
          autolink: true,
          linkOnPaste: true
        }
      }),
      Image,
      TaskList,
      TaskItem.configure({
        nested: true
      }),
      Mathematics.configure({
        inlineOptions: {
          onClick: (node, pos) => {
            rememberSelection(pos, pos);
            openMathEditor({
              type: "inlineMath",
              latex: String(node.attrs.latex || ""),
              pos
            });
          }
        },
        blockOptions: {
          onClick: (node, pos) => {
            rememberSelection(pos, pos);
            openMathEditor({
              type: "blockMath",
              latex: String(node.attrs.latex || ""),
              pos
            });
          }
        },
        katexOptions: {
          throwOnError: false,
          strict: "ignore"
        }
      }),
      Placeholder.configure({
        placeholder: UI_TEXT.editor.markdownPlaceholder
      })
    ],
    content: resolvedHtml,
    immediatelyRender: false,
    editorProps: {
      attributes: {
        spellcheck: "false",
        autocorrect: "off",
        autocapitalize: "off",
        autocomplete: "off"
      },
      handleKeyDown: (_view, event) => {
        const key = String(event.key || "").toLowerCase();
        if ((event.ctrlKey || event.metaKey) && key === "s") {
          event.preventDefault();
          event.stopPropagation();
          onSaveShortcut?.();
          return true;
        }

        return false;
      }
    },
    onUpdate: ({ editor: nextEditor, transaction }) => {
      if (!transaction.docChanged) {
        return;
      }

      if (isHydratingRef.current || !lastSyncedDocJsonRef.current) {
        syncLastSavedSnapshot(nextEditor);
        isHydratingRef.current = false;
        emitOutline(nextEditor.state.doc);
        return;
      }

      const isPointerNormalization = Boolean(transaction.getMeta("pointer")) && !transaction.getMeta("uiEvent");
      if (isPointerNormalization) {
        syncLastSavedSnapshot(nextEditor);
        return;
      }

      const nextHtml = nextEditor.getHTML();
      const nextDocJson = JSON.stringify(nextEditor.getJSON());
      emitOutline(nextEditor.state.doc);
      queueMicrotask(() => refreshCodeBlockOverlays());
      onTextChange(tabPath, {
        html: nextHtml,
        text: nextEditor.getText({ blockSeparator: "\n" }),
        isDirty: nextDocJson !== lastSyncedDocJsonRef.current
      });
    },
    onCreate: ({ editor: nextEditor }) => {
      syncLastSavedSnapshot(nextEditor);
      isHydratingRef.current = false;
      queueMicrotask(() => refreshCodeBlockOverlays());
    },
    onSelectionUpdate: ({ editor: nextEditor }) => {
      const { anchor, head } = nextEditor.state.selection;
      rememberSelection(anchor, head);
    },
    onFocus: ({ editor: nextEditor }) => {
      const { anchor, head } = nextEditor.state.selection;
      rememberSelection(anchor, head);
    },
    onBlur: ({ editor: nextEditor }) => {
      const { anchor, head } = nextEditor.state.selection;
      rememberSelection(anchor, head);
    }
  });

  React.useEffect(() => {
    editorRef.current = editor;
    return () => {
      if (editorRef.current === editor) {
        editorRef.current = null;
      }
    };
  }, [editor]);

  const refreshCodeBlockOverlays = React.useCallback(() => {
    const rootElement = editorRef.current?.view.dom;
    const bodyElement = editorBodyRef.current;
    if (!(rootElement instanceof HTMLElement) || !(bodyElement instanceof HTMLElement)) {
      setCodeBlockOverlays([]);
      return;
    }

    const codeBlocks = Array.from(rootElement.querySelectorAll("pre"));
    const nextOverlays: CodeBlockOverlayItem[] = [];

    codeBlocks.forEach((block, index) => {
      if (!(block instanceof HTMLElement)) {
        return;
      }

      const blockId = block.dataset.codeCopyId || `code-block-${index + 1}`;
      block.dataset.codeCopyId = blockId;
      const offset = getElementOffsetWithinAncestor(block, bodyElement);
      const codeElement = block.querySelector("code");
      const text = (codeElement?.textContent || block.textContent || "").trimEnd();

      nextOverlays.push({
        id: blockId,
        top: Math.max(8, offset.top + 10),
        left: Math.max(56, offset.left + block.offsetWidth - 12),
        text
      });
    });

    setCodeBlockOverlays((previous) => (
      JSON.stringify(previous) === JSON.stringify(nextOverlays) ? previous : nextOverlays
    ));
  }, []);

  const refreshFindMatches = React.useCallback((query: string) => {
    if (!editor) {
      findMatchesRef.current = [];
      setFindMatchIndex(-1);
      setFindMatchCount(0);
      return 0;
    }

    const normalizedQuery = String(query || "").trim().toLowerCase();
    if (!normalizedQuery) {
      findMatchesRef.current = [];
      setFindMatchIndex(-1);
      setFindMatchCount(0);
      return 0;
    }

    const nextMatches: Array<{ from: number; to: number }> = [];
    editor.state.doc.descendants((node, pos) => {
      if (!node.isText || !node.text) {
        return;
      }

      const lowerText = node.text.toLowerCase();
      let searchIndex = 0;
      while (searchIndex <= lowerText.length) {
        const index = lowerText.indexOf(normalizedQuery, searchIndex);
        if (index === -1) {
          break;
        }

        nextMatches.push({
          from: pos + index,
          to: pos + index + normalizedQuery.length
        });
        searchIndex = index + Math.max(1, normalizedQuery.length);
      }
    });

    findMatchesRef.current = nextMatches;
    setFindMatchIndex(-1);
    setFindMatchCount(nextMatches.length);
    return nextMatches.length;
  }, [editor]);

  React.useEffect(() => {
    refreshFindMatches(findQuery);
  }, [findQuery, refreshFindMatches, resolvedHtml]);

  React.useEffect(() => {
    if (!editor || findJumpToken === 0 || findMatchIndex < 0) {
      return;
    }

    const target = findMatchesRef.current[findMatchIndex];
    if (!target) {
      return;
    }

    editor.chain().focus().setTextSelection({ from: target.from, to: target.to }).scrollIntoView().run();
  }, [editor, findJumpToken, findMatchIndex]);

  const handlePrevFindMatch = React.useCallback(() => {
    const total = findMatchesRef.current.length;
    if (total === 0) {
      return;
    }
    setFindJumpToken((previous) => previous + 1);
    setFindMatchIndex((previous) => (
      previous < 0 ? total - 1 : (previous - 1 + total) % total
    ));
  }, []);

  const handleNextFindMatch = React.useCallback(() => {
    const total = findMatchesRef.current.length;
    if (total === 0) {
      return;
    }
    setFindJumpToken((previous) => previous + 1);
    setFindMatchIndex((previous) => (
      previous < 0 ? 0 : (previous + 1) % total
    ));
  }, []);

  const getCommandChain = React.useCallback(() => {
    if (!editor) {
      return null;
    }

    const docSize = editor.state.doc.content.size;
    const storedSelection = lastKnownSelectionRef.current;
    const fallback = { anchor: docSize, head: docSize };
    const { anchor, head } = clampSelection(storedSelection || fallback, docSize);

    return editor
      .chain()
      .focus()
      .setTextSelection({ from: anchor, to: head });
  }, [editor]);

  const handleImageClickCapture = React.useCallback((event: React.MouseEvent<HTMLDivElement>) => {
    if (!editor) {
      return;
    }

    const target = event.target;
    if (!(target instanceof HTMLElement)) {
      return;
    }

    const imageElement = target.closest("img");
    if (!(imageElement instanceof HTMLImageElement)) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();

    const position = editor.view.posAtDOM(imageElement, 0);
    editor.chain().focus().setNodeSelection(position).run();

    const nextState = {
      pos: position,
      src: imageElement.getAttribute("src") || "",
      alt: imageElement.getAttribute("alt") || "",
      title: imageElement.getAttribute("title") || ""
    };

    setImagePreview(nextState);
    setImageEditSrc(nextState.src);
    setImageEditAlt(nextState.alt);
    setImageEditTitle(nextState.title);
  }, [editor]);

  const handleBodyClickCapture = React.useCallback((event: React.MouseEvent<HTMLDivElement>) => {
    const target = event.target;
    if (target instanceof HTMLElement) {
      const copyButton = target.closest(".code-copy-button");
      if (copyButton instanceof HTMLButtonElement) {
        return;
      }
    }

    if (target instanceof HTMLElement && target.closest("img")) {
      handleImageClickCapture(event);
      return;
    }

    handleLinkClickCapture(event);
  }, [handleImageClickCapture, handleLinkClickCapture]);

  const handleBodyMouseDownCapture = React.useCallback((event: React.MouseEvent<HTMLDivElement>) => {
    const target = event.target;
    if (target instanceof HTMLElement && target.closest(".code-copy-button")) {
      event.preventDefault();
      event.stopPropagation();
    }
  }, []);

  React.useEffect(() => {
    if (!editor) {
      return;
    }

    emitOutline(editor.state.doc);
    queueMicrotask(() => refreshCodeBlockOverlays());
    onOutlineApiReady?.(tabPath, {
      scrollToItem: (itemId: string) => {
        const targetPos = Number(String(itemId).replace("heading-", ""));
        if (!Number.isFinite(targetPos)) {
          return;
        }

        const targetElement = editor.view.nodeDOM(targetPos);
        if (!(targetElement instanceof HTMLElement)) {
          return;
        }

        editor.commands.focus(targetPos);
        targetElement.scrollIntoView({
          behavior: "smooth",
          block: "center"
        });
      }
    });

    return () => {
      onOutlineApiReady?.(tabPath, null);
    };
  }, [editor, emitOutline, onOutlineApiReady, refreshCodeBlockOverlays, tabPath]);

  React.useEffect(() => {
    if (!editor) {
      return;
    }

    syncLastSavedSnapshot(editor);
    isHydratingRef.current = false;
  }, [editor, syncLastSavedSnapshot]);

  React.useEffect(() => {
    if (!editor) {
      return;
    }

    const rootElement = editor.view.dom;
    if (!(rootElement instanceof HTMLElement)) {
      return;
    }

    const handleLayoutChange = () => {
      refreshCodeBlockOverlays();
    };

    rootElement.addEventListener("scroll", handleLayoutChange, { passive: true });
    window.addEventListener("resize", handleLayoutChange);
    queueMicrotask(handleLayoutChange);

    return () => {
      rootElement.removeEventListener("scroll", handleLayoutChange);
      window.removeEventListener("resize", handleLayoutChange);
    };
  }, [editor, refreshCodeBlockOverlays]);

  React.useEffect(() => {
    if (!editor) {
      return;
    }

    if (resolvedHtml === lastSyncedHtmlRef.current) {
      return;
    }

    isHydratingRef.current = true;
    editor.commands.setContent(resolvedHtml, false);
    syncLastSavedSnapshot(editor);
    isHydratingRef.current = false;
    emitOutline(editor.state.doc);
    queueMicrotask(() => refreshCodeBlockOverlays());
  }, [editor, emitOutline, refreshCodeBlockOverlays, resolvedHtml, syncLastSavedSnapshot]);

  React.useEffect(() => {
    return () => {
      if (editor && !editor.isDestroyed) {
        editor.destroy();
      }
    };
  }, [editor]);

  const handleImageSave = React.useCallback(() => {
    if (!editor || !imagePreview) {
      return;
    }

    const nextSrc = resolveImageSource(imageEditSrc.trim(), tabPath);
    if (!nextSrc) {
      return;
    }

    editor
      .chain()
      .focus()
      .setNodeSelection(imagePreview.pos)
      .updateAttributes("image", {
        src: nextSrc,
        alt: imageEditAlt.trim() || null,
        title: imageEditTitle.trim() || null
      })
      .run();

    setImagePreview({
      pos: imagePreview.pos,
      src: nextSrc,
      alt: imageEditAlt.trim(),
      title: imageEditTitle.trim()
    });
    setImageEditSrc(nextSrc);
  }, [editor, imageEditAlt, imageEditSrc, imageEditTitle, imagePreview, tabPath]);

  const handleImageRemove = React.useCallback(() => {
    if (!editor || !imagePreview) {
      return;
    }

    editor.chain().focus().setNodeSelection(imagePreview.pos).deleteSelection().run();
    closeImagePreview();
  }, [closeImagePreview, editor, imagePreview]);

  const handlePickLocalImage = React.useCallback(async () => {
    const currentImagePath = imageEditSrc.replace(/^file:\/\/\/?/i, "").replace(/\//g, "\\");
    const defaultDirectory = getDirectoryPath(currentImagePath || tabPath);
    const selectedPath = await window.desktopApi.pickImageFile(defaultDirectory);

    if (!selectedPath) {
      return;
    }

    const markdownDirectory = getDirectoryPath(tabPath);
    setImageEditSrc(markdownDirectory ? toRelativePath(selectedPath, markdownDirectory) : selectedPath);
  }, [imageEditSrc, tabPath]);

  const handleInsertImageFromFile = React.useCallback(async () => {
    if (!editor) {
      return;
    }

    const selectedPath = await window.desktopApi.pickImageFile(getDirectoryPath(tabPath));
    if (!selectedPath) {
      return;
    }

    const markdownDirectory = getDirectoryPath(tabPath);
    const nextPath = markdownDirectory ? toRelativePath(selectedPath, markdownDirectory) : selectedPath;
    const chain = getCommandChain();
    if (!chain) {
      return;
    }
    chain.setImage({ src: resolveImageSource(nextPath, tabPath) }).run();
  }, [editor, getCommandChain, tabPath]);

  const handleOpenMathEditor = React.useCallback((type: MathNodeType) => {
    if (!editor) {
      return;
    }

    const existingMath = getMathSelectionTarget(editor.state.doc, lastKnownSelectionRef.current);
    if (existingMath) {
      editor.chain().focus().setNodeSelection(existingMath.pos).run();
      rememberSelection(existingMath.pos, existingMath.pos);
      openMathEditor(existingMath);
      return;
    }

    openMathEditor({
      type,
      latex: type === "inlineMath" ? "x^2" : "\\sum_{i=1}^{n} x_i",
      pos: null
    });
  }, [editor, openMathEditor, rememberSelection]);

  const handleMathSave = React.useCallback(() => {
    if (!editor || !mathEditor) {
      return;
    }

    const nextLatex = mathLatex.trim();
    if (!nextLatex) {
      return;
    }

    const existingMath = getMathSelectionTarget(editor.state.doc, lastKnownSelectionRef.current);
    if (existingMath) {
      editor.chain().focus().setNodeSelection(existingMath.pos).run();
      const updateResult = existingMath.type === "inlineMath"
        ? editor.commands.updateInlineMath({ latex: nextLatex, pos: existingMath.pos })
        : editor.commands.updateBlockMath({ latex: nextLatex, pos: existingMath.pos });

      if (updateResult) {
        rememberSelection(existingMath.pos, existingMath.pos);
        closeMathEditor();
        return;
      }
    }

    const chain = getCommandChain();
    if (!chain) {
      return;
    }

    if (mathEditor.type === "inlineMath") {
      chain.insertInlineMath({ latex: nextLatex }).run();
    } else {
      chain.insertBlockMath({ latex: nextLatex }).run();
    }

    closeMathEditor();
  }, [closeMathEditor, editor, getCommandChain, mathEditor, mathLatex, rememberSelection]);

  React.useEffect(() => {
    if (!editor) {
      return;
    }

    onCommandApiReady?.(tabPath, {
      toggleBold: () => {
        const chain = getCommandChain();
        if (!chain) {
          return;
        }
        chain.toggleBold().run();
      },
      toggleItalic: () => {
        const chain = getCommandChain();
        if (!chain) {
          return;
        }
        chain.toggleItalic().run();
      },
      toggleUnderline: () => {
        const chain = getCommandChain();
        if (!chain) {
          return;
        }
        chain.toggleUnderline().run();
      },
      toggleStrike: () => {
        const chain = getCommandChain();
        if (!chain) {
          return;
        }
        chain.toggleStrike().run();
      },
      toggleInlineCode: () => {
        const chain = getCommandChain();
        if (!chain) {
          return;
        }
        chain.toggleCode().run();
      },
      toggleBulletList: () => {
        const chain = getCommandChain();
        if (!chain) {
          return;
        }
        chain.toggleBulletList().run();
      },
      toggleOrderedList: () => {
        const chain = getCommandChain();
        if (!chain) {
          return;
        }
        chain.toggleOrderedList().run();
      },
      toggleTaskList: () => {
        const chain = getCommandChain();
        if (!chain) {
          return;
        }
        chain.toggleTaskList().run();
      },
      toggleBlockquote: () => {
        const chain = getCommandChain();
        if (!chain) {
          return;
        }
        chain.toggleBlockquote().run();
      },
      toggleCodeBlock: () => {
        const chain = getCommandChain();
        if (!chain) {
          return;
        }
        chain.toggleCodeBlock().run();
      },
      clearFormatting: () => {
        const chain = getCommandChain();
        if (!chain) {
          return;
        }
        chain.unsetAllMarks().clearNodes().run();
      },
      toggleHeading: (level: number) => {
        const chain = getCommandChain();
        if (!chain) {
          return;
        }
        chain.toggleHeading({ level: Math.max(1, Math.min(6, level)) as 1 | 2 | 3 | 4 | 5 | 6 }).run();
      },
      insertHorizontalRule: () => {
        const chain = getCommandChain();
        if (!chain) {
          return;
        }
        chain.setHorizontalRule().run();
      },
      insertInlineMath: () => {
        handleOpenMathEditor("inlineMath");
      },
      insertBlockMath: () => {
        handleOpenMathEditor("blockMath");
      },
      insertImageFromFile: async () => {
        await handleInsertImageFromFile();
      }
    });

    return () => {
      onCommandApiReady?.(tabPath, null);
    };
  }, [editor, getCommandChain, handleInsertImageFromFile, handleOpenMathEditor, onCommandApiReady, tabPath]);

  return (
    <div className={`editor-shell editor-shell--tiptap ${active ? "" : "editor-shell--hidden"}`}>
      <FindPanel
        visible={findOpen}
        query={findQuery}
        currentIndex={findMatchIndex}
        totalCount={findMatchCount}
        onQueryChange={(value) => {
          setFindQuery(value);
          setFindMatchIndex(-1);
          setFindJumpToken(0);
        }}
        onPrev={handlePrevFindMatch}
        onNext={handleNextFindMatch}
        onClose={() => setFindOpen(false)}
      />
      <div
        ref={editorBodyRef}
        className="editor-body"
        onMouseDownCapture={handleBodyMouseDownCapture}
        onClickCapture={handleBodyClickCapture}
        onKeyDownCapture={handleSaveKeyDownCapture}
      >
        {codeBlockOverlays.map((item) => (
          <React.Fragment key={item.id}>
            <button
              type="button"
            className="code-copy-button"
            style={{
              top: `${item.top}px`,
              left: `${item.left}px`,
              transform: "translateX(-100%)"
            }}
            data-code-copy-target={item.id}
            onMouseDown={(event) => {
              event.preventDefault();
              event.stopPropagation();
            }}
              onClick={(event) => {
                event.preventDefault();
                event.stopPropagation();
                void handleCopyCodeBlock(item.id);
              }}
            >
              {copiedCodeBlockId === item.id ? "已复制" : "复制"}
            </button>
            {copyHintId === item.id ? (
              <div
                className="code-copy-hint"
                style={{
                  top: `${item.top + 34}px`,
                  left: `${item.left}px`,
                  transform: "translateX(-100%)"
                }}
              >
                代码已复制
              </div>
            ) : null}
          </React.Fragment>
        ))}
        <EditorContent editor={editor} className="editor-content editor-content--tiptap" />
      </div>
      {imagePreview ? (
        <div className="image-preview" role="dialog" aria-modal="true" aria-label="图片预览">
          <button type="button" className="image-preview__backdrop" onClick={closeImagePreview} aria-label="关闭图片预览" />
          <div className="image-preview__panel">
            <div className="image-preview__media-wrap">
              <img
                className="image-preview__media"
                src={getPreviewImageSource(imageEditSrc || imagePreview.src, tabPath)}
                alt={imageEditAlt || imagePreview.alt || "预览图片"}
              />
            </div>
            <div className="image-preview__editor">
              <label className="image-preview__field">
                <span>图片路径</span>
                <input
                  type="text"
                  value={imageEditSrc}
                  onChange={(event) => setImageEditSrc(event.target.value)}
                  placeholder="输入图片路径"
                />
              </label>
              <label className="image-preview__field">
                <span>Alt 文本</span>
                <input
                  type="text"
                  value={imageEditAlt}
                  onChange={(event) => setImageEditAlt(event.target.value)}
                  placeholder="输入替代文本"
                />
              </label>
              <label className="image-preview__field">
                <span>标题</span>
                <input
                  type="text"
                  value={imageEditTitle}
                  onChange={(event) => setImageEditTitle(event.target.value)}
                  placeholder="输入图片标题"
                />
              </label>
              <div className="image-preview__actions">
                <button type="button" className="image-preview__action" onClick={() => void handlePickLocalImage()}>选择本地图片</button>
                <button type="button" className="image-preview__action" onClick={handleImageSave}>保存修改</button>
                <button type="button" className="image-preview__action image-preview__action--danger" onClick={handleImageRemove}>删除图片</button>
                <button type="button" className="image-preview__action" onClick={closeImagePreview}>关闭</button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
      {mathEditor ? (
        <div className="image-preview" role="dialog" aria-modal="true" aria-label="公式编辑">
          <button type="button" className="image-preview__backdrop" onClick={closeMathEditor} aria-label="关闭公式编辑" />
          <div className="image-preview__panel image-preview__panel--compact">
            <div className="math-editor">
              <div className="math-editor__title">{mathEditor.type === "inlineMath" ? "行内公式" : "块级公式"}</div>
              <label className="image-preview__field">
                <span>LaTeX</span>
                <textarea
                  className="math-editor__textarea"
                  value={mathLatex}
                  onChange={(event) => setMathLatex(event.target.value)}
                  placeholder={mathEditor.type === "inlineMath" ? "输入行内公式，如 x^2 + y^2" : "输入块级公式，如 \\sum_{i=1}^{n} x_i"}
                />
              </label>
              <div className="image-preview__actions">
                <button type="button" className="image-preview__action" onClick={handleMathSave}>保存公式</button>
                <button type="button" className="image-preview__action" onClick={closeMathEditor}>关闭</button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
