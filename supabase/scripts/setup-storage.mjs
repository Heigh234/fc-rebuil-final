/**
 * Script de provisión y verificación del almacenamiento y entorno Supabase
 *
 * Módulo: MOD-03 (Bodega FC)
 * Bucket: bodega-fc-pdfs (privado, max 10MB, solo application/pdf)
 * Verificación RPC: ensure_workspace_settings, expire_stale_pending_uploads
 */

import { createClient } from '@supabase/supabase-js';
import fs from 'node:fs';
import path from 'node:path';

const BUCKET_NAME = 'bodega-fc-pdfs';
const MAX_FILE_SIZE = 10485760; // 10 MB en bytes
const ALLOWED_MIME_TYPES = ['application/pdf'];

// Cargar variables de entorno desde .env.local o .env si no están en process.env
function loadEnvFile(filename) {
  const filePath = path.resolve(process.cwd(), filename);
  if (fs.existsSync(filePath)) {
    const content = fs.readFileSync(filePath, 'utf8');
    for (const line of content.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eqIndex = trimmed.indexOf('=');
      if (eqIndex !== -1) {
        const key = trimmed.slice(0, eqIndex).trim();
        let val = trimmed.slice(eqIndex + 1).trim();
        if (
          (val.startsWith('"') && val.endsWith('"')) ||
          (val.startsWith("'") && val.endsWith("'"))
        ) {
          val = val.slice(1, -1);
        }
        if (!process.env[key]) {
          process.env[key] = val;
        }
      }
    }
  }
}

loadEnvFile('.env.local');
loadEnvFile('.env');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (
  !supabaseUrl ||
  !supabaseKey ||
  supabaseUrl.includes('your-project') ||
  supabaseKey.includes('your-service-role-key')
) {
  console.error(
    '❌ [setup-storage] Credenciales de Supabase no configuradas o contienen valores de ejemplo.'
  );
  console.error(
    '   Por favor, define SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY válidas en .env.local'
  );
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
    detectSessionInUrl: false,
  },
});

async function main() {
  console.log(`[setup-storage] Conectando a Supabase en: ${supabaseUrl}`);

  // 1. Provisión idempotente del bucket de almacenamiento
  console.log(`[setup-storage] Verificando bucket '${BUCKET_NAME}'...`);
  const { data: existingBucket, error: getBucketError } =
    await supabase.storage.getBucket(BUCKET_NAME);

  if (getBucketError && !getBucketError.message?.toLowerCase().includes('not found')) {
    // Si el error no es de "no encontrado", podría ser un problema de permisos de storage
    console.warn(`[setup-storage] Nota al consultar bucket: ${getBucketError.message}`);
  }

  if (existingBucket) {
    console.log(`[setup-storage] El bucket '${BUCKET_NAME}' ya existe. Actualizando configuración...`);
    const { error: updateError } = await supabase.storage.updateBucket(BUCKET_NAME, {
      public: false,
      fileSizeLimit: MAX_FILE_SIZE,
      allowedMimeTypes: ALLOWED_MIME_TYPES,
    });

    if (updateError) {
      console.error(`❌ [setup-storage] Error actualizando bucket: ${updateError.message}`);
      process.exit(1);
    }
    console.log(`✓ [setup-storage] Bucket '${BUCKET_NAME}' actualizado (public: false, 10MB, application/pdf).`);
  } else {
    console.log(`[setup-storage] Creando bucket '${BUCKET_NAME}'...`);
    const { error: createError } = await supabase.storage.createBucket(BUCKET_NAME, {
      public: false,
      fileSizeLimit: MAX_FILE_SIZE,
      allowedMimeTypes: ALLOWED_MIME_TYPES,
    });

    if (createError) {
      console.error(`❌ [setup-storage] Error creando bucket: ${createError.message}`);
      process.exit(1);
    }
    console.log(`✓ [setup-storage] Bucket '${BUCKET_NAME}' creado exitosamente (public: false, 10MB, application/pdf).`);
  }

  // 2. Verificación de RPCs de base de datos
  console.log('[setup-storage] Verificando funciones RPC en la base de datos...');

  const { data: activeUploadId, error: rpc1Error } =
    await supabase.rpc('ensure_workspace_settings');

  if (rpc1Error) {
    console.error(`❌ [setup-storage] Error al ejecutar ensure_workspace_settings(): ${rpc1Error.message}`);
    console.error('   Verifica si la migración supabase/migrations/0001_bodega_fc_schema.sql fue aplicada en el proyecto Supabase.');
    process.exit(1);
  }
  console.log(`✓ [setup-storage] RPC ensure_workspace_settings() OK (active_upload_id: ${activeUploadId ?? 'null'}).`);

  const { data: expiredCount, error: rpc2Error } =
    await supabase.rpc('expire_stale_pending_uploads');

  if (rpc2Error) {
    console.error(`❌ [setup-storage] Error al ejecutar expire_stale_pending_uploads(): ${rpc2Error.message}`);
    process.exit(1);
  }
  console.log(`✓ [setup-storage] RPC expire_stale_pending_uploads() OK (filas expiradas: ${expiredCount}).`);

  console.log('\n🎉 [setup-storage] Verificación de entorno Supabase completada con éxito.');
}

main().catch((err) => {
  console.error('❌ [setup-storage] Error inesperado:', err);
  process.exit(1);
});
