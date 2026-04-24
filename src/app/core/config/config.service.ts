import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';

import { AppConfig } from './app-config.model';

@Injectable({ providedIn: 'root' })
export class ConfigService {
  private _config: AppConfig | null = null;

  constructor(private readonly http: HttpClient) {}

  async load(): Promise<void> {
    const url = 'assets/runtime-config.json';
    try {
      this._config = await firstValueFrom(this.http.get<AppConfig>(url));
    } catch (err) {
      console.error(
        `[ConfigService] No se pudo cargar ${url}. ` +
          `Verifica que el script scripts/generate-runtime-config.js haya corrido.`,
        err
      );
      this._config = { supabase: { url: '', anonKey: '' } };
    }
  }

  get config(): AppConfig {
    if (!this._config) {
      throw new Error(
        '[ConfigService] Config solicitada antes de ser cargada por APP_INITIALIZER.'
      );
    }
    return this._config;
  }
}

export function configInitializerFactory(configService: ConfigService) {
  return () => configService.load();
}
