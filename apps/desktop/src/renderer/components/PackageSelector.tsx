import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import type { Device } from '@android-debugger/shared';

interface PackageSelectorProps {
  device: Device;
  value: string;
  onChange: (value: string) => void;
}

const PackageIcon = () => (
  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
  </svg>
);

const ChevronIcon = () => (
  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
  </svg>
);

// Fuzzy match scoring - returns score and match indices
function fuzzyMatch(pattern: string, str: string): { score: number; indices: number[] } | null {
  const patternLower = pattern.toLowerCase();
  const strLower = str.toLowerCase();

  if (pattern.length === 0) return { score: 1, indices: [] };
  if (pattern.length > str.length) return null;

  // Check if all characters exist in order
  let patternIdx = 0;
  let score = 0;
  let consecutiveBonus = 0;
  let lastMatchIdx = -1;
  const indices: number[] = [];

  for (let i = 0; i < strLower.length && patternIdx < patternLower.length; i++) {
    if (strLower[i] === patternLower[patternIdx]) {
      indices.push(i);

      // Bonus for consecutive matches
      if (lastMatchIdx === i - 1) {
        consecutiveBonus += 5;
      } else {
        consecutiveBonus = 0;
      }

      // Bonus for matching at word boundaries (after . or at start)
      if (i === 0 || str[i - 1] === '.') {
        score += 10;
      }

      // Bonus for exact case match
      if (pattern[patternIdx] === str[i]) {
        score += 1;
      }

      score += 1 + consecutiveBonus;
      lastMatchIdx = i;
      patternIdx++;
    }
  }

  // All pattern characters must be found
  if (patternIdx !== patternLower.length) return null;

  // Penalize longer strings slightly
  score -= str.length * 0.1;

  // Bonus for matching from the start
  if (indices[0] === 0) {
    score += 15;
  }

  return { score, indices };
}

export function PackageSelector({ device, value, onChange }: PackageSelectorProps) {
  const [packages, setPackages] = useState<string[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [highlightedIndex, setHighlightedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  // Fetch packages whenever the device changes. Clear the previous device's list
  // and ignore responses that resolve after the device has changed again.
  useEffect(() => {
    let cancelled = false;
    setPackages([]);
    setLoadError(null);
    const fetchPackages = async () => {
      setLoading(true);
      try {
        const result = await window.electronAPI.getPackages(device.id, true);
        if (!cancelled) setPackages(result);
      } catch (error) {
        console.error('Error fetching packages:', error);
        if (!cancelled) setLoadError(error instanceof Error ? error.message : 'Failed to load packages');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    fetchPackages();
    return () => {
      cancelled = true;
    };
  }, [device.id]);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsOpen(false);
        setSearch('');
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Fuzzy filter and sort packages
  const filteredPackages = useMemo(() => {
    if (!search) {
      return packages.map(pkg => ({ pkg, score: 0, indices: [] as number[] }));
    }

    const results: { pkg: string; score: number; indices: number[] }[] = [];

    for (const pkg of packages) {
      const match = fuzzyMatch(search, pkg);
      if (match) {
        results.push({ pkg, score: match.score, indices: match.indices });
      }
    }

    // Sort by score descending
    results.sort((a, b) => b.score - a.score);

    return results;
  }, [packages, search]);

  // Reset highlighted index when filter changes
  useEffect(() => {
    setHighlightedIndex(0);
  }, [search]);

  // Scroll highlighted item into view
  useEffect(() => {
    if (isOpen && listRef.current) {
      const highlightedItem = listRef.current.children[highlightedIndex] as HTMLElement;
      if (highlightedItem) {
        highlightedItem.scrollIntoView({ block: 'nearest' });
      }
    }
  }, [highlightedIndex, isOpen]);

  const handleSelect = useCallback((pkg: string) => {
    onChange(pkg);
    setSearch('');
    setIsOpen(false);
    setHighlightedIndex(0);
    inputRef.current?.blur();
  }, [onChange]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSearch(e.target.value);
    if (!isOpen) setIsOpen(true);
  };

  const handleClose = useCallback(() => {
    setIsOpen(false);
    setSearch('');
    setHighlightedIndex(0);
  }, []);

  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
    const maxIndex = Math.min(filteredPackages.length, 50) - 1;

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        if (!isOpen) {
          setIsOpen(true);
        } else {
          setHighlightedIndex(prev => Math.min(prev + 1, maxIndex));
        }
        break;

      case 'ArrowUp':
        e.preventDefault();
        if (isOpen) {
          setHighlightedIndex(prev => Math.max(prev - 1, 0));
        }
        break;

      case 'Enter':
        e.preventDefault();
        if (isOpen && filteredPackages[highlightedIndex]) {
          handleSelect(filteredPackages[highlightedIndex].pkg);
        }
        break;

      case 'Escape':
        e.preventDefault();
        setIsOpen(false);
        setSearch('');
        break;

      case 'Tab':
        // Only auto-select on Tab if the user actually typed a query; otherwise
        // tabbing through the UI would silently replace the selected package.
        if (isOpen && search && filteredPackages[highlightedIndex]) {
          handleSelect(filteredPackages[highlightedIndex].pkg);
        } else {
          setIsOpen(false);
          setSearch('');
        }
        break;
    }
  }, [isOpen, search, filteredPackages, highlightedIndex, handleSelect]);

  // Render package name with highlighted matches
  const renderHighlightedText = (text: string, indices: number[]) => {
    if (indices.length === 0) {
      return <span>{text}</span>;
    }

    const indicesSet = new Set(indices);
    const result: React.ReactNode[] = [];
    let currentRun = '';
    let isHighlighted = false;

    for (let i = 0; i < text.length; i++) {
      const charHighlighted = indicesSet.has(i);

      if (charHighlighted !== isHighlighted) {
        if (currentRun) {
          result.push(
            isHighlighted ? (
              <span key={i} className="text-accent font-semibold">{currentRun}</span>
            ) : (
              <span key={i}>{currentRun}</span>
            )
          );
        }
        currentRun = '';
        isHighlighted = charHighlighted;
      }
      currentRun += text[i];
    }

    if (currentRun) {
      result.push(
        isHighlighted ? (
          <span key="last" className="text-accent font-semibold">{currentRun}</span>
        ) : (
          <span key="last">{currentRun}</span>
        )
      );
    }

    return <>{result}</>;
  };

  return (
    <div className="relative" ref={dropdownRef}>
      <div className={`flex items-center gap-2 h-8 px-2.5 bg-background rounded-md border transition-colors text-text-muted ${
        isOpen ? 'border-accent' : 'border-border-muted hover:border-border'
      }`}>
        <PackageIcon />
        <input
          ref={inputRef}
          type="text"
          value={isOpen ? search : value}
          onChange={handleInputChange}
          onFocus={() => {
            setIsOpen(true);
            setSearch('');
          }}
          onClick={() => {
            // Already-focused inputs don't fire focus again, e.g. after Esc
            if (!isOpen) {
              setIsOpen(true);
              setSearch('');
            }
          }}
          onKeyDown={handleKeyDown}
          placeholder={value || 'Choose an app'}
          aria-label="App package"
          spellCheck={false}
          autoCorrect="off"
          autoCapitalize="off"
          className="w-56 bg-transparent text-sm text-text-primary placeholder:text-text-muted outline-none focus-visible:outline-none"
        />
        <button
          onClick={() => {
            setIsOpen(!isOpen);
            setSearch('');
          }}
          className="text-text-muted hover:text-text-primary transition-colors"
          tabIndex={-1}
        >
          <ChevronIcon />
        </button>
      </div>

      {isOpen && (
        <div className="absolute top-full left-0 mt-1.5 w-full min-w-[340px] bg-surface-elevated border border-border rounded-lg shadow-xl shadow-black/40 z-50 max-h-72 overflow-hidden animate-pop-in">
          <div className="px-3 h-8 border-b border-border-muted flex items-center justify-between text-[11px] text-text-muted">
            <span>Debuggable apps</span>
            <span className="flex items-center gap-1"><span className="kbd">↑↓</span><span className="kbd">↵</span></span>
          </div>

          {loading ? (
            <div className="px-3 py-3 text-sm text-text-muted flex items-center gap-2">
              <div className="w-3 h-3 border-2 border-accent/30 border-t-accent rounded-full animate-spin" />
              Loading apps…
            </div>
          ) : loadError ? (
            <div className="px-3 py-3 text-sm text-red-400">
              Failed to load packages: {loadError}
            </div>
          ) : filteredPackages.length === 0 ? (
            <div className="px-3 py-3 text-sm text-text-muted">
              {search ? (
                'No app matches that name'
              ) : (
                <>
                  <p className="text-text-secondary">No debuggable apps on this device</p>
                  <p className="text-xs mt-1">Install a debug build of your app, then reopen this list.</p>
                </>
              )}
            </div>
          ) : (
            <ul ref={listRef} className="overflow-y-auto max-h-60 p-1">
              {filteredPackages.slice(0, 50).map(({ pkg, indices }, index) => (
                <li key={pkg}>
                  <button
                    onClick={() => handleSelect(pkg)}
                    onMouseEnter={() => setHighlightedIndex(index)}
                    className={`w-full px-2.5 py-1.5 rounded-md text-[13px] text-left transition-colors ${
                      index === highlightedIndex
                        ? 'bg-accent-muted text-text-primary'
                        : pkg === value
                        ? 'text-accent'
                        : 'text-text-secondary'
                    }`}
                  >
                    {renderHighlightedText(pkg, indices)}
                  </button>
                </li>
              ))}
              {filteredPackages.length > 50 && (
                <li className="px-3 py-2 text-xs text-text-muted border-t border-border-muted">
                  {filteredPackages.length - 50} more. Keep typing to narrow the list.
                </li>
              )}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
