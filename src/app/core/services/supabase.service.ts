import { Injectable } from '@angular/core';
import { SupabaseClient, createClient } from '@supabase/supabase-js';
import { environment } from 'src/environments/environment';

@Injectable({ providedIn: 'root' })
export class SupabaseService {
  private readonly _client: SupabaseClient;

  constructor() {
    const { url, anonKey } = environment.supabase;

    if (!url || !anonKey) {
      console.warn(
        '[SupabaseService] URL o anonKey vacíos en environment. ' +
        'Configúralos antes de intentar autenticar o consultar la base.'
      );
    }

    this._client = createClient(url, anonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true
      }
    });
  }

  get client(): SupabaseClient {
    return this._client;
  }

  get auth() {
    return this._client.auth;
  }
}
