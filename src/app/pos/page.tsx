'use client';

import React, { useState, useEffect } from 'react';
import { isTauriEnvironment } from '@/lib/tauriPOS';
import DesktopPosView from './DesktopPosView';
import MobilePosView from './MobilePosView';
import { Loader2 } from 'lucide-react';

export default function PosPage() {
  const [mode, setMode] = useState<'desktop' | 'mobile' | null>(null);

  useEffect(() => {
    // 1. Nếu đang chạy trong Desktop Tauri App (.exe máy POS tại quầy):
    // Luôn luôn chạy giao diện Máy POS cảm ứng chuyên dụng
    if (isTauriEnvironment()) {
      setMode('desktop');
      return;
    }

    // 2. Nếu đang chạy trên Web App (Điện thoại hoặc trình duyệt web):
    // Mặc định luôn là 'mobile' siêu tối ưu cho điện thoại di động
    const saved = localStorage.getItem('ava_pos_mode');
    if (saved === 'desktop' && window.innerWidth >= 1024) {
      setMode('desktop');
    } else {
      setMode('mobile');
    }
  }, []);

  if (mode === null) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] space-y-3">
        <Loader2 className="w-8 h-8 text-coffee-primary animate-spin" />
        <p className="text-coffee-medium text-xs font-semibold">Đang chuẩn bị giao diện POS...</p>
      </div>
    );
  }

  if (mode === 'desktop') {
    return (
      <DesktopPosView 
        onSwitchToMobile={() => {
          localStorage.setItem('ava_pos_mode', 'mobile');
          setMode('mobile');
        }} 
      />
    );
  }

  return (
    <MobilePosView 
      onSwitchToDesktop={() => {
        localStorage.setItem('ava_pos_mode', 'desktop');
        setMode('desktop');
      }} 
    />
  );
}
