import 'server-only';
import { z } from 'zod';

const serverEnvSchema = z.object({
  SUPABASE_URL: z.string().url('SUPABASE_URL debe ser una URL válida'),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1, 'SUPABASE_SERVICE_ROLE_KEY es obligatoria'),
});

export type ServerEnv = z.infer<typeof serverEnvSchema>;

export function getServerEnv(): ServerEnv {
  const result = serverEnvSchema.safeParse({
    SUPABASE_URL: process.env.SUPABASE_URL,
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
  });

  if (!result.success) {
    const errorMessages = result.error.issues
      .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
      .join(', ');
    throw new Error(`Configuración de servidor inválida: ${errorMessages}`);
  }

  return result.data;
}
