'use client'

import { ReactNode } from 'react'

interface GlassPanelProps {
  children: ReactNode
  title?: string
  icon?: string
  className?: string
  onClose?: () => void
  collapsible?: boolean
  isCollapsed?: boolean
  onToggleCollapse?: () => void
}

export function GlassPanel({ 
  children, 
  title, 
  icon, 
  className = "", 
  collapsible, 
  isCollapsed, 
  onToggleCollapse 
}: GlassPanelProps) {
  return (
    <div className={`bg-black/40 backdrop-blur-xl rounded-2xl border border-white/10 shadow-2xl overflow-hidden transition-all duration-300 ${className}`}>
      {title && (
        <div 
          className={`bg-white/5 px-4 py-3 border-b border-white/10 flex justify-between items-center ${collapsible ? 'cursor-pointer select-none' : ''}`}
          onClick={collapsible ? onToggleCollapse : undefined}
        >
          <div className="flex items-center gap-2">
            {icon && <span className="text-sm">{icon}</span>}
            <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-sky-400">{title}</h3>
          </div>
          {collapsible && (
            <span className={`text-[10px] opacity-50 transform transition-transform ${isCollapsed ? '' : 'rotate-180'}`}>
              ▼
            </span>
          )}
        </div>
      )}
      <div className={`transition-all duration-300 ${isCollapsed ? 'max-h-0' : 'max-h-[80vh] opacity-100'} overflow-y-auto scrollbar-hide`}>
        <div className="p-4">
          {children}
        </div>
      </div>
    </div>
  )
}
