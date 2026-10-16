'use client';

import React from 'react';

export interface CardSkeletonProps {
  count?: number;
  heightClass?: string;
}

export function CardSkeleton({ count = 3, heightClass = 'h-20' }: CardSkeletonProps) {
  const items = Array.from({ length: count }, (_, i) => i);

  return (
    <div className="flex flex-col gap-3 w-full select-none" aria-busy="true" aria-label="Cargando contenido">
      {items.map((key) => (
        <div
          key={key}
          className={`w-full ${heightClass} bg-[#F2EDE4] rounded-2xl animate-pulse border border-[#E7E0D5]/50 flex items-center p-4 gap-3`}
        >
          <div className="w-10 h-10 rounded-xl bg-[#E7E0D5]/60" />
          <div className="flex-1 flex flex-col gap-2">
            <div className="w-3/4 h-3.5 bg-[#E7E0D5]/70 rounded-md" />
            <div className="w-1/2 h-3 bg-[#E7E0D5]/50 rounded-md" />
          </div>
        </div>
      ))}
    </div>
  );
}
