import React from "react";

export function ActivityBar({ activeView, onSelect }) {
  const items = [
    { id: "explorer", icon: "▦", label: "资源管理器" }
  ];

  return (
    <aside className="activitybar">
      <div className="activitybar__main">
        {items.map((item) => (
          <button
            key={item.id}
            type="button"
            className={`activitybar__item ${activeView === item.id ? "activitybar__item--active" : ""}`}
            title={item.label}
            onClick={() => onSelect(item.id)}
          >
            <span className="activitybar__indicator" />
            <span className="activitybar__icon">{item.icon}</span>
          </button>
        ))}
      </div>
      <div className="activitybar__footer">
        {/* <button type="button" className="activitybar__item" title="设置">
          <span className="activitybar__icon">⚙</span>
        </button> */}
      </div>
    </aside>
  );
}
