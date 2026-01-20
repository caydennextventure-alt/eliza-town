import React from 'react';

interface StardewFrameProps {
  children: React.ReactNode;
  className?: string;
  title?: string;
  style?: React.CSSProperties;
}

const ASSET_PATH = '/ai-town/assets/ui/stardew/wood_frame_9slice.png';

export const StardewFrame: React.FC<StardewFrameProps> = ({ children, className = '', title, style }) => {
  return (
    <div
      className={`relative ${className}`}
      style={{
        border: '28px solid transparent', // Rendered border thickness
        borderImageSource: `url(${ASSET_PATH})`,
        borderImageSlice: '350 fill', // ~350px corners from 2048px source image (17%)
        borderImageWidth: '28px', // Display width
        borderImageRepeat: 'stretch',
        imageRendering: 'pixelated',
        ...style,
      }}
    >
      {title && (
        <div className="absolute -top-6 left-1/2 -translate-x-1/2 bg-[#aa6e3e] border-2 border-[#5a3821] px-3 py-1 rounded shadow-md z-10">
          <span className="text-[#ffe6b5] font-bold text-sm drop-shadow-[0_2px_0_rgba(0,0,0,0.5)] font-display uppercase tracking-widest">
            {title}
          </span>
        </div>
      )}
      <div className="relative z-0 w-full h-full">
        {children}
      </div>
    </div>
  );
};
