import { createServiceRoleClient } from '@/lib/supabase/server';
import {
  jsonSuccess,
  jsonCreated,
  handleApiError,
} from '@/lib/api/http-error';
import {
  resolveOpenListItemPricing,
  calculateListSummary,
  ListItemForSummary,
} from '@/lib/domain/pricing';
import { getDefaultShoppingListName } from '@/lib/domain/format';
import { shoppingListInputSchema } from '@/lib/domain/validations';
import { fetchUploadPricesMap } from '@/lib/supabase/catalog-queries';
import type {
  ShoppingListSummaryDto,
  ShoppingListStatus,
  CurrencyTag,
} from '@/types/contracts';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const supabase = createServiceRoleClient();

    // 1. Consultar configuración activa
    const { data: settings } = await supabase
      .from('workspace_settings')
      .select('active_upload_id')
      .eq('singleton_key', true)
      .maybeSingle();

    const activeUploadId = settings?.active_upload_id;

    // 2. Consultar listas de compras abiertas y finalizadas
    const { data: lists, error: listsError } = await supabase
      .from('shopping_lists')
      .select('id, name, status, finalized_at, created_at')
      .order('created_at', { ascending: false });

    if (listsError) {
      throw listsError;
    }

    if (!lists || lists.length === 0) {
      return jsonSuccess<ShoppingListSummaryDto[]>([]);
    }

    const openLists = lists.filter((l) => l.status === 'open');
    const finalizedLists = lists.filter((l) => l.status === 'finalized');

    // Ordenar finalizadas por finalized_at DESC
    finalizedLists.sort((a, b) => {
      const dateA = a.finalized_at ? new Date(a.finalized_at).getTime() : 0;
      const dateB = b.finalized_at ? new Date(b.finalized_at).getTime() : 0;
      return dateB - dateA;
    });

    // 3. Consultar todos los ítems de las listas
    const { data: allItems, error: itemsError } = await supabase
      .from('shopping_list_items')
      .select(`
        id,
        list_id,
        product_id,
        quantity,
        currency_tag,
        captured_box_price_bs,
        products!inner (
          id,
          display_name
        )
      `);

    if (itemsError) {
      throw itemsError;
    }

    const itemsByListId = new Map<string, typeof allItems>();
    for (const item of allItems ?? []) {
      const list = itemsByListId.get(item.list_id) ?? [];
      list.push(item);
      itemsByListId.set(item.list_id, list);
    }

    // 4. Si hay listas abiertas, consultar datos de la tienda y precios activos para resolver en vivo
    const storeMap = new Map<string, { customName: string; manualPriceBs: number | null }>();
    let catalogPriceMap = new Map<string, number>();

    if (openLists.length > 0) {
      const { data: storeProducts } = await supabase
        .from('store_products')
        .select('product_id, custom_name, manual_price_bs');

      for (const sp of storeProducts ?? []) {
        storeMap.set(sp.product_id, {
          customName: sp.custom_name,
          manualPriceBs: sp.manual_price_bs != null ? Number(sp.manual_price_bs) : null,
        });
      }

      if (activeUploadId) {
        const openProductIds = Array.from(
          new Set(
            openLists
              .flatMap((l) => itemsByListId.get(l.id) ?? [])
              .map((it) => it.product_id)
          )
        );

        catalogPriceMap = await fetchUploadPricesMap(
          supabase,
          activeUploadId,
          openProductIds
        );
      }
    }

    // 5. Consultar facturas para las listas finalizadas
    const invoiceTotalMap = new Map<string, number>();
    if (finalizedLists.length > 0) {
      const { data: invoices } = await supabase
        .from('invoices')
        .select('list_id, total_bs');

      for (const inv of invoices ?? []) {
        invoiceTotalMap.set(inv.list_id, Number(inv.total_bs));
      }
    }

    // 6. Construir resúmenes de listas abiertas
    const openSummaries: ShoppingListSummaryDto[] = openLists.map((l) => {
      const items = itemsByListId.get(l.id) ?? [];

      const itemsForSummary: ListItemForSummary[] = items.map((it) => {
        const prod = Array.isArray(it.products) ? it.products[0] : it.products;
        const storeInfo = storeMap.get(it.product_id);
        const catalogPriceBs = catalogPriceMap.get(it.product_id) ?? null;

        const resolved = resolveOpenListItemPricing({
          isInStore: storeInfo !== undefined,
          customName: storeInfo?.customName,
          manualPriceBs: storeInfo?.manualPriceBs,
          catalogDisplayName: prod.display_name,
          catalogPriceBs,
          quantity: it.quantity,
          currencyTag: it.currency_tag as CurrencyTag,
        });

        return {
          currencyTag: it.currency_tag as CurrencyTag,
          boxPriceBs: resolved.boxPriceBs,
          quantity: it.quantity,
        };
      });

      const summary = calculateListSummary(itemsForSummary);

      return {
        id: l.id,
        name: l.name,
        status: 'open',
        createdAt: l.created_at,
        finalizedAt: null,
        itemCount: summary.itemCount,
        totalBs: summary.totalBs,
        usdItemCount: summary.usdItemCount,
        pricelessItemCount: summary.pricelessItemCount,
      };
    });

    // 7. Construir resúmenes de listas finalizadas
    const finalizedSummaries: ShoppingListSummaryDto[] = finalizedLists.map((l) => {
      const items = itemsByListId.get(l.id) ?? [];
      const usdCount = items.filter((it) => it.currency_tag === 'USD').length;
      const totalBs = invoiceTotalMap.get(l.id) ?? 0;

      return {
        id: l.id,
        name: l.name,
        status: 'finalized',
        createdAt: l.created_at,
        finalizedAt: l.finalized_at,
        itemCount: items.length,
        totalBs,
        usdItemCount: usdCount,
        pricelessItemCount: 0,
      };
    });

    // 8. Secciones ordenadas: primero abiertas (created_at DESC), luego finalizadas (finalized_at DESC)
    const allSummaries = [...openSummaries, ...finalizedSummaries];

    return jsonSuccess<ShoppingListSummaryDto[]>(allSummaries);
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(request: Request) {
  try {
    const rawBody = await request.json().catch(() => ({}));
    let listName = '';

    if (rawBody && typeof rawBody === 'object' && 'name' in rawBody && typeof rawBody.name === 'string') {
      const trimmed = rawBody.name.trim();
      if (trimmed.length > 0) {
        const parsed = shoppingListInputSchema.safeParse({ name: trimmed });
        if (!parsed.success) {
          return handleApiError(parsed.error);
        }
        listName = parsed.data.name;
      }
    }

    if (!listName) {
      listName = getDefaultShoppingListName();
    }

    const supabase = createServiceRoleClient();

    const { data: inserted, error: insertError } = await supabase
      .from('shopping_lists')
      .insert({
        name: listName,
        status: 'open',
      })
      .select()
      .single();

    if (insertError || !inserted) {
      throw insertError;
    }

    const responseDto: ShoppingListSummaryDto = {
      id: inserted.id,
      name: inserted.name,
      status: 'open',
      createdAt: inserted.created_at,
      finalizedAt: null,
      itemCount: 0,
      totalBs: 0,
      usdItemCount: 0,
      pricelessItemCount: 0,
    };

    return jsonCreated<ShoppingListSummaryDto>(responseDto);
  } catch (error) {
    return handleApiError(error);
  }
}
