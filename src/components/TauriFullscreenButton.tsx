'use client';

import React, { useState, useEffect } from 'react';
import { Maximize2, Minimize2 } from 'lucide-react';
import { isTauriEnvironment, toggleTauriFullscreen, isTauriFullscreen } from '@/lib/tauriPOS';

interface TauriFullscreenButtonProps {
  className?: string;
  iconClassName?: string;
}

export default function TauriFullscreenButton({ 
  className, 
  iconClassName = "w-4 h-4" 
}: TauriFullscreenButtonProps) {
  const [isTauri, setIsTauri] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);

  useEffect(() => {
    if (isTauriEnvironment()) {
      setIsTauri(true);
      isTauriFullscreen().then(setIsFullscreen);

      const handleFullscreenChange = () => {
        isTauriFullscreen().then(setIsFullscreen);
      };

      document.addEventListener('fullscreenchange', handleFullscreenChange);
      return () => {
        document.removeEventListener('fullscreenchange', handleFullscreenChange);
      };
    }
  }, []);

  if (!isTauri) {
    return null;
  }

  const handleToggle = async () => {
    const newState = await toggleTauriFullscreen();
    setIsFullscreen(newState);
  };

  return (
    <button
      onClick={handleToggle}
      className={
        className ||
        "p-2 bg-coffee-cream/30 hover:bg-coffee-light border border-coffee-accent/40 text-coffee-dark hover:text-coffee-primary rounded-xl transition-all duration-200 cursor-pointer shadow-xs flex items-center justify-center"
      }
      title={isFullscreen ? "Thu nhỏ về cửa sổ thông thường" : "Phóng to toàn màn hình (Fullscreen)"}
      aria-label="Toggle Fullscreen"
    >
      {isFullscreen ? (
        <Minimize2 className={iconClassName} />
      ) : (
        <Maximize2 className={iconClassName} />
      )}
    </button>
  );
}
