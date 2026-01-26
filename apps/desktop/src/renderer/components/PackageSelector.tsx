import React, { useState, useEffect, useRef } from 'react';
import type { Device } from '@android-debugger/shared';

interface PackageSelectorProps {
  device: Device;
  value: string;
  onChange: (value: string) => void;
}

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
      <div className="flex items-center gap-2">
        <label className="text-sm text-text-secondary">Package:</label>
        <input
          ref={inputRef}
          type="text"
          value={value}
          onChange={handleInputChange}
          onFocus={() => setIsOpen(true)}
          placeholder="com.example.app"
          className="w-64 px-3 py-1.5 bg-surface-hover rounded-lg border border-border text-sm text-text-primary placeholder-text-muted outline-none focus:border-violet-500"
        />
      </div>

      {isOpen && (
        <div className="absolute top-full left-0 mt-1 w-full bg-surface border border-border rounded-lg shadow-lg z-50 max-h-64 overflow-y-auto">
          {loading ? (
            <div className="px-3 py-2 text-sm text-text-muted">Loading packages...</div>
          ) : filteredPackages.length === 0 ? (
            <div className="px-3 py-2 text-sm text-text-muted">
              {search ? 'No matching packages' : 'No packages found'}
            </div>
          ) : (
            <ul>
              {filteredPackages.slice(0, 50).map((pkg) => (
                <li key={pkg}>
                  <button
                    onClick={() => handleSelect(pkg)}
                    className="w-full px-3 py-2 text-sm text-left text-text-primary hover:bg-surface-hover transition-colors"
                  >
                    {pkg}
                  </button>
                </li>
              ))}
              {filteredPackages.length > 50 && (
                <li className="px-3 py-2 text-xs text-text-muted">
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
