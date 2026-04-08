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
  searchInputRef: React.RefObject<HTMLInputElement>;
  searchBoxRef: React.RefObject<HTMLDivElement>;
  searchResults: SearchResultItem[];
  onOpen: () => void;
  onQueryChange: (value: string) => void;
  onSelect: (path: string) => void;
}

export const CommandSearch = React.memo(function CommandSearch({
  searchOpen,
  searchQuery,
  searchInputRef,
  searchBoxRef,
  searchResults,
  onOpen,
  onQueryChange,
  onSelect
}: CommandSearchProps) {
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
        {searchOpen ? (
          <input
            ref={searchInputRef}
            className="command-box__input"
            value={searchQuery}
            onChange={(event) => onQueryChange(event.target.value)}
            placeholder={UI_TEXT.search.inputPlaceholder}
            onClick={(event) => event.stopPropagation()}
          />
        ) : (
          <span className="command-box__placeholder">{UI_TEXT.search.placeholder}</span>
        )}
      </div>

      {searchOpen ? (
        <div className="command-box__panel">
          {searchQuery.trim() ? (
            searchResults.length > 0 ? (
              searchResults.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className="command-result"
                  onClick={() => onSelect(item.path)}
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
