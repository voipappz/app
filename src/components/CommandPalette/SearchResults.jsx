import { useEffect, useRef } from 'react';
import { Box, CircularProgress } from '@mui/material';
import { useTranslation } from 'react-i18next';
import { PRIMARY_CHIP_COUNT } from './useGlobalSearchResults';
import { splitMatch } from '../../utils/searchText';
import './CommandPalette.css';

// Bold the matched part of a label (Algolia-style highlighting).
const Highlight = ({ text, query }) => {
  const parts = splitMatch(text, query);
  if (!parts) return text;
  return (
    <>
      {parts[0]}
      <b>{parts[1]}</b>
      {parts[2]}
    </>
  );
};

// Renderer for the global search results, in the CommandPalette dialog.
// All state/behavior comes from useGlobalSearchResults.
const SearchResults = ({ search }) => {
  const { t } = useTranslation('search');
  const {
    query,
    groups, flatItems,
    highlightIndex, setHighlightIndex,
    resourceLoading,
    resourceType, setResourceType,
    types,
    showAllChips, setShowAllChips,
    resourceSearch = true,
  } = search;
  const resultsRef = useRef(null);

  // Keep the keyboard-highlighted row in view
  useEffect(() => {
    const el = resultsRef.current?.querySelector('.command-palette-item.highlighted');
    el?.scrollIntoView?.({ block: 'nearest' });
  }, [highlightIndex]);

  const hasQuery = query.trim().length > 0;
  const visibleChips = showAllChips ? types : types.slice(0, PRIMARY_CHIP_COUNT);
  const hiddenCount = types.length - PRIMARY_CHIP_COUNT;
  let itemIndex = -1;

  return (
    <>
      {/* Resource type filter chips — only shown when typing. Tab cycles them. */}
      {hasQuery && resourceSearch && (
        <Box className="command-palette-chips" role="tablist" aria-label={t('types.all', { defaultValue: 'Type' })}>
          <button
            type="button"
            role="tab"
            aria-selected={resourceType === null}
            className={`command-palette-chip ${resourceType === null ? 'active' : ''}`}
            onClick={() => setResourceType(null)}
          >
            {t('chips.all')}
          </button>
          {visibleChips.map(rt => (
            <button
              key={rt.key}
              type="button"
              role="tab"
              aria-selected={resourceType === rt.key}
              className={`command-palette-chip ${resourceType === rt.key ? 'active' : ''}`}
              onClick={() => setResourceType(prev => (prev === rt.key ? null : rt.key))}
            >
              {t(rt.labelKey)}
            </button>
          ))}
          {!showAllChips && hiddenCount > 0 && (
            <button type="button" className="command-palette-chip" onClick={() => setShowAllChips(true)}>
              {t('chips.more', { count: hiddenCount })}
            </button>
          )}
        </Box>
      )}

      <Box className="command-palette-results" ref={resultsRef} role="listbox" aria-label={t('title')}>
        {groups.map((group) => (
          <Box key={group.id || group.label} role="group" aria-label={group.label}>
            <Box className="command-palette-section-header">
              <span>{group.label}</span>
              {resourceLoading && group.isResource && <CircularProgress size={10} />}
            </Box>
            {group.items.map((item) => {
              itemIndex++;
              const currentIndex = itemIndex;
              const IconComp = item.iconComponent;
              const highlighted = currentIndex === highlightIndex;
              return (
                <Box
                  key={item.id}
                  role="option"
                  aria-selected={highlighted}
                  className={`command-palette-item ${item.isFooter ? 'command-palette-item-footer' : ''} ${highlighted ? 'highlighted' : ''}`}
                  onClick={item.action}
                  onMouseEnter={() => setHighlightIndex(currentIndex)}
                >
                  {IconComp && (
                    <Box className="command-palette-item-icon">
                      <IconComp sx={{ fontSize: 18 }} />
                    </Box>
                  )}
                  <Box className="command-palette-item-content">
                    <Box className="command-palette-item-label">
                      {item.isFooter ? item.label : <Highlight text={item.label} query={query} />}
                    </Box>
                    {item.description && (
                      <Box className="command-palette-item-description">{item.description}</Box>
                    )}
                  </Box>
                  {item.badge && (
                    <Box className="command-palette-item-badge">{item.badge}</Box>
                  )}
                  {item.envName && (
                    <Box className="command-palette-item-env">{item.envName}</Box>
                  )}
                  {item.timeLabel && (
                    <Box className="command-palette-item-time">{item.timeLabel}</Box>
                  )}
                  {item.path && !item.badge && !item.timeLabel && (
                    <Box className="command-palette-item-path">{item.path}</Box>
                  )}
                </Box>
              );
            })}
          </Box>
        ))}

        {resourceLoading && flatItems.length === 0 && (
          <Box className="command-palette-loading">
            <CircularProgress size={18} />
            {t('searching')}
          </Box>
        )}

        {!resourceLoading && flatItems.length === 0 && hasQuery && (
          <Box className="command-palette-empty">
            {t('noResults', { query })}
          </Box>
        )}
      </Box>

      <Box className="command-palette-footer">{t('hints')}</Box>
    </>
  );
};

export default SearchResults;
