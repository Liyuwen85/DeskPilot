import React from "react";
import { UI_TEXT } from "../ui-text";

interface SearchResultItem {
  id: string;
  label: string;
  description: string;
  badge: string;
  path: string;
}

interface CommandSearchProps {
  searchOpen: boolean;
  searchQuery: string;
  searchLoading: boolean;
  searchInputRef: React.RefObject<HTMLInputElement>;
  searchBoxRef: React.RefObject<HTMLDivElement>;
  searchResults: SearchResultItem[];
  onOpen: () => void;
  onClose: () => void;
  onQueryChange: (value: string) => void;
  onSelect: (path: string) => void;
}

export const CommandSearch = React.memo(function CommandSearch({
  searchOpen,
  searchQuery,
  searchLoading,
  searchInputRef,
  searchBoxRef,
  searchResults,
  onOpen,
  onClose,
  onQueryChange,
  onSelect
}: CommandSearchProps) {
  const [activeIndex, setActiveIndex] = React.useState(-1);
  const resultRefs = React.useRef<Array<HTMLButtonElement | null>>([]);
  const hasPinnedQuery = searchQuery.trim().length > 0;
  const showInput = searchOpen || hasPinnedQuery;

  React.useEffect(() => {
    if (!searchOpen) {
      return;
    }

    const focusInput = () => {
      const input = searchInputRef.current;
      if (!input) {
        return;
      }

      input.focus();
      const valueLength = input.value.length;
      input.setSelectionRange(valueLength, valueLength);
    };

    focusInput();
    const frameId = window.requestAnimationFrame(focusInput);
    return () => {
      window.cancelAnimationFrame(frameId);
    };
  }, [searchInputRef, searchOpen, searchResults.length]);

  React.useEffect(() => {
    if (!searchOpen || !searchQuery.trim() || searchResults.length === 0) {
      setActiveIndex(-1);
      return;
    }

    setActiveIndex((previous) => {
      if (previous >= 0 && previous < searchResults.length) {
        return previous;
      }
      return 0;
    });
  }, [searchOpen, searchQuery, searchResults]);

  React.useEffect(() => {
    if (activeIndex < 0) {
      return;
    }

    resultRefs.current[activeIndex]?.scrollIntoView({
      block: "nearest"
    });
  }, [activeIndex]);

  return (
    <div className={`command-box ${searchOpen ? "command-box--open" : ""}`} ref={searchBoxRef}>
      <div
        className="command-box__trigger"
        onClick={() => {
          if (!searchOpen) {
            onOpen();
          }
        }}
      >
        <span className="command-box__icon">{UI_TEXT.search.icon}</span>
        {showInput ? (
          <>
            <input
              ref={searchInputRef}
              className="command-box__input"
              value={searchQuery}
              onChange={(event) => onQueryChange(event.target.value)}
              placeholder={UI_TEXT.search.inputPlaceholder}
              onClick={(event) => event.stopPropagation()}
              onFocus={() => {
                if (!searchOpen) {
                  onOpen();
                }
              }}
              onKeyDown={(event) => {
                if (event.key === "ArrowDown" && searchResults.length > 0) {
                  event.preventDefault();
                  event.stopPropagation();
                  setActiveIndex((previous) => (
                    previous < 0 ? 0 : (previous + 1) % searchResults.length
                  ));
                  return;
                }

                if (event.key === "ArrowUp" && searchResults.length > 0) {
                  event.preventDefault();
                  event.stopPropagation();
                  setActiveIndex((previous) => (
                    previous < 0 ? searchResults.length - 1 : (previous - 1 + searchResults.length) % searchResults.length
                  ));
                  return;
                }

                if (event.key === "Enter" && activeIndex >= 0 && activeIndex < searchResults.length) {
                  event.preventDefault();
                  event.stopPropagation();
                  onSelect(searchResults[activeIndex].path);
                  return;
                }

                if (event.key === "Escape") {
                  event.preventDefault();
                  event.stopPropagation();
                  onClose();
                }
              }}
            />
            <span className="command-box__hint">Ctrl+R</span>
          </>
        ) : (
          <>
            <span className="command-box__placeholder">{UI_TEXT.search.placeholder}</span>
            <span className="command-box__hint">Ctrl+R</span>
          </>
        )}
      </div>

      {searchOpen ? (
        <div className="command-box__panel">
          {searchQuery.trim() ? (
            searchLoading ? (
              <div className="command-box__empty">搜索中...</div>
            ) : searchResults.length > 0 ? (
              searchResults.map((item) => (
                <button
                  key={item.id}
                  ref={(element) => {
                    const index = searchResults.findIndex((result) => result.id === item.id);
                    resultRefs.current[index] = element;
                  }}
                  type="button"
                  className={`command-result ${searchResults[activeIndex]?.id === item.id ? "command-result--active" : ""}`}
                  aria-selected={searchResults[activeIndex]?.id === item.id}
                  onClick={() => onSelect(item.path)}
                  onMouseEnter={() => {
                    const index = searchResults.findIndex((result) => result.id === item.id);
                    setActiveIndex(index);
                  }}
                >
                  <span className="command-result__main">
                    <span className="command-result__label">{item.label}</span>
                    <span className="command-result__desc">{item.description}</span>
                  </span>
                  <span className="command-result__badge">{item.badge}</span>
                </button>
              ))
            ) : (
              <div className="command-box__empty">{UI_TEXT.search.emptyResult}</div>
            )
          ) : (
            <div className="command-box__empty">{UI_TEXT.search.emptyHint}</div>
          )}
        </div>
      ) : null}
    </div>
  );
});
