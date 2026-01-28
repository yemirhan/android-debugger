import { useState, useCallback, useEffect } from 'react';
import type { TabId } from '../App';

const STORAGE_KEY = 'android-debugger-nav-state';

interface NavigationState {
  expandedGroups: string[];
  sidebarExpanded: boolean;
}

const defaultState: NavigationState = {
  expandedGroups: ['performance', 'debugging', 'app-state', 'tools'],
  sidebarExpanded: true,
};

function loadState(): NavigationState {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      return {
        ...defaultState,
        ...parsed,
      };
    }
  } catch (e) {
    console.warn('Failed to load navigation state:', e);
  }
  return defaultState;
}

function saveState(state: NavigationState) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (e) {
    console.warn('Failed to save navigation state:', e);
  }
}

export function useNavigationState(activeTab: TabId) {
  const [state, setState] = useState<NavigationState>(loadState);

  // Save state changes to localStorage
  useEffect(() => {
    saveState(state);
  }, [state]);

  // Auto-expand group containing active tab
  const getGroupForTab = useCallback((tab: TabId): string | null => {
    const tabToGroup: Record<string, string> = {
      // Performance
      'memory': 'performance',
      'cpu-fps': 'performance',
      'battery': 'performance',
      'network-stats': 'performance',
      // Debugging
      'logs': 'debugging',
      'crashes': 'debugging',
      'network': 'debugging',
      'websocket': 'debugging',
      'sdk': 'debugging',
      // App State
      'activity-stack': 'app-state',
      'jobs': 'app-state',
      'alarms': 'app-state',
      'services': 'app-state',
      'file-inspector': 'app-state',
      // Tools
      'intent-tester': 'tools',
      'screen-capture': 'tools',
      'dev-options': 'tools',
      'app-info': 'tools',
    };
    return tabToGroup[tab] || null;
  }, []);

  // Auto-expand group when active tab changes
  useEffect(() => {
    const group = getGroupForTab(activeTab);
    if (group && !state.expandedGroups.includes(group)) {
      setState(prev => ({
        ...prev,
        expandedGroups: [...prev.expandedGroups, group],
      }));
    }
  }, [activeTab, getGroupForTab, state.expandedGroups]);

  const toggleGroup = useCallback((groupId: string) => {
    setState(prev => ({
      ...prev,
      expandedGroups: prev.expandedGroups.includes(groupId)
        ? prev.expandedGroups.filter(id => id !== groupId)
        : [...prev.expandedGroups, groupId],
    }));
  }, []);

  const isGroupExpanded = useCallback((groupId: string) => {
    return state.expandedGroups.includes(groupId);
  }, [state.expandedGroups]);

  const toggleSidebar = useCallback(() => {
    setState(prev => ({
      ...prev,
      sidebarExpanded: !prev.sidebarExpanded,
    }));
  }, []);

  return {
    expandedGroups: state.expandedGroups,
    sidebarExpanded: state.sidebarExpanded,
    toggleGroup,
    isGroupExpanded,
    toggleSidebar,
    getGroupForTab,
  };
}
