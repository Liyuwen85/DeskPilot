let turndownServicePromise: Promise<{ turndown: (html: string) => string }> | null = null;

function getTurndownService() {
  if (!turndownServicePromise) {
    turndownServicePromise = import("turndown").then(({ default: TurndownService }) => (
      new TurndownService({
        headingStyle: "atx",
        codeBlockStyle: "fenced",
        bulletListMarker: "-",
        emDelimiter: "*"
      })
    ));
  }

  return turndownServicePromise;
}

function normalizeText(value: unknown): string {
  return typeof value === "string" ? value : "";
}

export async function serializeMarkdownDraftAsync(
  draft: { html?: string | null } | null | undefined,
  fallbackContent = ""
): Promise<string> {
  if (!draft || typeof draft.html !== "string") {
    return normalizeText(fallbackContent);
  }

  const turndownService = await getTurndownService();
  return turndownService.turndown(draft.html);
}
