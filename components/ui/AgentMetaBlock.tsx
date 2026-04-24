'use client'

import React, { type ReactNode } from 'react'
import { getMemeMarketStrategy } from '../../services/AgentProtocol'

interface AgentMetaBlockProps {
  agentLabel?: string
  strategyId?: string
  summary?: string
  title?: string
  prefix?: ReactNode
  className?: string
  agentLabelClassName?: string
  strategyClassName?: string
  summaryClassName?: string
  titleClassName?: string
  badgeClassName?: string
  variant?: 'stack' | 'badge' | 'header' | 'name'
}

export function AgentMetaBlock({
  agentLabel,
  strategyId,
  summary,
  title,
  prefix,
  className = '',
  agentLabelClassName = '',
  strategyClassName = '',
  summaryClassName = '',
  titleClassName = '',
  badgeClassName = '',
  variant = 'stack',
}: AgentMetaBlockProps) {
  const strategyLabel = getMemeMarketStrategy(strategyId)?.label

  if (variant === 'badge') {
    return (
      <span className={`inline-flex items-center gap-1 rounded-xl border border-sky-400/15 bg-sky-500/5 px-3 py-1 ${badgeClassName}`.trim()}>
        {prefix && <span className="shrink-0">{prefix}</span>}
        <span>{strategyLabel ?? agentLabel ?? 'Unset'}</span>
      </span>
    )
  }

  if (variant === 'name') {
    return (
      <div className={`flex min-w-0 items-center gap-2 ${className}`.trim()}>
        {prefix && <div className="shrink-0">{prefix}</div>}
        {agentLabel && <span className={agentLabelClassName}>{agentLabel}</span>}
      </div>
    )
  }

  if (variant === 'header') {
    return (
      <div className={`min-w-0 ${className}`.trim()}>
        {title && <div className={titleClassName}>{title}</div>}
        <div className="mt-1 flex min-w-0 items-start gap-2">
          {prefix && <div className="shrink-0">{prefix}</div>}
          <div className="min-w-0">
            {agentLabel && <span className={agentLabelClassName}>{agentLabel}</span>}
            {summary && <div className={summaryClassName}>{summary}</div>}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className={`min-w-0 ${className}`.trim()}>
      <div className="flex min-w-0 items-start gap-2">
        {prefix && <div className="shrink-0">{prefix}</div>}
        <div className="min-w-0">
          {agentLabel && <span className={agentLabelClassName}>{agentLabel}</span>}
          {strategyLabel && <div className={strategyClassName}>{strategyLabel}</div>}
        </div>
      </div>
      {summary && <div className={summaryClassName}>{summary}</div>}
    </div>
  )
}
