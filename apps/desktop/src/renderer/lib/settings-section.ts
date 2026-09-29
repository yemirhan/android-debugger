import { useEffect, type RefObject } from 'react';
import type { AppSection } from '../../main/app-tabs';

/**
 * "Open Settings at section X" requests (command panel, MCP navigate_ui).
 * The request survives until the section mounts, so it works whether or not
 * Settings is already open.
 */
let pending: AppSection | null = null;
const listeners = new Set<() => void>();

export function requestSettingsSection(section: AppSection): void {
  pending = section;
  listeners.forEach((listener) => listener());
}

/** Scrolls `ref` into view (and focuses it) whenever `section` is requested. */
export function useSettingsSectionTarget(section: AppSection, ref: RefObject<HTMLElement | null>): void {
  useEffect(() => {
    const consume = () => {
      if (pending !== section || !ref.current) return;
      pending = null;
      const element = ref.current;
      // Wait a frame so the panel has laid out after a tab switch.
      requestAnimationFrame(() => {
        element.scrollIntoView({ block: 'start' });
        element.focus({ preventScroll: true });
      });
    };
    consume();
    listeners.add(consume);
    return () => {
      listeners.delete(consume);
    };
  }, [section, ref]);
}
