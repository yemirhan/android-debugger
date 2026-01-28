import { useState, useEffect, useCallback } from 'react';
import type { Device, DatabaseInfo, DatabaseQueryResult } from '@android-debugger/shared';

export function useDatabaseInspector(device: Device | null, packageName: string) {
  const [databases, setDatabases] = useState<DatabaseInfo[]>([]);
  const [selectedDatabase, setSelectedDatabase] = useState<string | null>(null);
  const [selectedTable, setSelectedTable] = useState<string | null>(null);
  const [queryResult, setQueryResult] = useState<DatabaseQueryResult | null>(null);
  const [customQuery, setCustomQuery] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [queryLoading, setQueryLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchDatabases = useCallback(async () => {
    if (!device || !packageName) {
      setDatabases([]);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const result = await window.electronAPI.listDatabases(device.id, packageName);
      setDatabases(result);
      if (result.length > 0 && !selectedDatabase) {
        setSelectedDatabase(result[0].name);
        if (result[0].tables.length > 0) {
          setSelectedTable(result[0].tables[0]);
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to list databases');
      setDatabases([]);
    } finally {
      setLoading(false);
    }
  }, [device, packageName, selectedDatabase]);

  const refresh = useCallback(() => {
    fetchDatabases();
  }, [fetchDatabases]);

  // Fetch databases when device or package changes
  useEffect(() => {
    fetchDatabases();
  }, [device?.id, packageName]);

  const executeQuery = useCallback(
    async (query: string) => {
      if (!device || !packageName || !selectedDatabase) {
        setError('No database selected');
        return null;
      }

      setQueryLoading(true);
      setError(null);

      try {
        const result = await window.electronAPI.queryDatabase(
          device.id,
          packageName,
          selectedDatabase,
          query
        );
        setQueryResult(result);
        return result;
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Query failed');
        setQueryResult(null);
        return null;
      } finally {
        setQueryLoading(false);
      }
    },
    [device, packageName, selectedDatabase]
  );

  const loadTableData = useCallback(
    async (tableName: string) => {
      setSelectedTable(tableName);
      return executeQuery(`SELECT * FROM ${tableName} LIMIT 100`);
    },
    [executeQuery]
  );

  const getSelectedDatabaseInfo = useCallback(() => {
    return databases.find((db) => db.name === selectedDatabase) || null;
  }, [databases, selectedDatabase]);

  return {
    databases,
    selectedDatabase,
    setSelectedDatabase,
    selectedTable,
    setSelectedTable,
    selectedDatabaseInfo: getSelectedDatabaseInfo(),
    queryResult,
    customQuery,
    setCustomQuery,
    loading,
    queryLoading,
    error,
    refresh,
    executeQuery,
    loadTableData,
  };
}
