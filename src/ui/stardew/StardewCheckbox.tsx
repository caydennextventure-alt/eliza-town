import React from 'react';

interface StardewCheckboxProps {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  className?: string;
  disabled?: boolean;
}

const CHECKED_ICON = '/ai-town/assets/ui/stardew/checked.png';
const UNCHECKED_ICON = '/ai-town/assets/ui/stardew/uncheck.png';

export const StardewCheckbox: React.FC<StardewCheckboxProps> = ({ 
  label, 
  checked, 
  onChange, 
  className = '',
  disabled = false 
}) => {
  return (
    <div 
      className={`flex items-center gap-2 cursor-pointer select-none ${disabled ? 'opacity-50 cursor-not-allowed' : ''} ${className}`}
      onClick={() => !disabled && onChange(!checked)}
    >
      <div className="relative w-8 h-8 flex-shrink-0">
        <img 
          src={checked ? CHECKED_ICON : UNCHECKED_ICON} 
          alt={checked ? "Checked" : "Unchecked"}
          className="w-full h-full object-contain image-pixelated"
          style={{ imageRendering: 'pixelated' }}
        />
      </div>
      <span className="text-[#5a2e16] font-display font-bold text-lg tracking-wide drop-shadow-[0_1px_0_rgba(255,255,255,0.3)]">
        {label}
      </span>
    </div>
  );
};
