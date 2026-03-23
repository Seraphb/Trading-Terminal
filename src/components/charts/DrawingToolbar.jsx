import React from 'react';
import { MousePointer2, TrendingUp, Minus, ArrowRight, Square, GitBranch, Type, Trash2 } from 'lucide-react';

const TOOLS = [
  { id: 'cursor', icon: MousePointer2, label: 'Select' },
  { type: 'separator' },
  { id: 'trendline', icon: TrendingUp, label: 'Trend Line' },
  { id: 'hline', icon: Minus, label: 'Horizontal Line' },
  { id: 'ray', icon: ArrowRight, label: 'Ray' },
  { id: 'rect', icon: Square, label: 'Rectangle' },
  { type: 'separator' },
  { id: 'fib', icon: GitBranch, label: 'Fibonacci' },
  { type: 'separator' },
  { id: 'text', icon: Type, label: 'Text' },
];

const toolbarStyle = {
  width: 36,
  flexShrink: 0,
  background: 'hsl(222,47%,11%)',
  borderRight: '1px solid hsl(217,33%,20%)',
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  paddingTop: 4,
  paddingBottom: 4,
  gap: 0,
};

const separatorStyle = {
  width: '80%',
  height: 1,
  background: 'hsl(217,33%,20%)',
  margin: '4px 0',
  flexShrink: 0,
};

export default function DrawingToolbar({ activeTool, onToolChange, onClearAll, theme }) {
  return (
    <div style={toolbarStyle}>
      {TOOLS.map((item, idx) => {
        if (item.type === 'separator') {
          return <div key={`sep-${idx}`} style={separatorStyle} />;
        }
        const Icon = item.icon;
        const isActive = activeTool === item.id;
        return (
          <button
            key={item.id}
            title={item.label}
            onClick={() => onToolChange(item.id)}
            style={{
              width: 36,
              height: 32,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              border: 'none',
              borderRadius: 4,
              cursor: 'pointer',
              flexShrink: 0,
              background: isActive ? 'rgba(59,130,246,0.2)' : 'transparent',
              outline: isActive ? '1px solid rgba(59,130,246,0.4)' : 'none',
              color: isActive ? '#60a5fa' : '#475569',
              transition: 'color 0.15s, background 0.15s',
            }}
            onMouseEnter={(e) => {
              if (!isActive) e.currentTarget.style.color = '#94a3b8';
            }}
            onMouseLeave={(e) => {
              if (!isActive) e.currentTarget.style.color = '#475569';
            }}
          >
            <Icon size={14} />
          </button>
        );
      })}

      {/* Separator before trash */}
      <div style={{ ...separatorStyle, marginTop: 'auto' }} />

      {/* Trash button */}
      <button
        title="Clear All"
        onClick={onClearAll}
        style={{
          width: 36,
          height: 32,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          border: 'none',
          borderRadius: 4,
          cursor: 'pointer',
          flexShrink: 0,
          background: 'transparent',
          color: '#475569',
          transition: 'color 0.15s',
        }}
        onMouseEnter={(e) => { e.currentTarget.style.color = '#ef4444'; }}
        onMouseLeave={(e) => { e.currentTarget.style.color = '#475569'; }}
      >
        <Trash2 size={14} />
      </button>
    </div>
  );
}
