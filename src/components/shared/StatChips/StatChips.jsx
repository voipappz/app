import React from 'react';
import { Box, Paper, Tooltip, Typography } from '@mui/material';

/**
 * StatChips — the shared clickable counter-chip bar used across screens
 * (extracted from the Calls summary counters so Calls / Users / Devices /
 * live pop-outs all read the same). Each item is a small Paper "chip" with
 * icon + value + label; clicking calls item.onClick. A `live` item gets a
 * pulsing dot so real-time counters are visually distinct from historical ones.
 *
 * items: [{ key, label, value, icon, color?, colorVar?, active?, live?, onClick?, hint? }]
 *   hint:     a tooltip saying what the number is (or what clicking does)
 *   color:    an explicit hex (e.g. '#8b5cf6'); takes precedence
 *   colorVar: a CSS var name (e.g. '--counter-total') matching the Calls theme
 */
const StatChips = ({ items = [], sx, size = 'medium' }) => {
  const large = size === 'large';
  if (!items.length) return null;

  const colorOf = (item) =>
    item.color || (item.colorVar ? `var(${item.colorVar})` : 'var(--theme-text-secondary)');

  return (
    <Box sx={{ display: 'flex', gap: 1.5, flexWrap: 'wrap', alignItems: 'center', ...sx }}>
      {items.map((item) => {
        const clickable = typeof item.onClick === 'function';
        const accent = colorOf(item);
        const chip = (
          <Paper
            key={item.key || item.label}
            data-stat={item.key}
            elevation={0}
            role={clickable ? 'button' : undefined}
            tabIndex={clickable ? 0 : undefined}
            // A clickable chip is a toggle: say which one is on.
            aria-pressed={clickable ? Boolean(item.active) : undefined}
            onClick={item.onClick}
            onKeyDown={(e) => {
              if (clickable && (e.key === 'Enter' || e.key === ' ')) {
                e.preventDefault();
                item.onClick(e);
              }
            }}
            sx={{
              display: 'flex',
              alignItems: 'center',
              px: large ? 2.25 : 1.5,
              py: large ? 1.25 : 0.75,
              minWidth: large ? 150 : undefined,
              gap: large ? 1.25 : 1,
              cursor: clickable ? 'pointer' : 'default',
              userSelect: 'none',
              border: '1px solid',
              borderColor: item.active ? accent : 'var(--theme-border)',
              borderRadius: '6px',
              backgroundColor: item.active ? 'var(--theme-hover)' : 'var(--theme-bg-secondary)',
              boxShadow: item.active ? 'var(--shadow-subtle)' : 'none',
              transition: 'all 0.15s ease',
              ...(clickable && {
                '&:hover': {
                  transform: 'translateY(-1px)',
                  boxShadow: 'var(--shadow-subtle)',
                  borderColor: accent,
                  backgroundColor: 'var(--theme-hover)',
                },
              }),
            }}
          >
            {item.live && (
              <Box
                component="span"
                sx={{
                  width: 8,
                  height: 8,
                  borderRadius: '50%',
                  backgroundColor: accent,
                  flexShrink: 0,
                  animation: 'statChipPulse 1.6s ease-in-out infinite',
                  '@keyframes statChipPulse': {
                    '0%, 100%': { opacity: 1, transform: 'scale(1)' },
                    '50%': { opacity: 0.35, transform: 'scale(0.7)' },
                  },
                }}
              />
            )}
            {item.icon &&
              React.cloneElement(item.icon, {
                sx: { fontSize: large ? 24 : 18, color: accent, opacity: 0.9 },
              })}
            <Typography
              sx={{
                fontWeight: large ? 700 : 600,
                fontSize: large ? '1.35rem' : '0.9rem',
                lineHeight: 1,
                color: 'var(--theme-text-primary)',
                fontFamily: 'Rubik, sans-serif',
              }}
            >
              {item.value}
            </Typography>
            <Typography
              sx={{
                fontSize: large ? '0.9rem' : '0.75rem',
                fontWeight: 500,
                opacity: 0.9,
                color: 'var(--theme-text-secondary)',
                fontFamily: 'Rubik, sans-serif',
              }}
            >
              {item.label}
            </Typography>
          </Paper>
        );
        return item.hint
          ? <Tooltip key={item.key || item.label} title={item.hint} describeChild>{chip}</Tooltip>
          : chip;
      })}
    </Box>
  );
};

export default StatChips;
