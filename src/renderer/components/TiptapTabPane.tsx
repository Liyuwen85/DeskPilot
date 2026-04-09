import React from "react";
import { EditorContent, useEditor } from "@tiptap/react";
import Link from "@tiptap/extension-link";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
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

interface TiptapTabPaneProps {
  tabPath: string;
  markdown: string;
  draftHtml?: string | null;
  active: boolean;
  onTextChange: (tabPath: string, value: MarkdownDraftPayload) => void;
  onSaveShortcut?: () => void;
  onOutlineChange?: (tabPath: string, items: TiptapOutlineItem[]) => void;
  onOutlineApiReady?: (tabPath: string, api: TiptapOutlineApi | null) => void;
}

export function TiptapTabPane({
  tabPath,
  markdown,
  draftHtml,
  active,
  onTextChange,
  onSaveShortcut,
  onOutlineChange,
  onOutlineApiReady
}: TiptapTabPaneProps) {
  const resolvedHtml = React.useMemo(
    () => draftHtml ?? marked.parse(markdown || ""),
    [draftHtml, markdown]
  );
  const lastSyncedHtmlRef = React.useRef(resolvedHtml);

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

  React.useEffect(() => {
    lastSyncedHtmlRef.current = resolvedHtml;
  }, [tabPath, resolvedHtml]);

  const emitOutline = React.useCallback((nextDoc: ProseMirrorNode) => {
    onOutlineChange?.(tabPath, getOutlineFromDocument(nextDoc));
  }, [onOutlineChange, tabPath]);

  const editor = useEditor({
    extensions: [
      StarterKit,
      Link.configure({
        openOnClick: false,
        autolink: true,
        linkOnPaste: true
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
    }
  });

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

  return (
    <div className={`editor-shell editor-shell--tiptap ${active ? "" : "editor-shell--hidden"}`}>
      <div
        className="editor-body"
        onClickCapture={handleLinkClickCapture}
        onKeyDownCapture={handleSaveKeyDownCapture}
      >
        <EditorContent editor={editor} className="editor-content editor-content--tiptap" />
      </div>
    </div>
  );
}
