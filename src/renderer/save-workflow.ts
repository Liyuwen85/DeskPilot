export async function saveTabWithPath(filePath, options) {
  const {
    findTabByPath,
    getPersistedContentForTab,
    saveFile,
    applySavedContent
  } = options;

  const tab = findTabByPath(filePath);
  if (!tab || tab.kind === "binary" || tab.kind === "image") {
    return { ok: false };
  }

  const content = await getPersistedContentForTab(tab);

  if (tab.isTemporary) {
    return { ok: false, requiresSaveAs: true };
  }

  await saveFile({
    filePath,
    content
  });

  applySavedContent({
    filePath,
    content
  });

  return { ok: true };
}

export async function saveTabAsWithPath(filePath, options) {
  const {
    findTabByPath,
    getPersistedContentForTab,
    buildDefaultPath,
    saveFileAs,
    readFile,
    applySavedAsContent,
    afterSaveAs
  } = options;

  const currentTab = findTabByPath(filePath);
  if (!currentTab || currentTab.kind === "binary" || currentTab.kind === "image") {
    return { ok: false };
  }

  const currentContent = await getPersistedContentForTab(currentTab);
  const defaultPath = buildDefaultPath(currentTab);
  const result = await saveFileAs({
    defaultPath,
    content: currentContent
  });

  if (!result || result.canceled || !result.filePath) {
    return { ok: false, canceled: true };
  }

  const savedFile = await readFile(result.filePath);

  applySavedAsContent({
    oldPath: currentTab.path,
    newPath: result.filePath,
    content: currentContent,
    savedFile
  });

  if (afterSaveAs) {
    await afterSaveAs({
      oldPath: currentTab.path,
      newPath: result.filePath,
      content: currentContent,
      savedFile
    });
  }

  return { ok: true, filePath: result.filePath };
}

export async function saveActiveTab(options) {
  const {
    getActiveTabPath,
    saveTabByPath,
    saveTabAsByPath
  } = options;

  const currentPath = getActiveTabPath();
  if (!currentPath) {
    return { ok: false, reason: "missing-active-tab" };
  }

  const result = await saveTabByPath(currentPath);
  if (result.requiresSaveAs) {
    return saveTabAsByPath(currentPath);
  }

  return result;
}
