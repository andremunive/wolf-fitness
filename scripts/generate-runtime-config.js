/**
 * Reads `.env` from the project root and writes `src/assets/runtime-config.json`
 * with only the safe-to-ship values (Supabase URL + anon key).
 *
 * Runs on `prestart` and `prebuild`. The generated JSON is gitignored and
 * fetched at runtime by the Angular ConfigService.
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const ENV_PATH = path.join(ROOT, '.env');
const OUTPUT_PATH = path.join(ROOT, 'src', 'assets', 'runtime-config.json');

function parseDotEnv(content) {
  const result = {};
  const lines = content.split(/\r?\n/);
  for (const raw of lines) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    result[key] = value;
  }
  return result;
}

function main() {
  if (!fs.existsSync(ENV_PATH)) {
    console.warn(
      '[runtime-config] .env no encontrado en la raíz del proyecto. ' +
        'Creando runtime-config.json vacío. ' +
        'Copia .env.example a .env y completa los valores antes de autenticar.'
    );
  }

  const env = fs.existsSync(ENV_PATH)
    ? parseDotEnv(fs.readFileSync(ENV_PATH, 'utf8'))
    : {};

  const config = {
    supabase: {
      url: env.SUPABASE_URL || process.env.SUPABASE_URL || '',
      anonKey: env.SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY || ''
    }
  };

  const outDir = path.dirname(OUTPUT_PATH);
  if (!fs.existsSync(outDir)) {
    fs.mkdirSync(outDir, { recursive: true });
  }

  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(config, null, 2) + '\n', 'utf8');

  const hasUrl = Boolean(config.supabase.url);
  const hasKey = Boolean(config.supabase.anonKey);
  console.log(
    `[runtime-config] Generado ${path.relative(ROOT, OUTPUT_PATH)} ` +
      `(supabase.url: ${hasUrl ? 'OK' : 'VACÍO'}, supabase.anonKey: ${hasKey ? 'OK' : 'VACÍO'}).`
  );
}

main();
