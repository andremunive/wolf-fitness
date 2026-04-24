import { Injectable } from '@angular/core';
import { SupabaseClient, createClient } from '@supabase/supabase-js';

import { ConfigService } from '../config/config.service';
import { Database } from '../types/supabase';

/**
 * Lock no-op para auth.
 *
 * El `lock` por defecto de `@supabase/auth-js` usa `navigator.locks` para
 * coordinar el auto-refresh de tokens entre múltiples tabs. En Firefox
 * produce un `TypeError: can't access property "stack"` dentro de
 * `_startAutoRefresh` cuando envuelve un rejection null/undefined.
 *
 * Trade-off asumido: si el usuario abre varias tabs de Wolf Fitness al
 * mismo tiempo podrían refrescar el token en paralelo. Aceptable para el
 * uso esperado (la app móvil-first se usa desde un dispositivo/tab).
 */
const noopAuthLock = async <R>(
  _name: string,
  _acquireTimeout: number,
  fn: () => Promise<R>
): Promise<R> => fn();

@Injectable({ providedIn: 'root' })
export class SupabaseService {
  private readonly _client: SupabaseClient<Database>;

  constructor(config: ConfigService) {
    const { url, anonKey } = config.config.supabase;

    if (!url || !anonKey) {
      console.warn(
        '[SupabaseService] URL o anonKey vacíos. ' +
          'Configura `.env` en la raíz y corre `npm start` (prestart genera runtime-config.json).'
      );
    }

    this._client = createClient<Database>(url, anonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
        lock: noopAuthLock
      }
    });
  }

  get client(): SupabaseClient<Database> {
    return this._client;
  }

  get auth() {
    return this._client.auth;
  }
}
