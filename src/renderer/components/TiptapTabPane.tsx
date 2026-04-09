import React from "react";
import Image from "@tiptap/extension-image";
import Mathematics from "@tiptap/extension-mathematics";
import { EditorContent, useEditor } from "@tiptap/react";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import { TextSelection } from "@tiptap/pm/state";
import { marked } from "marked";
import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";
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
  const lastKnownSelectionRef = React.useRef<StoredSelection | null>(null);
  const [imagePreview, setImagePreview] = React.useState<ImagePreviewState | null>(null);
  const [imageEditSrc, setImageEditSrc] = React.useState("");
  const [imageEditAlt, setImageEditAlt] = React.useState("");
  const [imageEditTitle, setImageEditTitle] = React.useState("");
  const [mathEditor, setMathEditor] = React.useState<MathEditorState | null>(null);
  const [mathLatex, setMathLatex] = React.useState("");

  const handleSaveKeyDownCapture = React.useCallback((event: React.KeyboardEvent<HTMLDivElement>) => {
    const key = String(event.key || "").toLowerCase();
    if ((event.ctrlKey || event.metaKey) && key === "s") {
      event.preventDefault();
      event.stopPropagation();
      onSaveShortcut?.();
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

  const emitOutline = React.useCallback((nextDoc: ProseMirrorNode) => {
    onOutlineChange?.(tabPath, getOutlineFromDocument(nextDoc));
  }, [onOutlineChange, tabPath]);

  const rememberSelection = React.useCallback((anchor: number, head: number) => {
    lastKnownSelectionRef.current = { anchor, head };
  }, []);

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
    onUpdate: ({ editor: nextEditor }) => {
      const nextHtml = nextEditor.getHTML();
      emitOutline(nextEditor.state.doc);
      onTextChange(tabPath, {
        html: nextHtml,
        text: nextEditor.getText({ blockSeparator: "\n" }),
        isDirty: nextHtml !== lastSyncedHtmlRef.current
      });
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
  }, [onSaveShortcut, emitOutline, onTextChange, rememberSelection, resolveHtmlImageSources, resolvedHtml, tabPath, openMathEditor]);

  const restoreSelectionForCommand = React.useCallback(() => {
    if (!editor) {
      return null;
    }

    const chain = editor.chain().focus();
    const storedSelection = lastKnownSelectionRef.current;
    if (!storedSelection) {
      chain.focus("end");
      return chain;
    }

    const { anchor, head } = clampSelection(storedSelection, editor.state.doc.content.size);
    chain.setTextSelection(TextSelection.create(editor.state.doc, anchor, head));
    return chain;
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
    if (target instanceof HTMLElement && target.closest("img")) {
      handleImageClickCapture(event);
      return;
    }

    handleLinkClickCapture(event);
  }, [handleImageClickCapture, handleLinkClickCapture]);

  React.useEffect(() => {
    if (!editor) {
      return;
    }

    emitOutline(editor.state.doc);
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
  }, [editor, emitOutline, onOutlineApiReady, tabPath]);

  React.useEffect(() => {
    if (!editor) {
      return;
    }

    if (resolvedHtml === lastSyncedHtmlRef.current) {
      return;
    }

    editor.commands.setContent(resolvedHtml, false);
    lastSyncedHtmlRef.current = resolvedHtml;
    emitOutline(editor.state.doc);
  }, [editor, emitOutline, resolvedHtml]);

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
    const chain = restoreSelectionForCommand();
    if (!chain) {
      return;
    }
    chain.setImage({ src: resolveImageSource(nextPath, tabPath) }).run();
  }, [editor, restoreSelectionForCommand, tabPath]);

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
      const updateResult = existingMath.type === "inlineMath"
        ? editor.chain().focus().setNodeSelection(existingMath.pos).updateInlineMath({ latex: nextLatex, pos: existingMath.pos }).run()
        : editor.chain().focus().setNodeSelection(existingMath.pos).updateBlockMath({ latex: nextLatex, pos: existingMath.pos }).run();

      if (updateResult) {
        rememberSelection(existingMath.pos, existingMath.pos);
        closeMathEditor();
        return;
      }
    }

    const chain = restoreSelectionForCommand();
    if (!chain) {
      return;
    }

    if (mathEditor.type === "inlineMath") {
      chain.insertInlineMath({ latex: nextLatex }).run();
    } else {
      chain.insertBlockMath({ latex: nextLatex }).run();
    }

    closeMathEditor();
  }, [closeMathEditor, editor, mathEditor, mathLatex, rememberSelection, restoreSelectionForCommand]);

  React.useEffect(() => {
    if (!editor) {
      return;
    }

    onCommandApiReady?.(tabPath, {
      toggleHeading: (level: number) => {
        const chain = restoreSelectionForCommand();
        if (!chain) {
          return;
        }
        chain.toggleHeading({ level: Math.max(1, Math.min(6, level)) as 1 | 2 | 3 | 4 | 5 | 6 }).run();
      },
      insertHorizontalRule: () => {
        const chain = restoreSelectionForCommand();
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
  }, [editor, handleInsertImageFromFile, handleOpenMathEditor, onCommandApiReady, restoreSelectionForCommand, tabPath]);

  return (
    <div className={`editor-shell editor-shell--tiptap ${active ? "" : "editor-shell--hidden"}`}>
      <div
        className="editor-body"
        onClickCapture={handleBodyClickCapture}
        onKeyDownCapture={handleSaveKeyDownCapture}
      >
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
