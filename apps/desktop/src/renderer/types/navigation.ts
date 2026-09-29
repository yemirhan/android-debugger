import type React from 'react';
import type { TabId } from '../App';

export interface NavItem {
  id: TabId;
  label: string;
  icon: React.ReactNode;
  /** The panel only shows data once an app package is selected. */
  needsPackage?: boolean;
}

export interface NavGroup {
  id: string;
  label: string;
  icon: React.ReactNode;
  items: NavItem[];
}
