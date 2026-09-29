import { Platform } from 'react-native';

/** The dark palette every component in this package uses. */
export const theme = {
  colors: {
    background: '#0b0f19',
    surface: '#111827',
    surfaceRaised: '#1f2937',
    border: '#374151',
    borderMuted: '#1f2937',
    text: '#f9fafb',
    textSecondary: '#d1d5db',
    textMuted: '#9ca3af',
    textFaint: '#6b7280',
    accent: '#6366f1',
    accentStrong: '#4f46e5',
    accentPressed: '#4338ca',
    accentMuted: '#312e81',
    success: '#10b981',
    successMuted: '#064e3b',
    warning: '#f59e0b',
    warningMuted: '#451a03',
    danger: '#ef4444',
    dangerStrong: '#dc2626',
    dangerPressed: '#b91c1c',
    dangerMuted: '#450a0a',
    info: '#60a5fa',
    infoMuted: '#172554',
    neutralStrong: '#374151',
    neutralPressed: '#4b5563',
    // JSON syntax
    jsonKey: '#c4b5fd',
    jsonString: '#86efac',
    jsonNumber: '#fbbf24',
    jsonBoolean: '#f472b6',
    jsonNull: '#9ca3af',
  },
  radius: { sm: 6, md: 8, lg: 12, pill: 999 },
  spacing: { xs: 4, sm: 8, md: 12, lg: 16, xl: 24 },
  fonts: {
    mono: Platform.select({ ios: 'Menlo', default: 'monospace' }),
  },
} as const;

export type Tone = 'neutral' | 'accent' | 'success' | 'warning' | 'danger' | 'info';

/** Foreground and soft background for a tone. */
export function toneColors(tone: Tone): { fg: string; bg: string } {
  const { colors } = theme;
  switch (tone) {
    case 'accent':
      return { fg: colors.accent, bg: colors.accentMuted };
    case 'success':
      return { fg: colors.success, bg: colors.successMuted };
    case 'warning':
      return { fg: colors.warning, bg: colors.warningMuted };
    case 'danger':
      return { fg: colors.danger, bg: colors.dangerMuted };
    case 'info':
      return { fg: colors.info, bg: colors.infoMuted };
    default:
      return { fg: colors.textSecondary, bg: colors.surfaceRaised };
  }
}
