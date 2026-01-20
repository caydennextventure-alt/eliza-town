import React from 'react';

interface StardewTabProps {
  label: string;
  isActive: boolean;
  onClick: () => void;
  className?: string;
}

const TAB_ACTIVE = '/ai-town/assets/ui/stardew/tab_active.png';
const TAB_NORMAL = '/ai-town/assets/ui/stardew/tab_normal.png';

export const StardewTab: React.FC<StardewTabProps> = ({ 
  label, 
  isActive, 
  onClick, 
  className = '' 
}) => {
  return (
    <button
      onClick={onClick}
      className={`relative px-6 py-3 font-display text-base tracking-wide uppercase transition-transform cursor-pointer ${className}`}
      style={{
        backgroundImage: `url(${isActive ? TAB_ACTIVE : TAB_NORMAL})`,
        backgroundSize: '100% 100%',
        backgroundRepeat: 'no-repeat',
        backgroundPosition: 'center',
        imageRendering: 'pixelated',
        color: isActive ? '#3e2723' : '#f5e6c8',
        textShadow: isActive 
          ? '0 1px 0 rgba(255,255,255,0.3)' 
          : '0 1px 2px rgba(0,0,0,0.5)',
        border: 'none',
        backgroundColor: 'transparent',
        transform: isActive ? 'translateY(2px)' : 'translateY(0)',
        minWidth: '100px',
        minHeight: '48px'
      }}
    >
      {label}
    </button>
  );
};
