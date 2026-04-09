import React from "react";

function toFileUrl(targetPath: string): string {
  const normalized = String(targetPath || "").replace(/\\/g, "/");
  if (!normalized) {
    return "";
  }

  if (/^(https?:|file:|data:|blob:)/i.test(normalized)) {
    return normalized;
  }

  if (/^[a-zA-Z]:\//.test(normalized)) {
    return `file:///${encodeURI(normalized)}`;
  }

  return `file://${encodeURI(normalized)}`;
}

interface MediaTabPaneProps {
  path: string;
  name?: string;
  kind: "audio" | "video";
  active: boolean;
  onStatusChange?: (status: {
    playing: boolean;
    currentTime: number;
    duration: number;
    fileSizeBytes: number;
  } | null) => void;
}

export function MediaTabPane({ path, name, kind, active, onStatusChange }: MediaTabPaneProps) {
  const mediaRef = React.useRef<HTMLMediaElement | null>(null);
  const [fileSizeBytes, setFileSizeBytes] = React.useState(0);
  const [expanded, setExpanded] = React.useState(false);
  const emitStatus = React.useCallback(() => {
    const element = mediaRef.current;
    if (!element) {
      return;
    }

    onStatusChange?.({
      playing: !element.paused && !element.ended,
      currentTime: Number.isFinite(element.currentTime) ? element.currentTime : 0,
      duration: Number.isFinite(element.duration) ? element.duration : 0,
      fileSizeBytes
    });
  }, [fileSizeBytes, onStatusChange]);

  React.useEffect(() => {
    if (!active) {
      mediaRef.current?.pause();
      setExpanded(false);
    }
  }, [active]);

  React.useEffect(() => {
    emitStatus();
  }, [emitStatus, path]);

  React.useEffect(() => {
    return () => onStatusChange?.(null);
  }, [onStatusChange]);

  React.useEffect(() => {
    return () => {
      const element = mediaRef.current;
      if (!element) {
        return;
      }

      element.pause();
      element.removeAttribute("src");
      element.load();
    };
  }, [path]);

  React.useEffect(() => {
    let cancelled = false;

    void window.desktopApi.getFileStats(path).then((result) => {
      if (!cancelled) {
        setFileSizeBytes(Number(result?.size) || 0);
      }
    }).catch(() => {
      if (!cancelled) {
        setFileSizeBytes(0);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [path]);

  React.useEffect(() => {
    if (!active) {
      return;
    }

    function handleKeyDown(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      if (
        event.defaultPrevented ||
        !mediaRef.current ||
        (target && (
          target.closest("input, textarea, button, select, [contenteditable='true']") ||
          target.classList.contains("command-box__input")
        ))
      ) {
        return;
      }

      if (target?.closest(".media-tab")) {
        return;
      }

      if (event.key === " " || event.code === "Space") {
        event.preventDefault();
        if (mediaRef.current.paused) {
          void mediaRef.current.play().catch(() => {});
        } else {
          mediaRef.current.pause();
        }
        return;
      }

      if (event.key === "ArrowLeft") {
        event.preventDefault();
        mediaRef.current.currentTime = Math.max(0, mediaRef.current.currentTime - 5);
        emitStatus();
        return;
      }

      if (event.key === "ArrowRight") {
        event.preventDefault();
        const duration = Number.isFinite(mediaRef.current.duration) ? mediaRef.current.duration : mediaRef.current.currentTime + 5;
        mediaRef.current.currentTime = Math.min(duration, mediaRef.current.currentTime + 5);
        emitStatus();
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [active, emitStatus]);

  return (
    <div className={`editor-shell editor-shell--media ${active ? "" : "editor-shell--hidden"}`}>
      <div className={`media-tab media-tab--${kind} ${expanded ? "media-tab--expanded" : ""}`}>
        <div className="media-tab__toolbar">
          <span className="media-tab__badge">{kind === "audio" ? "Audio" : "Video"}</span>
          <span className="media-tab__name" title={name || path}>{name || path}</span>
          {kind === "video" ? (
            <button
              type="button"
              className="media-tab__action"
              onClick={() => setExpanded((previous) => !previous)}
            >
              {expanded ? "退出全屏" : "当前页全屏"}
            </button>
          ) : null}
        </div>
        <div className="media-tab__viewport">
          {kind === "audio" ? (
            <audio
              ref={mediaRef as React.RefObject<HTMLAudioElement>}
              className="media-tab__player media-tab__player--audio"
              src={toFileUrl(path)}
              controls
              preload="metadata"
              onLoadedMetadata={emitStatus}
              onTimeUpdate={emitStatus}
              onPlay={emitStatus}
              onPause={emitStatus}
              onEnded={emitStatus}
            />
          ) : (
            <video
              ref={mediaRef as React.RefObject<HTMLVideoElement>}
              className="media-tab__player media-tab__player--video"
              src={toFileUrl(path)}
              controls
              controlsList="noremoteplayback"
              disablePictureInPicture
              preload="metadata"
              onLoadedMetadata={emitStatus}
              onTimeUpdate={emitStatus}
              onPlay={emitStatus}
              onPause={emitStatus}
              onEnded={emitStatus}
            />
          )}
        </div>
      </div>
    </div>
  );
}
