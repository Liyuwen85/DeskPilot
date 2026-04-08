export const UI_TEXT = {
  toast: {
    saveSuccess: "保存成功",
    saveAsSuccess: "另存为成功",
    copySuccess: "复制成功",
    copyError: "复制失败",
    exportSuccess: "导出成功",
    exportError: "导出失败"
  },
  search: {
    openedBadge: "已打开",
    fileBadge: "文件",
    placeholder: "搜索",
    inputPlaceholder: "搜索文件名或路径",
    emptyResult: "没有匹配结果",
    emptyHint: "输入文件名或路径进行搜索",
    icon: "⌕"
  },
  sidebar: {
    searchTitle: "搜索",
    searchDescription: "使用顶部搜索框在当前工作区和已打开标签中快速定位文件。",
    gitTitle: "源代码管理",
    gitDescription: "这里预留给 Git 状态、变更列表和提交入口。",
    extensionsTitle: "扩展",
    extensionsDescription: "这里预留给插件、SDK 能力和工具扩展入口。",
    workspaceTitle: "当前工作区",
    resizeAriaLabel: "调整侧边栏宽度",
    emptyWorkspace: "请从文件菜单打开文件或文件夹。",
    expand: "▾",
    collapse: "▸",
    fileBullet: "•"
  },
  editor: {
    markdownPlaceholder: "开始编写 Markdown...",
    emptyTitle: "开始使用",
    emptyDescription: "从“文件”菜单打开文件或文件夹，或者先新建一个临时 Markdown。",
    loadingMarkdown: "正在加载 Markdown 编辑器..."
  },
  tabs: {
    dirtyTitle: "未保存"
  },
  statusbar: {
    chars: "字符",
    lines: "行数",
    unsaved: "未保存",
    saved: "已保存",
    unsavedFile: "未保存文件",
    unopenedFile: "未打开文件",
    save: "保存",
    copy: "复制"
  },
  window: {
    maximize: "□",
    restore: "❐",
    close: "×"
  }
} as const;
