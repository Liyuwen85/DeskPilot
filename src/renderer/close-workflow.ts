export async function closeTabWithPrompt(filePath, options) {
  const {
    findTabByPath,
    isTabDirty,
    confirmCloseTab,
    saveTabByPath,
    saveTabAsByPath,
    removeTabByPath
  } = options;

  const tab = findTabByPath(filePath);
  if (!tab) {
    return { ok: false, reason: "missing-tab" };
  }

  let targetPath = filePath;

  if (isTabDirty(tab)) {
    const decision = await confirmCloseTab({
      fileName: tab.name
    });

    if (decision?.action === "cancel") {
      return { ok: false, reason: "cancelled" };
    }

    if (decision?.action === "save") {
      const saveResult = await saveTabByPath(filePath);
      if (saveResult.requiresSaveAs) {
        const saveAsResult = await saveTabAsByPath(filePath);
        if (!saveAsResult?.ok || !saveAsResult.filePath) {
          return { ok: false, reason: "save-as-cancelled" };
        }
        targetPath = saveAsResult.filePath;
      } else if (!saveResult.ok) {
        return { ok: false, reason: "save-failed" };
      }
    }
  }

  removeTabByPath(targetPath);
  return { ok: true, filePath: targetPath };
}

export async function closeWindowWithPrompt(options) {
  const {
    getDirtyTabs,
    confirmCloseWindow,
    saveTabByPath,
    saveTabAsByPath,
    confirmWindowClose
  } = options;

  const dirtyTabs = getDirtyTabs();
  if (dirtyTabs.length === 0) {
    confirmWindowClose();
    return { ok: true, dirtyCount: 0 };
  }

  const decision = await confirmCloseWindow({
    dirtyCount: dirtyTabs.length
  });

  if (decision?.action === "cancel") {
    return { ok: false, reason: "cancelled" };
  }

  if (decision?.action === "save") {
    for (const tab of dirtyTabs) {
      const saveResult = await saveTabByPath(tab.path);
      if (saveResult.requiresSaveAs) {
        const saveAsResult = await saveTabAsByPath(tab.path);
        if (!saveAsResult?.ok) {
          return { ok: false, reason: "save-as-cancelled" };
        }
      } else if (!saveResult.ok) {
        return { ok: false, reason: "save-failed" };
      }
    }
  }

  confirmWindowClose();
  return { ok: true, dirtyCount: dirtyTabs.length };
}
