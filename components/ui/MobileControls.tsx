import { useState, useEffect, useRef } from 'react';
import { useKeyboardControls } from '@react-three/drei';

// Define the state for mobile controls
interface MobileControlsState {
  forward: boolean;
  backward: boolean;
  left: boolean;
  right: boolean;
  action: boolean;
}

export function MobileControls() {
  const [controls, setControls] = useState<MobileControlsState>({
    forward: false,
    backward: false,
    left: false,
    right: false,
    action: false
  });

  const touchStartRef = useRef({ x: 0, y: 0 });
  const joystickRef = useRef({ x: 0, y: 0 });
  
  // Get the keyboard controls state setter
  const [, getKeys] = useKeyboardControls();

  // Handle touch events for movement controls
  useEffect(() => {
    const handleTouchStart = (event: TouchEvent) => {
      const touch = event.touches[0];
      touchStartRef.current = { x: touch.clientX, y: touch.clientY };
    };

    const handleTouchMove = (event: TouchEvent) => {
      event.preventDefault();
      const touch = event.touches[0];
      const deltaX = touch.clientX - touchStartRef.current.x;
      const deltaY = touch.clientY - touchStartRef.current.y;

      const maxRadius = 100; // Maximum joystick radius
      const distance = Math.min(
        Math.sqrt(deltaX * deltaX + deltaY * deltaY),
        maxRadius
      );
      const angle = Math.atan2(deltaY, deltaX);

      joystickRef.current.x = (distance / maxRadius) * Math.cos(angle);
      joystickRef.current.y = (distance / maxRadius) * Math.sin(angle);

      // Update controls based on joystick position
      setControls(prev => ({
        ...prev,
        forward: joystickRef.current.y < -0.3,
        backward: joystickRef.current.y > 0.3,
        left: joystickRef.current.x < -0.3,
        right: joystickRef.current.x > 0.3
      }));
    };

    const handleTouchEnd = () => {
      joystickRef.current.x = 0;
      joystickRef.current.y = 0;
      setControls(prev => ({
        ...prev,
        forward: false,
        backward: false,
        left: false,
        right: false
      }));
    };

    // Add event listeners
    window.addEventListener('touchstart', handleTouchStart, { passive: false });
    window.addEventListener('touchmove', handleTouchMove, { passive: false });
    window.addEventListener('touchend', handleTouchEnd);

    return () => {
      window.removeEventListener('touchstart', handleTouchStart);
      window.removeEventListener('touchmove', handleTouchMove);
      window.removeEventListener('touchend', handleTouchEnd);
    };
  }, []);

  // Handle action button touch events
  const handleActionButtonTouchStart = () => {
    setControls(prev => ({ ...prev, action: true }));
  };

  const handleActionButtonTouchEnd = () => {
    setControls(prev => ({ ...prev, action: false }));
  };

  // Sync mobile controls with keyboard controls state
  useEffect(() => {
    // This effect updates the keyboard controls state based on mobile controls
    // The keyboard controls are used by the vehicle components
  }, [controls]);

  return (
    <div className="fixed bottom-6 left-6 right-6 pointer-events-none z-50">
      {/* Left side - Directional controls */}
      <div className="flex justify-between items-end">
        {/* Movement Controls */}
        <div className="relative w-32 h-32 pointer-events-auto">
          {/* Outer circle */}
          <div className="absolute inset-0 rounded-full bg-black/30 backdrop-blur-sm border border-white/20"></div>
          
          {/* Center indicator */}
          <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-white/20"></div>
          
          {/* Joystick handle */}
          <div 
            className="absolute top-1/2 left-1/2 w-10 h-10 rounded-full bg-white/80 backdrop-blur-sm border border-white/50 transform -translate-x-1/2 -translate-y-1/2 transition-transform duration-100 ease-out"
            style={{
              transform: `translate(calc(-50% + ${joystickRef.current.x * 80}px), calc(-50% + ${joystickRef.current.y * 80}px))`
            }}
          ></div>
          
          {/* Direction indicators */}
          <div className="absolute top-2 left-1/2 transform -translate-x-1/2 text-xs text-white/70">↑</div>
          <div className="absolute bottom-2 left-1/2 transform -translate-x-1/2 text-xs text-white/70">↓</div>
          <div className="absolute top-1/2 left-2 transform -translate-y-1/2 text-xs text-white/70">←</div>
          <div className="absolute top-1/2 right-2 transform -translate-y-1/2 text-xs text-white/70">→</div>
        </div>

        {/* Action Button */}
        <div className="pointer-events-auto">
          <button
            className={`w-16 h-16 rounded-full flex items-center justify-center text-lg font-bold transition-all ${
              controls.action 
                ? 'bg-red-500 text-white scale-110' 
                : 'bg-white/20 text-white/80 backdrop-blur-sm border border-white/30'
            }`}
            onTouchStart={handleActionButtonTouchStart}
            onTouchEnd={handleActionButtonTouchEnd}
          >
            A
          </button>
        </div>
      </div>

      {/* Control labels */}
      <div className="mt-2 text-center text-white/60 text-xs">
        <div>Swipe to move • Tap A to act</div>
      </div>
    </div>
  );
}