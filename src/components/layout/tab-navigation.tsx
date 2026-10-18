'use client';

import React from 'react';
import { Store, BookOpen, ClipboardList } from 'lucide-react';

export type TabKey = 'store' | 'catalog' | 'lists';

export interface TabNavigationProps {
  activeTab: TabKey;
  onTabChange: (tab: TabKey) => void;
  badgeCounts?: {
    store?: number;
    catalog?: number;
    lists?: number;
  };
  isSticky?: boolean;
}

interface TabItem {
  key: TabKey;
  label: string;
  icon: React.ElementType;
}

const TABS: TabItem[] = [
  { key: 'store', label: 'Mi tienda', icon: Store },
  { key: 'catalog', label: 'Catálogo', icon: BookOpen },
  { key: 'lists', label: 'Compras', icon: ClipboardList },
];

export function TabNavigation({
  activeTab,
  onTabChange,
  badgeCounts,
  isSticky = false,
}: TabNavigationProps) {
  return (
    <nav
      aria-label="Navegación principal"
      className={`w-full bg-[#FFFFFF] border-b border-[#E7E0D5] select-none ${
        isSticky ? 'sticky top-14 z-20 shadow-xs' : ''
      }`}
    >
      <div className="max-w-[448px] mx-auto grid grid-cols-3 h-14">
        {TABS.map(({ key, label, icon: Icon }) => {
          const isActive = activeTab === key;
          const count = badgeCounts?.[key];

          return (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={isActive}
              onClick={() => onTabChange(key)}
              className={`h-full min-h-[48px] py-2 px-1 flex flex-col items-center justify-center gap-1 text-xs font-bold transition-colors relative cursor-pointer ${
                isActive
                  ? 'text-[#2D6A4F] border-b-2 border-[#2D6A4F] bg-[#FFFBF5]'
                  : 'text-[#78716C] hover:text-[#292524] hover:bg-[#F2EDE4]/40'
              }`}
            >
              <div className="relative">
                <Icon className={`w-5 h-5 ${isActive ? 'text-[#2D6A4F]' : 'text-[#78716C]'}`} />
                {typeof count === 'number' && count > 0 && (
                  <span className="absolute -top-1 -right-2 min-w-[16px] h-4 px-1 rounded-full bg-[#2D6A4F] text-white text-[10px] font-extrabold flex items-center justify-center">
                    {count}
                  </span>
                )}
              </div>
              <span>{label}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
