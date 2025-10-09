'use client';

import { WifiOff, Wifi } from 'lucide-react';
import { useOnlineStatus } from '@/hooks/use-online-status';

export function OfflineBanner() {
  const isOnline = useOnlineStatus();

  if (isOnline) {
    return null;
  }

  return (
    <div className="bg-orange-500 text-white px-4 py-2 flex items-center justify-center gap-2 text-sm">
      <WifiOff className="w-4 h-4" />
      <span>オフラインモード - キャッシュデータを表示中</span>
    </div>
  );
}

interface OnlineStatusIndicatorProps {
  className?: string;
}

export function OnlineStatusIndicator({ className = '' }: OnlineStatusIndicatorProps) {
  const isOnline = useOnlineStatus();

  return (
    <div className={`flex items-center gap-2 ${className}`}>
      {isOnline ? (
        <>
          <Wifi className="w-4 h-4 text-green-500" />
          <span className="text-xs text-green-600">オンライン</span>
        </>
      ) : (
        <>
          <WifiOff className="w-4 h-4 text-orange-500" />
          <span className="text-xs text-orange-600">オフライン</span>
        </>
      )}
    </div>
  );
}
