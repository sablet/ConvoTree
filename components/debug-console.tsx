'use client';

import { useState, useEffect, useRef } from 'react';
import { X, ChevronDown, ChevronUp, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { debugConsoleState } from '@/lib/debug-console-state';

interface LogEntry {
  id: number;
  timestamp: Date;
  level: 'log' | 'warn' | 'error' | 'info';
  message: string;
  args: unknown[];
}

export function DebugConsole() {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [isExpanded, setIsExpanded] = useState(false);
  const [isVisible, setIsVisible] = useState(false);
  const logIdRef = useRef(0);
  const logsEndRef = useRef<HTMLDivElement>(null);

  // 初期表示状態を読み込み
  useEffect(() => {
    setIsVisible(debugConsoleState.isVisible());
  }, []);

  // visibility変更イベントをリッスン
  useEffect(() => {
    const handleVisibilityChange = (e: Event) => {
      const customEvent = e as CustomEvent<{ visible: boolean }>;
      setIsVisible(customEvent.detail.visible);
    };

    window.addEventListener('debug-console-visibility-change', handleVisibilityChange);
    return () => {
      window.removeEventListener('debug-console-visibility-change', handleVisibilityChange);
    };
  }, []);

  useEffect(() => {
    const originalConsole = {
      log: console.log,
      warn: console.warn,
      error: console.error,
      info: console.info
    };

    const createLogEntry = (level: LogEntry['level'], args: unknown[]): LogEntry => {
      const message = args
        .map(arg => {
          if (typeof arg === 'string') return arg;
          if (arg instanceof Error) return `${arg.name}: ${arg.message}\n${arg.stack}`;
          try {
            return JSON.stringify(arg, null, 2);
          } catch {
            return String(arg);
          }
        })
        .join(' ');

      return {
        id: logIdRef.current++,
        timestamp: new Date(),
        level,
        message,
        args
      };
    };

    console.log = (...args: unknown[]) => {
      originalConsole.log(...args);
      setLogs(prev => [...prev.slice(-99), createLogEntry('log', args)]);
    };

    console.warn = (...args: unknown[]) => {
      originalConsole.warn(...args);
      setLogs(prev => [...prev.slice(-99), createLogEntry('warn', args)]);
    };

    console.error = (...args: unknown[]) => {
      originalConsole.error(...args);
      setLogs(prev => [...prev.slice(-99), createLogEntry('error', args)]);
    };

    console.info = (...args: unknown[]) => {
      originalConsole.info(...args);
      setLogs(prev => [...prev.slice(-99), createLogEntry('info', args)]);
    };

    return () => {
      console.log = originalConsole.log;
      console.warn = originalConsole.warn;
      console.error = originalConsole.error;
      console.info = originalConsole.info;
    };
  }, []);

  useEffect(() => {
    if (isExpanded && logsEndRef.current) {
      logsEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [logs, isExpanded]);

  const getLogColor = (level: LogEntry['level']) => {
    switch (level) {
      case 'error':
        return 'text-red-600 bg-red-50';
      case 'warn':
        return 'text-orange-600 bg-orange-50';
      case 'info':
        return 'text-blue-600 bg-blue-50';
      default:
        return 'text-gray-700 bg-gray-50';
    }
  };

  const getLevelBadge = (level: LogEntry['level']) => {
    const colors = {
      error: 'bg-red-500',
      warn: 'bg-orange-500',
      info: 'bg-blue-500',
      log: 'bg-gray-500'
    };
    return colors[level];
  };

  const clearLogs = () => {
    setLogs([]);
  };

  if (!isVisible) return null;

  const errorCount = logs.filter(log => log.level === 'error').length;
  const warnCount = logs.filter(log => log.level === 'warn').length;

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 bg-white border-t-2 border-gray-300 shadow-lg">
      {/* Header */}
      <div className="flex items-center justify-between bg-gray-800 text-white px-4 py-2">
        <div className="flex items-center gap-3">
          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className="flex items-center gap-2 hover:bg-gray-700 px-2 py-1 rounded"
          >
            {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronUp className="w-4 h-4" />}
            <span className="font-semibold">Debug Console</span>
          </button>
          <div className="flex items-center gap-2 text-xs">
            {errorCount > 0 && (
              <span className="bg-red-500 px-2 py-0.5 rounded-full">
                {errorCount} エラー
              </span>
            )}
            {warnCount > 0 && (
              <span className="bg-orange-500 px-2 py-0.5 rounded-full">
                {warnCount} 警告
              </span>
            )}
            <span className="text-gray-400">
              {logs.length} ログ
            </span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={clearLogs}
            className="text-white hover:bg-gray-700 h-7 px-2"
          >
            <Trash2 className="w-4 h-4" />
          </Button>
          <button
            onClick={() => debugConsoleState.setVisible(false)}
            className="hover:bg-gray-700 p-1 rounded"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Logs */}
      {isExpanded && (
        <div className="max-h-80 overflow-y-auto bg-gray-900 text-gray-100">
          {logs.length === 0 ? (
            <div className="p-4 text-center text-gray-500">
              ログがありません
            </div>
          ) : (
            <div className="p-2 space-y-1">
              {logs.map(log => (
                <div
                  key={log.id}
                  className={`p-2 rounded text-xs font-mono border-l-4 ${getLogColor(log.level)}`}
                  style={{ borderLeftColor: getLevelBadge(log.level).replace('bg-', '') }}
                >
                  <div className="flex items-start gap-2">
                    <span className={`px-1.5 py-0.5 rounded text-white text-[10px] font-bold ${getLevelBadge(log.level)}`}>
                      {log.level.toUpperCase()}
                    </span>
                    <span className="text-gray-500 text-[10px]">
                      {log.timestamp.toLocaleTimeString('ja-JP', {
                        hour: '2-digit',
                        minute: '2-digit',
                        second: '2-digit',
                        fractionalSecondDigits: 3
                      })}
                    </span>
                  </div>
                  <pre className="mt-1 whitespace-pre-wrap break-words text-gray-900">
                    {log.message}
                  </pre>
                </div>
              ))}
              <div ref={logsEndRef} />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
