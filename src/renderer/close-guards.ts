export function getSavedContentForTab(tab, savedTextMap, normalizeText) {
  if (!tab) {
    return "";
  }

  return normalizeText(savedTextMap[tab.path] ?? tab.content);
}

export function isMarkdownTabDirty(tab, savedTextMap, markdownDraftMap, serializeMarkdownDraft, normalizeText) {
  if (!tab || tab.kind !== "markdown") {
    return false;
  }

  return Boolean(markdownDraftMap[tab.path]?.isDirty);
}

export function isTabDirty(tab, savedTextMap, tabTextMap, markdownDraftMap, serializeMarkdownDraft, normalizeText) {
  if (!tab || tab.kind === "binary" || tab.kind === "image" || tab.kind === "audio" || tab.kind === "video" || tab.kind === "pdf" || tab.kind === "webpage" || tab.kind === "notebook") {
    return false;
  }

  if (tab.kind === "markdown") {
    return isMarkdownTabDirty(tab, savedTextMap, markdownDraftMap, serializeMarkdownDraft, normalizeText);
  }

  const currentContent = normalizeText(tabTextMap[tab.path] ?? tab.content);
  const savedContent = getSavedContentForTab(tab, savedTextMap, normalizeText);
  return currentContent !== savedContent;
}

export function collectDirtyTabs(tabs, savedTextMap, tabTextMap, markdownDraftMap, serializeMarkdownDraft, normalizeText) {
  return tabs.filter((tab) => (
    isTabDirty(tab, savedTextMap, tabTextMap, markdownDraftMap, serializeMarkdownDraft, normalizeText)
  ));
}
