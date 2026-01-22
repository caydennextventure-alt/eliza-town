import { useMutation } from 'convex/react';
import { internal } from '../../convex/_generated/api';
import React from 'react';

export default function MapSwitcher({ onSwitch }: { onSwitch: () => void }) {
  const toggleMap = useMutation(internal.testing.toggleTestMap);

  const handleSwitch = async () => {
    // Notify parent to show loading screen
    onSwitch();
    
    // Trigger backend switch
    try {
      await toggleMap();
    } catch (e) {
      console.error("Failed to switch map:", e);
    }
  };

  return (
    <div className="absolute bottom-4 left-4 z-50 pointer-events-auto">
      <button
        onClick={handleSwitch}
        className="bg-white border-2 border-brown-700 text-brown-900 px-4 py-2 rounded-lg shadow-md hover:bg-brown-100 font-pixel font-bold active:translate-y-1 transition-all"
        style={{ fontFamily: '"Press Start 2P", cursive', fontSize: '10px' }}
      >
        SWITCH MAP
      </button>
    </div>
  );
}
