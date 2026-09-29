import { useState, useCallback, useEffect } from 'react';
import type { TabId } from '../App';
import { tabToGroup } from '../data/navigation';

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
      const parsed = JSON.parse(saved) as Partial<NavigationState> | null;
      return {
        expandedGroups: Array.isArray(parsed?.expandedGroups)
          ? parsed.expandedGroups.filter((id): id is string => typeof id === 'string')
          : defaultState.expandedGroups,
        sidebarExpanded: typeof parsed?.sidebarExpanded === 'boolean'
          ? parsed.sidebarExpanded
          : defaultState.sidebarExpanded,
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

  // Auto-expand group when active tab changes
  useEffect(() => {
    const group = tabToGroup[activeTab];
    if (!group) return;
    setState(prev => prev.expandedGroups.includes(group)
      ? prev
      : { ...prev, expandedGroups: [...prev.expandedGroups, group] });
  }, [activeTab]);

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
  };
}
