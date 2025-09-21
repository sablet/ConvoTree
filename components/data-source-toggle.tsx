'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Database, FileText, Settings, RefreshCw } from 'lucide-react';
import { dataSourceManager, DataSource } from '@/lib/data-source';

interface DataSourceToggleProps {
  onDataSourceChange?: (source: DataSource) => void;
  onDataReload?: () => void;
}

export function DataSourceToggle({ onDataSourceChange, onDataReload }: DataSourceToggleProps) {
  const [currentSource, setCurrentSource] = useState<DataSource>('firestore');
  const [isLoading, setIsLoading] = useState(false);
  const [lastError, setLastError] = useState<string | null>(null);

  useEffect(() => {
    setCurrentSource(dataSourceManager.getCurrentSource());
  }, []);

  const handleSourceChange = async (newSource: DataSource) => {
    if (newSource === currentSource) return;

    setIsLoading(true);
    setLastError(null);
    try {
      dataSourceManager.setDataSource(newSource);
      setCurrentSource(newSource);

      if (onDataSourceChange) {
        onDataSourceChange(newSource);
      }

      if (onDataReload) {
        onDataReload();
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error('Failed to change data source:', error);
      setLastError(errorMessage);
    } finally {
      setIsLoading(false);
    }
  };

  const handleReload = () => {
    if (onDataReload) {
      setIsLoading(true);
      setLastError(null);
      onDataReload();
      // Loading state will be cleared by the parent component
      setTimeout(() => setIsLoading(false), 1000);
    }
  };

  return (
    <div className="bg-white border-b border-gray-200 p-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Settings className="w-4 h-4 text-gray-500" />
          <span className="text-sm font-medium text-gray-700">データソース</span>
          <Badge
            variant={currentSource === 'firestore' ? 'default' : 'secondary'}
            className={`text-xs ${
              currentSource === 'firestore'
                ? 'bg-blue-500 text-white'
                : 'bg-gray-100 text-gray-600'
            }`}
          >
            {currentSource === 'firestore' ? 'Firestore' : 'サンプル'}
          </Badge>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={handleReload}
            disabled={isLoading}
            className="h-8 px-2"
          >
            <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
          </Button>
        </div>
      </div>

      <div className="flex gap-2 mt-3">
        <Button
          variant={currentSource === 'sample' ? 'default' : 'outline'}
          size="sm"
          onClick={() => handleSourceChange('sample')}
          disabled={isLoading}
          className={`flex items-center gap-2 ${
            currentSource === 'sample'
              ? 'bg-gray-600 hover:bg-gray-700 text-white'
              : 'border-gray-300 text-gray-700 hover:bg-gray-50'
          }`}
        >
          <FileText className="w-4 h-4" />
          サンプルデータ
        </Button>

        <Button
          variant={currentSource === 'firestore' ? 'default' : 'outline'}
          size="sm"
          onClick={() => handleSourceChange('firestore')}
          disabled={isLoading}
          className={`flex items-center gap-2 ${
            currentSource === 'firestore'
              ? 'bg-blue-500 hover:bg-blue-600 text-white'
              : 'border-blue-300 text-blue-700 hover:bg-blue-50'
          }`}
        >
          <Database className="w-4 h-4" />
          Firestore
        </Button>
      </div>

      <div className="mt-3 text-xs text-gray-500">
        {currentSource === 'firestore' ? (
          <span>🔥 リアルタイムデータベースから読み込み中</span>
        ) : (
          <span>📄 デバッグ用サンプルデータを使用中</span>
        )}
      </div>

      {lastError && (
        <div className="mt-3 p-2 bg-red-50 border border-red-200 rounded text-xs text-red-700">
          <span className="font-medium">エラー:</span> {lastError}
          <br />
          <span className="text-red-500">手動でサンプルデータに切り替えるか、Firestoreの設定を確認してください。</span>
        </div>
      )}
    </div>
  );
}