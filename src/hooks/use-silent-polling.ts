'use client';

import { useEffect, useRef } from 'react';

export interface UseSilentPollingOptions {
  intervalMs?: number;
  paused?: boolean;
}

/**
 * Hook de sincronización silenciosa multi-dispositivo (Sección 23: L1126-1142).
 * Vuelve a pedir datos periódicamente, al recuperar foco o volver a la pestaña,
 * y pausa automáticamente mientras el usuario interactúa (modal abierto, arrastre, formulario).
 * Cuando paused pasa de true a false, ejecuta un refresco inmediato.
 */
export function useSilentPolling(
  callback: () => void | Promise<void>,
  options: UseSilentPollingOptions = {}
) {
  const { intervalMs = 30_000, paused = false } = options;

  const callbackRef = useRef(callback);
  callbackRef.current = callback;

  const wasPausedRef = useRef(paused);

  useEffect(() => {
    // Si acaba de salir del estado pausado (ej. cerró un modal o terminó de editar),
    // ejecutar refresco inmediato para sincronizar los cambios de otros dispositivos.
    if (wasPausedRef.current && !paused) {
      if (typeof document !== 'undefined' && document.visibilityState === 'visible') {
        callbackRef.current();
      }
    }
    wasPausedRef.current = paused;
  }, [paused]);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    let timerId: NodeJS.Timeout | null = null;

    const executeRefresh = () => {
      if (paused) return;
      if (document.visibilityState !== 'visible') return;
      callbackRef.current();
    };

    // 1. Polling periódico cada intervalMs (30s)
    if (!paused) {
      timerId = setInterval(executeRefresh, intervalMs);
    }

    // 2. Al cambiar la visibilidad de la pestaña (de oculta a visible)
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        executeRefresh();
      }
    };

    // 3. Al ganar foco la ventana
    const handleFocus = () => {
      executeRefresh();
    };

    // 4. Al recuperar conexión a internet
    const handleOnline = () => {
      executeRefresh();
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('focus', handleFocus);
    window.addEventListener('online', handleOnline);

    return () => {
      if (timerId) clearInterval(timerId);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('focus', handleFocus);
      window.removeEventListener('online', handleOnline);
    };
  }, [intervalMs, paused]);
}
