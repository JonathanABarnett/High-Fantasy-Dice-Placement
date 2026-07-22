import type {
  CardCategory,
  DieAffinity,
  ResourcePool,
  ResourceType,
} from '@shattered-crown/shared-types';

import { AFFINITY_INFO, CATEGORY_INFO, RESOURCE_INFO } from './rules-info';

interface ResourceTokenProps {
  readonly resource: ResourceType | 'victoryPoints';
  readonly value?: number;
  readonly compact?: boolean;
}

export function ResourceToken({
  resource,
  value,
  compact = false,
}: ResourceTokenProps) {
  const info = RESOURCE_INFO[resource];
  return (
    <span
      aria-label={`${info.label}${value === undefined ? '' : ` ${value}`}. ${info.description}`}
      className={`info-token resource-token resource-${resource}${compact ? ' compact-token' : ''}`}
      data-tooltip={`${info.label}: ${info.description}`}
      tabIndex={0}
    >
      <span aria-hidden="true" className="token-icon">
        {info.icon}
      </span>
      {!compact && <span className="token-label">{info.label}</span>}
      {value !== undefined && <strong>{value}</strong>}
    </span>
  );
}

export function ResourceList({
  values,
  includeVictoryPoints = false,
  emptyLabel = 'Free',
}: {
  readonly values: Partial<ResourcePool> & { readonly victoryPoints?: number };
  readonly includeVictoryPoints?: boolean;
  readonly emptyLabel?: string;
}) {
  const entries = Object.entries(values).filter(
    ([resource, value]) =>
      value !== undefined &&
      value !== 0 &&
      (includeVictoryPoints || resource !== 'victoryPoints'),
  ) as [ResourceType | 'victoryPoints', number][];
  if (entries.length === 0)
    return <span className="cost-free">{emptyLabel}</span>;
  return (
    <span className="token-list">
      {entries.map(([resource, value]) => (
        <ResourceToken
          compact
          key={resource}
          resource={resource}
          value={value}
        />
      ))}
    </span>
  );
}

export function CategoryToken({
  category,
}: {
  readonly category: CardCategory;
}) {
  const info = CATEGORY_INFO[category];
  return (
    <span
      aria-label={`${info.label}. ${info.description}`}
      className={`category-token category-${category}`}
      data-tooltip={`${info.label}: ${info.description}`}
      tabIndex={0}
    >
      <span aria-hidden="true">{info.icon}</span> {info.label}
    </span>
  );
}

export function AffinityToken({
  affinity,
  compact = false,
}: {
  readonly affinity: DieAffinity;
  readonly compact?: boolean;
}) {
  const info = AFFINITY_INFO[affinity];
  return (
    <span
      aria-label={`${info.label}. ${info.description}`}
      className={`info-token affinity-token affinity-${affinity}${compact ? ' compact-token' : ''}`}
      data-tooltip={`${info.label}: ${info.description}`}
      tabIndex={0}
    >
      <span aria-hidden="true" className="token-icon">
        {info.icon}
      </span>
      {!compact && <span className="token-label">{info.label}</span>}
    </span>
  );
}
