/**
 * Catálogo de Textos y Mensajes de la Interfaz - Bodega FC
 *
 * Basado estrictamente en la Sección 18 de BODEGA_FC_ESPECIFICACION_RECONSTRUCCION.md (L825-L977).
 * Todos los textos en español venezolano exacto, sin variaciones.
 */

export const MESSAGES = {
  // ===========================================================================
  // Genéricos (L829-834)
  // ===========================================================================
  GENERIC_FETCH_ERROR: 'No se pudieron cargar los datos.',
  GENERIC_ERROR: 'Ocurrió un error',
  RETRY_BUTTON: 'Reintentar',
  CANCEL_BUTTON: 'Cancelar',

  // ===========================================================================
  // Carga de PDF (L835-853)
  // ===========================================================================
  UPLOAD_PDF_BUTTON: 'Cargar PDF',
  PROGRESS_UPLOADING: 'Subiendo el PDF…',
  PROGRESS_READING: 'Leyendo los productos…',
  PROGRESS_UPDATING_CATALOG: 'Actualizando tu catálogo…',
  RESULT_PDF_LOADED: 'PDF cargado',
  resultProductsRead: (cantidad: number | string) => `Productos leídos: ${cantidad}`,
  resultNewProducts: (cantidad: number | string) => `Productos nuevos: ${cantidad}`,
  resultPricelessStoreProducts: (cantidad: number | string) =>
    `Productos de tu tienda sin precio: ${cantidad}`,
  RESULT_PRICELESS_WARNING:
    'Revisa Mi tienda: los productos sin precio aparecen marcados como «Sin precio».',
  RESULT_UNDERSTOOD_BUTTON: 'Entendido',
  ERROR_NO_FILE: 'No se envió ningún archivo.',
  ERROR_ONLY_PDF: 'Solo se aceptan archivos PDF.',
  ERROR_FILE_TOO_LARGE: 'El archivo es demasiado grande. Máximo 10MB.',
  ERROR_NO_PRODUCTS: 'No se pudieron extraer productos del PDF.',
  ERROR_MISSING_DATE: 'No se encontró la fecha de la lista de precios en el PDF.',
  ERROR_MISSING_RATE: 'No se encontró la tasa BCV en el PDF.',
  PDF_PROCESSED_SUCCESS: 'El PDF se procesó correctamente.',

  // ===========================================================================
  // Catálogo y tienda (L854-887)
  // ===========================================================================
  PRODUCT_ADDED_TO_STORE: 'Producto agregado a tu tienda.',
  PRODUCT_ALREADY_IN_STORE: 'Este producto ya está en tu tienda.',
  PRODUCT_NOT_IN_STORE: 'Este producto ya no está en tu tienda.',
  PRODUCT_UPDATED: 'Producto actualizado.',
  PRODUCT_REMOVED_FROM_STORE: 'Producto eliminado de tu tienda.',
  ORDER_SAVE_ERROR: 'El orden no pudo guardarse.',
  ORDER_UPDATED: 'Orden actualizado.',
  PRICELESS: 'Sin precio',
  ACTION_ADD_TO_STORE: 'Agregar a mi tienda',
  ACTION_ADD_TO_LIST: 'Agregar a lista',
  BUTTON_EDIT: 'Editar',
  EDIT_PRODUCT_TITLE: 'Editar producto',
  FIELD_STORE_NAME: 'Nombre en tu tienda',
  FIELD_MANUAL_PRICE: 'Precio manual por caja (Bs)',
  HELP_MANUAL_PRICE: 'Déjalo vacío para usar el precio de la lista de tu distribuidor.',
  FIELD_UNITS_PER_BOX: 'Unidades por caja',
  FIELD_MARGINS: 'Márgenes de ganancia',
  BUTTON_ADD_MARGIN: 'Agregar margen',
  BUTTON_REMOVE_MARGIN: 'Quitar margen',
  PREVIEW_TITLE: 'Así quedarían tus precios',
  PREVIEW_BOX_PRICE: 'Precio por caja',
  PREVIEW_UNIT_PRICE: 'Precio por unidad',
  previewSalePriceWithMargin: (margen: string | number) => `Venta con ${margen}%`,
  BUTTON_SAVE: 'Guardar',
  BUTTON_CANCEL: 'Cancelar',
  DESTRUCTIVE_REMOVE_FROM_STORE: 'Quitar de mi tienda',
  ERROR_NAME_REQUIRED: 'El nombre es obligatorio.',
  ERROR_NAME_TOO_LONG: 'El nombre no puede pasar de 200 caracteres.',
  ERROR_PRICE_POSITIVE: 'El precio debe ser mayor que cero.',
  ERROR_UNITS_RANGE: 'Las unidades por caja van de 1 a 9999.',
  ERROR_MARGIN_RANGE: 'Cada margen va de 0% a 500%.',
  ERROR_MARGIN_DUPLICATE: 'No repitas márgenes.',
  ERROR_MARGIN_MAX: 'Máximo 5 márgenes.',
  ERROR_MARGIN_MIN: 'Debe haber al menos un margen.',
  ORDER_MOVE_UP: 'Subir',
  ORDER_MOVE_DOWN: 'Bajar',
  ORDER_MOVE: 'Mover',
  LIST_CONTROL_BOX_QUANTITY: 'Cantidad de cajas',
  LIST_CONTROL_CURRENCY: 'Moneda',

  // ===========================================================================
  // Historiales (L888-894)
  // ===========================================================================
  UPLOAD_HISTORY_TITLE: 'Historial de cargas',
  PRICE_HISTORY_TITLE: 'Historial de precios',
  STATUS_CURRENT: 'Vigente',
  STATUS_PREVIOUS: 'Anterior',
  STATUS_PROCESSING: 'En proceso',
  STATUS_FAILED: 'Fallida',
  PRICE_HISTORY_CURRENT_ROW: 'Actual',
  ACTION_DOWNLOAD_PDF: 'Descargar PDF',

  // ===========================================================================
  // Listas de compras (L895-913)
  // ===========================================================================
  LIST_CREATED: 'Lista creada.',
  LIST_UPDATED: 'Lista actualizada.',
  LIST_DELETED: 'Lista eliminada.',
  PRODUCT_ADDED_TO_LIST: 'Producto agregado a la lista.',
  PRODUCT_ALREADY_IN_LIST: 'Este producto ya está en la lista.',
  PRODUCT_NOT_IN_LIST: 'Este producto ya no está en la lista.',
  LIST_NOT_FOUND: 'Esta lista ya no existe.',
  PRODUCT_REMOVED_FROM_LIST: 'Producto eliminado de la lista.',
  LIST_ALREADY_FINALIZED: 'Esta lista ya fue finalizada y no puede editarse.',
  LIST_FINALIZED: 'Lista finalizada.',
  BUTTON_CREATE_LIST: 'Crear lista',
  BUTTON_FINALIZE_LIST: 'Finalizar lista',
  SHEET_ADD_TO_LIST_TITLE: 'Agregar a una lista',
  SHEET_ADD_BUTTON: 'Agregar',
  FINALIZE_ERROR_EMPTY: 'La lista está vacía. Agrega productos para poder finalizarla.',
  FINALIZE_ERROR_NO_ACTIVE_UPLOAD: 'Carga un PDF de precios para poder finalizar la lista.',
  FINALIZE_ERROR_PRICELESS:
    'Hay productos sin precio. Agrégales un precio manual en Mi tienda para poder finalizar.',

  // ===========================================================================
  // Facturas (L914-920)
  // ===========================================================================
  INVOICE_GENERATED: 'Factura generada.',
  INVOICE_GENERATE_ERROR: 'No se pudo generar la factura.',
  INVOICE_USD_DISCLAIMER: 'Las líneas en USD no están incluidas en el total en bolívares.',

  // ===========================================================================
  // Confirmaciones (L921-947)
  // ===========================================================================
  // Quitar un producto de Mi tienda
  CONFIRM_REMOVE_FROM_STORE_TITLE: '¿Quitar de tu tienda?',
  confirmRemoveFromStoreText: (nombreProducto: string) =>
    `Se quitará «${nombreProducto}» de Mi tienda y se perderán su nombre personalizado, precio manual y márgenes. Podrás volver a agregarlo desde el catálogo.`,
  CONFIRM_BUTTON_REMOVE: 'Quitar',

  // Quitar un producto de una lista
  CONFIRM_REMOVE_FROM_LIST_TITLE: '¿Quitar de la lista?',
  confirmRemoveFromListText: (nombreProducto: string) =>
    `Se quitará «${nombreProducto}» de esta lista.`,

  // Eliminar una lista
  CONFIRM_DELETE_LIST_TITLE: '¿Eliminar la lista?',
  confirmDeleteListText: (nombreLista: string) =>
    `Se eliminará «${nombreLista}» con todos sus productos. Esta acción no se puede deshacer.`,
  CONFIRM_BUTTON_DELETE: 'Eliminar',

  // Finalizar una lista
  CONFIRM_FINALIZE_LIST_TITLE: '¿Finalizar la lista?',
  confirmFinalizeListText: (nombreLista: string) =>
    `Se bloqueará «${nombreLista}», se guardarán los precios y la tasa BCV actuales y se generará la factura. Ya no podrás editarla.`,
  CONFIRM_BUTTON_FINALIZE: 'Finalizar',

  // Cargar un PDF más antiguo que el vigente
  CONFIRM_OLDER_PDF_TITLE: '¿Cargar una lista más antigua?',
  confirmOlderPdfText: (fechaPdf: string, fechaVigente: string) =>
    `Este PDF es del ${fechaPdf}, anterior a la lista vigente del ${fechaVigente}. Si continúas, sus precios reemplazarán a los actuales.`,
  CONFIRM_BUTTON_CONTINUE: 'Continuar',

  // ===========================================================================
  // Estados vacíos (L948-977)
  // ===========================================================================
  EMPTY_STORE_TITLE: 'Aún no tienes productos en tu tienda',
  EMPTY_STORE_ACTION: 'Ver todos los productos',
  EMPTY_CATALOG_TITLE: 'Aún no has cargado ninguna lista de precios',
  EMPTY_CATALOG_TEXT: 'Carga el PDF de tu distribuidor para ver los productos.',
  EMPTY_CATALOG_ACTION: 'Cargar PDF',
  EMPTY_SEARCH_NO_RESULTS: 'No se encontraron productos.',
  EMPTY_LISTS_TITLE: 'Aún no tienes listas de compras',
  EMPTY_LISTS_TEXT: 'Crea una lista para preparar tu próximo pedido.',
  EMPTY_LISTS_ACTION: 'Crear lista',
  EMPTY_LIST_DETAIL_TITLE: 'Esta lista está vacía',
  EMPTY_LIST_DETAIL_TEXT: 'Agrega productos desde Mi tienda o desde el Catálogo.',
  EMPTY_SHEET_NO_OPEN_LISTS: 'No tienes listas abiertas.',
  EMPTY_UPLOAD_HISTORY: 'Aún no has cargado ningún PDF.',
} as const;
