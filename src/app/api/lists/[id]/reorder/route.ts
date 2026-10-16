import { createServiceRoleClient } from '@/lib/supabase/server';
import {
  jsonSuccess,
  notFound,
  conflict,
  handleApiError,
} from '@/lib/api/http-error';
import { reorderSchema } from '@/lib/domain/validations';
import { MESSAGES } from '@/lib/i18n/messages';

export const dynamic = 'force-dynamic';

export async function PUT(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    const rawBody = await request.json().catch(() => null);
    const parsed = reorderSchema.safeParse(rawBody);

    if (!parsed.success) {
      return conflict(MESSAGES.ORDER_SAVE_ERROR);
    }

    const { orderedIds } = parsed.data;
    const supabase = createServiceRoleClient();

    const { error: rpcError } = await supabase.rpc('reorder_shopping_list_items', {
      p_list_id: id,
      p_ordered_ids: orderedIds,
    });

    if (rpcError) {
      const msg = rpcError.message || '';
      if (msg.includes('Esta lista ya no existe')) {
        return notFound(MESSAGES.LIST_NOT_FOUND);
      }
      if (msg.includes('Esta lista ya fue finalizada')) {
        return conflict(MESSAGES.LIST_ALREADY_FINALIZED);
      }
      return conflict(MESSAGES.ORDER_SAVE_ERROR);
    }

    return jsonSuccess({ message: MESSAGES.ORDER_UPDATED });
  } catch (error) {
    return handleApiError(error);
  }
}
