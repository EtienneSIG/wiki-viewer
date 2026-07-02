/**
 * Theme management (Principle IV — accessibility, supports high-contrast).
 */
import type { ThemeId } from '../lib/types';

export function applyTheme(theme: ThemeId): void {
  const root = document.documentElement;
  const prefersDark =
    typeof window !== 'undefined' &&
    window.matchMedia?.('(prefers-color-scheme: dark)').matches === true;
  const effective = theme === 'system' ? (prefersDark ? 'dark' : 'light') : theme;
  root.dataset.theme = effective;
  root.setAttribute('data-theme', effective);
}

export const SHIKI_THEME_FOR: Record<ThemeId, 'github-light' | 'github-dark'> = {
  system: 'github-light',
  light: 'github-light',
  dark: 'github-dark',
  'high-contrast': 'github-dark',
};
