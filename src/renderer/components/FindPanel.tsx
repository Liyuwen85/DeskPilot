import React from "react";

interface FindPanelProps {
  visible: boolean;
  query: string;
  currentIndex: number;
  totalCount: number;
  onQueryChange: (value: string) => void;
  onPrev: () => void;
  onNext: () => void;
  onClose: () => void;
}

export function FindPanel({
  visible,
  query,
  currentIndex,
  totalCount,
  onQueryChange,
  onPrev,
  onNext,
  onClose
}: FindPanelProps) {
  const inputRef = React.useRef<HTMLInputElement | null>(null);

  React.useEffect(() => {
    if (!visible) {
      return;
    }

    window.requestAnimationFrame(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
    });
  }, [visible]);

  if (!visible) {
    return null;
  }

  const safeIndex = totalCount > 0 && currentIndex >= 0 ? currentIndex + 1 : 0;

  return (
    <div className="find-panel" role="search" aria-label="Find in tab">
      <input
        ref={inputRef}
        type="text"
        className="find-panel__input"
        value={query}
        placeholder="Find"
        onChange={(event) => onQueryChange(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            if (event.shiftKey) {
              onPrev();
            } else {
              onNext();
            }
            return;
          }

          if (event.key === "Escape") {
            event.preventDefault();
            onClose();
          }
        }}
      />
      <span className="find-panel__count">{safeIndex}/{totalCount}</span>
      <button type="button" className="find-panel__button" onClick={onPrev} disabled={totalCount === 0}>↑</button>
      <button type="button" className="find-panel__button" onClick={onNext} disabled={totalCount === 0}>↓</button>
      <button type="button" className="find-panel__button" onClick={onClose}>×</button>
    </div>
  );
}
