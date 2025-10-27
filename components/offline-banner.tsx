'use client';

import { WifiOff } from 'lucide-react';
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
