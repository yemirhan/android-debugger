import type { TabId } from '../App';

export interface NavItem {
  id: TabId;
  label: string;
  icon: React.ReactNode;
}

export interface NavGroup {
  id: string;
  label: string;
  icon: React.ReactNode;
  items: NavItem[];
}

export interface NavigationState {
  activeTab: TabId;
  expandedGroups: string[];
  sidebarExpanded: boolean;
}
