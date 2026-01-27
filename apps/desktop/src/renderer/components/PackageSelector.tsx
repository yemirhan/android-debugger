import React, { useState, useEffect, useRef } from 'react';
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

export function PackageSelector({ device, value, onChange }: PackageSelectorProps) {
  const [packages, setPackages] = useState<string[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Fetch packages on mount
  useEffect(() => {
    const fetchPackages = async () => {
      setLoading(true);
      try {
        const result = await window.electronAPI.getPackages(device.id, true);
        setPackages(result);
      } catch (error) {
        console.error('Error fetching packages:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchPackages();
  }, [device.id]);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const filteredPackages = packages.filter((pkg) =>
    pkg.toLowerCase().includes(search.toLowerCase())
  );

  const handleSelect = (pkg: string) => {
    onChange(pkg);
    setSearch('');
    setIsOpen(false);
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSearch(e.target.value);
    onChange(e.target.value);
    if (!isOpen) setIsOpen(true);
  };

  return (
    <div className="relative" ref={dropdownRef}>
      <div className="flex items-center gap-2 px-2.5 py-1.5 bg-background rounded-md border border-border-muted hover:border-border transition-colors">
        <PackageIcon />
        <input
          ref={inputRef}
          type="text"
          value={value}
          onChange={handleInputChange}
          onFocus={() => setIsOpen(true)}
          placeholder="com.example.app"
          className="w-52 bg-transparent text-sm text-text-primary placeholder-text-muted outline-none"
        />
        <button
          onClick={() => setIsOpen(!isOpen)}
          className="text-text-muted hover:text-text-primary transition-colors"
        >
          <ChevronIcon />
        </button>
      </div>

      {isOpen && (
        <div className="absolute top-full left-0 mt-1 w-full bg-surface-elevated border border-border rounded-lg shadow-xl z-50 max-h-64 overflow-hidden animate-fade-in backdrop-blur-dropdown">
          {loading ? (
            <div className="px-3 py-3 text-sm text-text-muted flex items-center gap-2">
              <div className="w-3 h-3 border-2 border-accent/30 border-t-accent rounded-full animate-spin" />
              Loading packages...
            </div>
          ) : filteredPackages.length === 0 ? (
            <div className="px-3 py-3 text-sm text-text-muted">
              {search ? 'No matching packages' : 'No packages found'}
            </div>
          ) : (
            <ul className="overflow-y-auto max-h-60">
              {filteredPackages.slice(0, 50).map((pkg) => (
                <li key={pkg}>
                  <button
                    onClick={() => handleSelect(pkg)}
                    className={`w-full px-3 py-2 text-xs text-left font-mono transition-colors ${
                      pkg === value
                        ? 'bg-accent/10 text-accent'
                        : 'text-text-primary hover:bg-surface-hover'
                    }`}
                  >
                    {pkg}
                  </button>
                </li>
              ))}
              {filteredPackages.length > 50 && (
                <li className="px-3 py-2 text-xs text-text-muted border-t border-border-muted">
                  +{filteredPackages.length - 50} more packages
                </li>
              )}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
