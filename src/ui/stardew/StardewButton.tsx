import React from 'react';

interface StardewButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  active?: boolean;
  variant?: 'default' | 'tab';
}

const TAB_ACTIVE = '/ai-town/assets/ui/stardew/tab_active.png';
const TAB_NORMAL = '/ai-town/assets/ui/stardew/tab_normal.png';

export const StardewButton: React.FC<StardewButtonProps> = ({ 
  children, 
  className = '', 
  active = false, 
  variant = 'default',
  style,
  ...props 
}) => {
  // If variant is 'tab', we use the provided tab images.
  // If default, we might stick to CSS or basic wood styles for now until more assets are provided.
  // Given user request "tab use ...", we focus on that.
  
  if (variant === 'tab') {
    return (
      <button
        type="button"
        className={`relative flex items-center justify-center px-4 py-2 font-display font-bold uppercase tracking-wider text-sm transition-transform active:scale-95 ${className}`}
        style={{
          backgroundImage: `url(${active ? TAB_ACTIVE : TAB_NORMAL})`,
          backgroundSize: '100% 100%',
          backgroundRepeat: 'no-repeat',
          imageRendering: 'pixelated',
          color: active ? '#f2e8c9' : '#bc7544',
          textShadow: active ? '0 2px 0 #934c2a' : 'none',
          height: '48px', // Fixed height to match asset ratio roughly
          minWidth: '100px',
          ...style,
        }}
        {...props}
      >
        <span className="relative z-10 pt-1">{children}</span>
      </button>
    );
  }

  // Default button style - a simple wood-like CSS button if no "button" asset provided
  return (
    <button
      className={`px-3 py-1.5 border-2 border-[#6d4c30] bg-[#8b6b4a] rounded active:bg-[#6d4c30] text-[#f6e2b0] shadow-[0_2px_0_#3b2a21] active:shadow-none active:translate-y-[2px] transition-all font-display font-bold tracking-wide ${className}`}
      {...props}
    >
      {children}
    </button>
  );
};
