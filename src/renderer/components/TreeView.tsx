import React from "react";
import type { TreeNode } from "../../shared/types";
import { UI_TEXT } from "../ui-text";

interface VisibleTreeNode {
  path: string;
  name: string;
  type: TreeNode["type"];
  depth: number;
  hasChildren: boolean;
  isExpanded: boolean;
}

interface TreeViewProps {
  tree: TreeNode | null;
  expandedPaths: Set<string>;
  loadingPaths: Set<string>;
  activeFilePath: string | null;
  selectedPath: string | null;
  renamingPath: string | null;
  renamingValue: string;
  onSelectNode: (targetPath: string) => void;
  onToggleDirectory: (targetPath: string) => void;
  onOpenFile: (targetPath: string, name: string) => Promise<void>;
  onContextMenu: (node: VisibleTreeNode, event: React.MouseEvent<HTMLDivElement>) => void;
  onRenamingChange: (value: string) => void;
  onRenamingSubmit: () => void;
  onRenamingCancel: () => void;
  onClearSelection: () => void;
}

function collectVisibleTreeNodes(
  node: TreeNode,
  expandedPaths: Set<string>,
  depth = 0,
  result: VisibleTreeNode[] = []
): VisibleTreeNode[] {
  const isDirectory = node.type === "directory";
  const children = node.children || [];
  const isExpanded = isDirectory && expandedPaths.has(node.path);

  result.push({
    path: node.path,
    name: node.name,
    type: node.type,
    depth,
    hasChildren: isDirectory && Boolean(node.hasChildren ?? children.length > 0),
    isExpanded
  });

  if (isDirectory && isExpanded) {
    for (const child of children) {
      collectVisibleTreeNodes(child, expandedPaths, depth + 1, result);
    }
  }

  return result;
}

function getRenameSelectionRange(node: VisibleTreeNode, value: string) {
  if (node.type !== "file") {
    return { start: 0, end: value.length };
  }

  const normalizedValue = String(value || "");
  const lastDotIndex = normalizedValue.lastIndexOf(".");
  if (lastDotIndex <= 0) {
    return { start: 0, end: normalizedValue.length };
  }

  return { start: 0, end: lastDotIndex };
}

const TreeRow = React.memo(function TreeRow({
  node,
  loadingPaths,
  activeFilePath,
  selectedPath,
  renamingPath,
  renamingValue,
  onSelectNode,
  onToggleDirectory,
  onOpenFile,
  onContextMenu,
  onRenamingChange,
  onRenamingSubmit,
  onRenamingCancel
}: {
  node: VisibleTreeNode;
  loadingPaths: Set<string>;
  activeFilePath: string | null;
  selectedPath: string | null;
  renamingPath: string | null;
  renamingValue: string;
  onSelectNode: (targetPath: string) => void;
  onToggleDirectory: (targetPath: string) => void;
  onOpenFile: (targetPath: string, name: string) => Promise<void>;
  onContextMenu: (node: VisibleTreeNode, event: React.MouseEvent<HTMLDivElement>) => void;
  onRenamingChange: (value: string) => void;
  onRenamingSubmit: () => void;
  onRenamingCancel: () => void;
}) {
  const paddingLeft = `${node.depth * 12 + 8}px`;
  const isLoading = loadingPaths.has(node.path);
  const isActiveFile = node.type === "file" && node.path === activeFilePath;
  const isSelected = node.path === selectedPath;
  const isRenaming = node.path === renamingPath;
  const renameInputRef = React.useRef<HTMLInputElement | null>(null);
  const hasAppliedRenameSelectionRef = React.useRef(false);

  React.useEffect(() => {
    if (!isRenaming) {
      hasAppliedRenameSelectionRef.current = false;
      return;
    }

    if (!renameInputRef.current || hasAppliedRenameSelectionRef.current) {
      return;
    }

    const input = renameInputRef.current;
    const { start, end } = getRenameSelectionRange(node, renamingValue);
    hasAppliedRenameSelectionRef.current = true;
    const frameId = window.requestAnimationFrame(() => {
      input.focus();
      input.setSelectionRange(start, end);
    });

    return () => window.cancelAnimationFrame(frameId);
  }, [isRenaming, node, renamingValue]);

  const renameInput = isRenaming ? (
    <input
      ref={renameInputRef}
      className="tree-node__rename-input"
      value={renamingValue}
      autoFocus
      onChange={(event) => onRenamingChange(event.target.value)}
      onClick={(event) => event.stopPropagation()}
      onBlur={() => onRenamingSubmit()}
      onKeyDown={(event) => {
        if (event.key === "Enter") {
          event.preventDefault();
          onRenamingSubmit();
        }

        if (event.key === "Escape") {
          event.preventDefault();
          onRenamingCancel();
        }
      }}
    />
  ) : null;

  if (node.type === "directory") {
    return (
      <div className="tree-node">
        <div
          className={`tree-node__item ${isSelected ? "tree-node__item--selected" : ""}`}
          style={{ paddingLeft }}
          onClick={() => onSelectNode(node.path)}
          onContextMenu={(event) => onContextMenu(node, event)}
        >
          <button
            type="button"
            className="tree-node__toggle"
            onClick={(event) => {
              event.stopPropagation();
              onSelectNode(node.path);
              onToggleDirectory(node.path);
            }}
            disabled={!node.hasChildren && !isLoading}
          >
            {isLoading
              ? "..."
              : node.hasChildren
                ? (node.isExpanded ? UI_TEXT.sidebar.expand : UI_TEXT.sidebar.collapse)
                : ""}
          </button>
          {isRenaming ? renameInput : (
            <button
              type="button"
              className="tree-node__label"
              onClick={() => onSelectNode(node.path)}
              onDoubleClick={() => onToggleDirectory(node.path)}
            >
              {node.name}
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="tree-node">
      <div
        className={`tree-node__item tree-node__item--file ${isSelected ? "tree-node__item--selected" : ""}`}
        style={{ paddingLeft }}
        onClick={() => onSelectNode(node.path)}
        onContextMenu={(event) => onContextMenu(node, event)}
      >
        <span className="tree-node__file-icon">{UI_TEXT.sidebar.fileBullet}</span>
        {isRenaming ? renameInput : (
          <button
            type="button"
            className={`tree-node__label ${isActiveFile ? "tree-node__label--active" : ""}`}
            onClick={() => onSelectNode(node.path)}
            onDoubleClick={() => void onOpenFile(node.path, node.name)}
          >
            {node.name}
          </button>
        )}
      </div>
    </div>
  );
});

export const TreeView = React.memo(function TreeView({
  tree,
  expandedPaths,
  loadingPaths,
  activeFilePath,
  selectedPath,
  renamingPath,
  renamingValue,
  onSelectNode,
  onToggleDirectory,
  onOpenFile,
  onContextMenu,
  onRenamingChange,
  onRenamingSubmit,
  onRenamingCancel,
  onClearSelection
}: TreeViewProps) {
  const containerRef = React.useRef<HTMLDivElement | null>(null);
  const visibleNodes = React.useMemo(
    () => (tree ? collectVisibleTreeNodes(tree, expandedPaths) : []),
    [tree, expandedPaths]
  );

  React.useEffect(() => {
    const targetPath = renamingPath || selectedPath || activeFilePath;
    if (!targetPath || !containerRef.current) {
      return;
    }

    const activeElement = containerRef.current.querySelector(`[data-tree-path="${CSS.escape(targetPath)}"]`);
    if (!(activeElement instanceof HTMLElement)) {
      return;
    }

    activeElement.scrollIntoView({ block: "nearest" });
  }, [activeFilePath, renamingPath, selectedPath, visibleNodes]);

  const handleKeyDown = React.useCallback((event: React.KeyboardEvent<HTMLDivElement>) => {
    if (renamingPath || visibleNodes.length === 0) {
      return;
    }

    const currentIndex = visibleNodes.findIndex((node) => node.path === selectedPath);
    const safeIndex = currentIndex >= 0 ? currentIndex : 0;
    const currentNode = visibleNodes[safeIndex];

    if (event.key === "ArrowDown") {
      event.preventDefault();
      const nextIndex = currentIndex >= 0
        ? Math.min(visibleNodes.length - 1, safeIndex + 1)
        : 0;
      onSelectNode(visibleNodes[nextIndex].path);
      return;
    }

    if (event.key === "ArrowUp") {
      event.preventDefault();
      const nextIndex = currentIndex >= 0
        ? Math.max(0, safeIndex - 1)
        : visibleNodes.length - 1;
      onSelectNode(visibleNodes[nextIndex].path);
      return;
    }

    if (event.key === "ArrowRight" && currentNode?.type === "directory") {
      event.preventDefault();
      onSelectNode(currentNode.path);
      if (!currentNode.isExpanded) {
        onToggleDirectory(currentNode.path);
      }
      return;
    }

    if (event.key === "ArrowLeft" && currentNode?.type === "directory") {
      event.preventDefault();
      onSelectNode(currentNode.path);
      if (currentNode.isExpanded) {
        onToggleDirectory(currentNode.path);
      }
      return;
    }

    if (event.key === "Enter" && currentNode) {
      event.preventDefault();
      if (currentNode.type === "directory") {
        onToggleDirectory(currentNode.path);
      } else {
        void onOpenFile(currentNode.path, currentNode.name);
      }
    }
  }, [onOpenFile, onSelectNode, onToggleDirectory, renamingPath, selectedPath, visibleNodes]);

  if (!tree) {
    return <div className="tree__empty">{UI_TEXT.sidebar.emptyWorkspace}</div>;
  }

  return (
    <div
      ref={containerRef}
      className="tree"
      tabIndex={0}
      onKeyDown={handleKeyDown}
      onBlurCapture={(event) => {
        const nextTarget = event.relatedTarget;
        if (nextTarget instanceof Node && event.currentTarget.contains(nextTarget)) {
          return;
        }
        onClearSelection();
      }}
    >
      {visibleNodes.map((node) => (
        <div key={node.path} data-tree-path={node.path}>
          <TreeRow
            node={node}
            loadingPaths={loadingPaths}
            activeFilePath={activeFilePath}
            selectedPath={selectedPath}
            renamingPath={renamingPath}
            renamingValue={renamingValue}
            onSelectNode={onSelectNode}
            onToggleDirectory={onToggleDirectory}
            onOpenFile={onOpenFile}
            onContextMenu={onContextMenu}
            onRenamingChange={onRenamingChange}
            onRenamingSubmit={onRenamingSubmit}
            onRenamingCancel={onRenamingCancel}
          />
        </div>
      ))}
    </div>
  );
});
