import React from 'react';

// SVG Icons - 16x16 pixel art style
const icons: Record<string, React.ReactNode> = {
  nature: (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
      {/* Simple tree */}
      <rect x="7" y="11" width="2" height="4" fill="#8B5A2B"/>
      <rect x="5" y="7" width="6" height="4" fill="#4A7C3F"/>
      <rect x="4" y="5" width="8" height="3" fill="#5B9A4A"/>
      <rect x="6" y="3" width="4" height="3" fill="#6BB55A"/>
    </svg>
  ),
  furniture: (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
      {/* Simple chair */}
      <rect x="4" y="3" width="2" height="10" fill="#A0522D"/>
      <rect x="10" y="9" width="2" height="6" fill="#A0522D"/>
      <rect x="4" y="3" width="8" height="2" fill="#CD853F"/>
      <rect x="4" y="9" width="8" height="2" fill="#CD853F"/>
    </svg>
  ),
  decorations: (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
      {/* 4-point star */}
      <rect x="7" y="2" width="2" height="5" fill="#FFD700"/>
      <rect x="7" y="9" width="2" height="5" fill="#FFD700"/>
      <rect x="2" y="7" width="5" height="2" fill="#FFD700"/>
      <rect x="9" y="7" width="5" height="2" fill="#FFD700"/>
      <rect x="6" y="6" width="4" height="4" fill="#FFF8DC"/>
    </svg>
  ),
  fences: (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
      {/* Brick pattern */}
      <rect x="2" y="3" width="5" height="3" fill="#CD5C5C" stroke="#8B4513" strokeWidth="0.5"/>
      <rect x="8" y="3" width="5" height="3" fill="#BC4A4A" stroke="#8B4513" strokeWidth="0.5"/>
      <rect x="2" y="7" width="4" height="3" fill="#BC4A4A" stroke="#8B4513" strokeWidth="0.5"/>
      <rect x="7" y="7" width="5" height="3" fill="#CD5C5C" stroke="#8B4513" strokeWidth="0.5"/>
      <rect x="2" y="11" width="5" height="3" fill="#CD5C5C" stroke="#8B4513" strokeWidth="0.5"/>
      <rect x="8" y="11" width="5" height="3" fill="#BC4A4A" stroke="#8B4513" strokeWidth="0.5"/>
    </svg>
  ),
  'tile-object': (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
      {/* Puzzle piece */}
      <path d="M3 4 H6 V6 Q7 5 8 6 V4 H13 V7 Q12 8 13 9 V13 H8 V11 Q7 12 6 11 V13 H3 V9 Q4 8 3 7 Z"
            fill="#7B68EE" stroke="#483D8B" strokeWidth="0.5"/>
    </svg>
  ),
};

// Display labels for each category
const labels: Record<string, string> = {
  nature: 'Nature',
  furniture: 'Furniture',
  decorations: 'Decor',
  fences: 'Fences',
  'tile-object': 'Tiles',
};

interface StardewSubTabProps {
  category: string;
  isActive: boolean;
  onClick: () => void;
  className?: string;
}

export const StardewSubTab: React.FC<StardewSubTabProps> = ({
  category,
  isActive,
  onClick,
  className = '',
}) => {
  return (
    <button
      onClick={onClick}
      className={`
        flex flex-col items-center justify-center gap-0.5
        w-11 h-12 rounded-md
        transition-all duration-150 ease-out
        ${isActive
          ? 'subtab-active'
          : 'subtab-inactive hover:subtab-hover'
        }
        ${className}
      `}
      style={{
        // Wood texture gradient
        background: isActive
          ? 'linear-gradient(180deg, #f4e4c1 0%, #e8d4a8 50%, #d9c090 100%)'
          : 'linear-gradient(180deg, #d4a574 0%, #c49464 50%, #b8856e 100%)',
        // Pixel-style border
        border: isActive
          ? '2px solid #ffd93d'
          : '2px solid #8b5a2b',
        // Inner highlight (top) and shadow (bottom)
        boxShadow: isActive
          ? 'inset 0 1px 0 #fff8e0, inset 0 -1px 0 #c9a868, 0 0 8px rgba(255, 217, 61, 0.5)'
          : 'inset 0 1px 0 #e8c898, inset 0 -2px 0 #8b5a2b',
        // Pressed effect
        transform: isActive ? 'translateY(1px)' : 'translateY(0)',
      }}
    >
      {/* Icon */}
      <div
        className="flex items-center justify-center"
        style={{
          filter: isActive ? 'none' : 'brightness(0.9)',
          imageRendering: 'pixelated'
        }}
      >
        {icons[category] || icons.nature}
      </div>

      {/* Label */}
      <span
        className="text-[8px] font-bold uppercase tracking-tight leading-none"
        style={{
          color: isActive ? '#5a3825' : '#f4e0c0',
          textShadow: isActive
            ? '0 1px 0 rgba(255,255,255,0.4)'
            : '0 1px 1px rgba(0,0,0,0.5)',
        }}
      >
        {labels[category] || category}
      </span>
    </button>
  );
};

// Container component for a row of subtabs
interface StardewSubTabGroupProps {
  categories: string[];
  activeCategory: string;
  onSelect: (category: string) => void;
  className?: string;
}

export const StardewSubTabGroup: React.FC<StardewSubTabGroupProps> = ({
  categories,
  activeCategory,
  onSelect,
  className = '',
}) => {
  return (
    <div className={`flex gap-1 justify-center ${className}`}>
      {categories.map((cat) => (
        <StardewSubTab
          key={cat}
          category={cat}
          isActive={activeCategory === cat}
          onClick={() => onSelect(cat)}
        />
      ))}
    </div>
  );
};

export default StardewSubTab;
