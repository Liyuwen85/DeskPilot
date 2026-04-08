import React from "react";
import { EditorContent, useEditor } from "@tiptap/react";
import { marked } from "marked";
import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";
import { UI_TEXT } from "../ui-text";

interface MarkdownDraftPayload {
  html: string;
  text: string;
  isDirty: boolean;
}

interface TiptapTabPaneProps {
  tabPath: string;
  markdown: string;
  draftHtml?: string | null;
  active: boolean;
  onTextChange: (tabPath: string, value: MarkdownDraftPayload) => void;
  onSaveShortcut?: () => void;
}

export function TiptapTabPane({
  tabPath,
  markdown,
  draftHtml,
  active,
  onTextChange,
  onSaveShortcut
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

  React.useEffect(() => {
    lastSyncedHtmlRef.current = resolvedHtml;
  }, [tabPath, resolvedHtml]);

  const editor = useEditor({
    extensions: [
      StarterKit,
      Placeholder.configure({
        placeholder: UI_TEXT.editor.markdownPlaceholder
      })
    ],
    content: resolvedHtml,
    immediatelyRender: false,
    editorProps: {
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

    if (resolvedHtml === lastSyncedHtmlRef.current) {
      return;
    }

    editor.commands.setContent(resolvedHtml, false);
    lastSyncedHtmlRef.current = resolvedHtml;
  }, [editor, resolvedHtml]);

  React.useEffect(() => {
    return () => {
      if (editor && !editor.isDestroyed) {
        editor.destroy();
      }
    };
  }, [editor]);

  return (
    <div className={`editor-shell editor-shell--tiptap ${active ? "" : "editor-shell--hidden"}`}>
      <div className="editor-body" onKeyDownCapture={handleSaveKeyDownCapture}>
        <EditorContent editor={editor} className="editor-content editor-content--tiptap" />
      </div>
    </div>
  );
}
