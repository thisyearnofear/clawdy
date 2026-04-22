import { createContext, useContext } from 'react';

// Centralized UI Constants to solve z-index scattering
export const UI_Z_INDEX = {
  BACKGROUND: 'z-0',
  WORLD: 'z-10',
  HUD: 'z-20',
  MODAL_OVERLAY: 'z-40',
  TERMINAL: 'z-50',
};

// Minimal HUD state definition
export type HUDMode = 'full' | 'minimal' | 'hidden';
