/**
 * Normaliza una cadena de texto para búsqueda:
 * - Convierte a minúsculas
 * - Elimina diacríticos/tildes (descomposición NFD)
 * - Colapsa espacios múltiples en uno solo
 * - Elimina espacios a los extremos
 */
export function normalizeSearchText(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Filtra candidatos multi-palabra según la Sección 17 (L755-758):
 * - Insensible a mayúsculas y tildes.
 * - Si se escriben varias palabras, el producto debe contener todas, en cualquier orden.
 * - Si la consulta está vacía o contiene solo espacios, coincide con todo.
 */
export function matchesMultiWordQuery(
  query: string,
  candidateFields: (string | null | undefined)[]
): boolean {
  const normalizedQuery = normalizeSearchText(query);
  if (!normalizedQuery) {
    return true;
  }

  const queryWords = normalizedQuery.split(' ').filter(Boolean);

  const searchableText = candidateFields
    .filter((field): field is string => Boolean(field))
    .map((field) => normalizeSearchText(field))
    .join(' ');

  return queryWords.every((word) => searchableText.includes(word));
}
