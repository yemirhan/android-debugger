declare const __SDK_VERSION__: string | undefined;

// Replaced with the package.json version at build time (see tsup.config.ts).
export const SDK_VERSION: string = typeof __SDK_VERSION__ === 'string' ? __SDK_VERSION__ : '0.0.0-dev';
