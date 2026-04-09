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

interface ImageTabPaneProps {
  path: string;
  name?: string;
  active: boolean;
  onStatusChange?: (status: { zoomPercent: number; width: number; height: number; fileSizeBytes: number } | null) => void;
}

const MIN_SCALE = 0.2;
const MAX_SCALE = 5;
const SCALE_STEP = 0.1;

export function ImageTabPane({ path, name, active, onStatusChange }: ImageTabPaneProps) {
  const [scale, setScale] = React.useState(1);
  const [offset, setOffset] = React.useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = React.useState(false);
  const [imageSize, setImageSize] = React.useState({ width: 0, height: 0 });
  const [fileSizeBytes, setFileSizeBytes] = React.useState(0);
  const dragRef = React.useRef<{ x: number; y: number; originX: number; originY: number } | null>(null);

  React.useEffect(() => {
    setScale(1);
    setOffset({ x: 0, y: 0 });
    setIsDragging(false);
    setImageSize({ width: 0, height: 0 });
    setFileSizeBytes(0);
    dragRef.current = null;
  }, [path]);

  React.useEffect(() => {
    onStatusChange?.({
      zoomPercent: Math.round(scale * 100),
      width: imageSize.width,
      height: imageSize.height,
      fileSizeBytes
    });
  }, [fileSizeBytes, imageSize.height, imageSize.width, onStatusChange, scale]);

  React.useEffect(() => {
    return () => onStatusChange?.(null);
  }, [onStatusChange]);

  React.useEffect(() => {
    let cancelled = false;

    void window.desktopApi.getFileStats(path).then((result) => {
      if (cancelled) {
        return;
      }

      onStatusChange?.({
        zoomPercent: Math.round(scale * 100),
        width: imageSize.width,
        height: imageSize.height,
        fileSizeBytes: Number(result?.size) || 0
      });
      setFileSizeBytes(Number(result?.size) || 0);
    }).catch(() => {
      if (!cancelled) {
        setFileSizeBytes(0);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [onStatusChange, path]);

  const handleWheel = React.useCallback((event: React.WheelEvent<HTMLDivElement>) => {
    event.preventDefault();

    const direction = event.deltaY < 0 ? 1 : -1;
    setScale((previous) => {
      const next = previous + direction * SCALE_STEP;
      return Math.max(MIN_SCALE, Math.min(MAX_SCALE, Number(next.toFixed(2))));
    });
  }, []);

  const handlePointerDown = React.useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    event.preventDefault();
    dragRef.current = {
      x: event.clientX,
      y: event.clientY,
      originX: offset.x,
      originY: offset.y
    };
    setIsDragging(true);
    event.currentTarget.setPointerCapture(event.pointerId);
  }, [offset.x, offset.y]);

  const handlePointerMove = React.useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    if (!dragRef.current) {
      return;
    }

    const deltaX = event.clientX - dragRef.current.x;
    const deltaY = event.clientY - dragRef.current.y;
    setOffset({
      x: dragRef.current.originX + deltaX,
      y: dragRef.current.originY + deltaY
    });
  }, []);

  const endDrag = React.useCallback(() => {
    dragRef.current = null;
    setIsDragging(false);
  }, []);

  const handleResetView = React.useCallback(() => {
    setScale(1);
    setOffset({ x: 0, y: 0 });
  }, []);

  return (
    <div className={`editor-shell editor-shell--image ${active ? "" : "editor-shell--hidden"}`}>
      <div className="image-tab">
        <div className="image-tab__toolbar">
          <span className="image-tab__zoom">{Math.round(scale * 100)}%</span>
          <button type="button" className="image-tab__reset" onClick={handleResetView}>重置</button>
        </div>
        <div
          className={`image-tab__viewport ${isDragging ? "image-tab__viewport--dragging" : ""}`}
          onWheel={handleWheel}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
          onPointerLeave={endDrag}
        >
          <img
            className="image-tab__image"
            src={toFileUrl(path)}
            alt={name || "Image"}
            draggable={false}
            onLoad={(event) => {
              setImageSize({
                width: event.currentTarget.naturalWidth,
                height: event.currentTarget.naturalHeight
              });
            }}
            style={{
              transform: `translate(${offset.x}px, ${offset.y}px) scale(${scale})`
            }}
          />
        </div>
      </div>
    </div>
  );
}
