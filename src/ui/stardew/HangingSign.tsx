import React from 'react';

interface HangingSignProps {
  className?: string;
  scale?: number;
}

const SIGN_ASSET = '/ai-town/assets/ui/stardew/hanging_sign.png';

export const HangingSign: React.FC<HangingSignProps> = ({ className = '', scale = 1 }) => {
  return (
    <div 
      className={`relative inline-block ${className}`}
      style={{
        width: '220px', // Increased for cropped/scaled asset
        height: '140px',
        backgroundImage: `url(${SIGN_ASSET})`,
        backgroundSize: 'contain',
        backgroundRepeat: 'no-repeat',
        backgroundPosition: 'center bottom',
        transform: `scale(${scale})`,
        transformOrigin: 'top center',
        zIndex: 20
      }}
    />
  );
};
