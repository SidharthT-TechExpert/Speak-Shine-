import { BackgroundColor, Theme, Color } from '@adobe/leonardo-contrast-colors';

/**
 * Adobe Leonardo Contrast Palette Generator for Speak & Shine
 * Generates mathematically calibrated opposite tokens for Light and Dark modes.
 */

export function generateLightModeTokens() {
  const lightBg = new BackgroundColor({
    name: 'bg',
    colorKeys: ['#faf9f6'],
    ratios: [1]
  });

  const primary = new Color({
    name: 'primary',
    colorKeys: ['#4f46e5', '#6366f1', '#818cf8'],
    ratios: [3.0, 4.5, 7.0]
  });

  const cyan = new Color({
    name: 'cyan',
    colorKeys: ['#0284c7', '#06b6d4', '#22d3ee'],
    ratios: [3.0, 4.5, 7.0]
  });

  const pink = new Color({
    name: 'pink',
    colorKeys: ['#be185d', '#e11d48', '#f43f5e'],
    ratios: [3.0, 4.5, 7.0]
  });

  const success = new Color({
    name: 'success',
    colorKeys: ['#047857', '#10b981', '#34d399'],
    ratios: [3.0, 4.5, 7.0]
  });

  const warning = new Color({
    name: 'warning',
    colorKeys: ['#b45309', '#f59e0b', '#fbbf24'],
    ratios: [3.0, 4.5, 7.0]
  });

  const danger = new Color({
    name: 'danger',
    colorKeys: ['#b91c1c', '#ef4444', '#f87171'],
    ratios: [3.0, 4.5, 7.0]
  });

  const neutral = new Color({
    name: 'neutral',
    colorKeys: ['#0f172a', '#334155', '#64748b'],
    ratios: [3.0, 4.5, 7.0, 14.0]
  });

  const lightTheme = new Theme({
    colors: [primary, cyan, pink, success, warning, danger, neutral],
    backgroundColor: lightBg,
    lightness: 98
  });

  return lightTheme.contrastColors;
}

console.log('--- Adobe Leonardo Generated Light Mode Theme ---');
console.log(JSON.stringify(generateLightModeTokens(), null, 2));
