import { createServiceRoleClient } from '@/lib/supabase/server';
import {
  jsonSuccess,
  conflict,
  handleApiError,
} from '@/lib/api/http-error';
import { reorderSchema } from '@/lib/domain/validations';
import { MESSAGES } from '@/lib/i18n/messages';

export const dynamic = 'force-dynamic';

export async function PUT(request: Request) {
  try {
    const rawBody = await request.json().catch(() => null);
    const parsed = reorderSchema.safeParse(rawBody);

    if (!parsed.success) {
      return conflict(MESSAGES.ORDER_SAVE_ERROR);
    }

    const { orderedIds } = parsed.data;
    const supabase = createServiceRoleClient();

    // Invocar función RPC transaccional que valida total, unicidad y pertenencia
    const { error: rpcError } = await supabase.rpc('reorder_store_products', {
      p_ordered_ids: orderedIds,
    });

    if (rpcError) {
      return conflict(MESSAGES.ORDER_SAVE_ERROR);
    }

    return jsonSuccess({ message: MESSAGES.ORDER_UPDATED });
  } catch (error) {
    return handleApiError(error);
  }
}
