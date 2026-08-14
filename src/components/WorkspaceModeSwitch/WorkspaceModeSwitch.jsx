import React from "react";
import { BookOpen, MessageCircle } from "lucide-react";
import "./WorkspaceModeSwitch.css";

const modes = [
  { id: "chat", label: "普通对话", shortLabel: "对话", icon: MessageCircle },
  { id: "research", label: "知识研究", shortLabel: "研究", icon: BookOpen },
];

function WorkspaceModeSwitch({ mode, onChange, compact = false }) {
  return (
    <div className={`workspace-mode-switch ${compact ? "compact" : ""}`} role="tablist" aria-label="工作模式">
      {modes.map((item) => {
        const Icon = item.icon;
        const selected = mode === item.id;
        return (
          <button
            key={item.id}
            type="button"
            role="tab"
            aria-selected={selected}
            aria-controls={`workspace-${item.id}`}
            className={selected ? "active" : ""}
            onClick={() => onChange(item.id)}
          >
            <Icon size={16} aria-hidden="true" />
            <span>{compact ? item.shortLabel : item.label}</span>
          </button>
        );
      })}
    </div>
  );
}

export default WorkspaceModeSwitch;
