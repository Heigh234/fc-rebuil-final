import { PDFParse } from "pdf-parse";

const COMPANY_MARKER = "DISTRIBUIDORA Y COMERCIALIZADORA FC";
const TITLE_MARKER = "LISTA DE PRECIOS ACTUALIZADA";
const RATE_MARKER = "TASA DEL DIA (BCV):";
const DATE_MARKER = "FECHA:";

const PRODUCT_ROW_PATTERN =
  /^Bs\s+([0-9][0-9 ]*\.[0-9]{2})\s+(.+)$/;

function normalizeWhitespace(value) {
  return value.replace(/\s+/g, " ").trim();
}

function parseRateFromLine(line) {
  const markerIndex = line.indexOf(RATE_MARKER);

  if (markerIndex === -1) {
    return null;
  }

  const afterMarker = line.slice(markerIndex + RATE_MARKER.length);
  const match = afterMarker.match(/^\s*([0-9][0-9 ]*\.[0-9]{2})Bs\s*$/);

  if (!match) {
    return null;
  }

  return match[1].replace(/ /g, "");
}

function parseDateFromLine(line) {
  const match = line.match(/([0-9]{2}\/[0-9]{2}\/[0-9]{4})\s*FECHA:/);

  if (!match) {
    return null;
  }

  const [day, month, year] = match[1].split("/");

  return `${year}-${month}-${day}`;
}

export async function extractDistributorPdfText(pdfBytes) {
  if (!(pdfBytes instanceof Uint8Array)) {
    throw new TypeError("PDF bytes must be provided as a Uint8Array.");
  }

  const parser = new PDFParse({ data: pdfBytes });

  let result;

  try {
    result = await parser.getText();
  } finally {
    await parser.destroy();
  }

  return result.text ?? "";
}

export function parseDistributorText(text) {
  if (typeof text !== "string") {
    throw new TypeError("Distributor text must be provided as a string.");
  }

  const lines = text.split(/\r?\n/);

  if (!text.includes(COMPANY_MARKER)) {
    throw new Error(
      "This does not appear to be a Distribuidora FC price list."
    );
  }

  if (!text.includes(TITLE_MARKER)) {
    throw new Error("The price-list title could not be found.");
  }

  const rates = [];
  const dates = [];

  for (const line of lines) {
    const rate = parseRateFromLine(line);

    if (rate !== null) {
      rates.push(rate);
    }

    const date = parseDateFromLine(line);

    if (date !== null) {
      dates.push(date);
    }
  }

  if (rates.length === 0) {
    throw new Error(
      "The BCV rate could not be found in the PDF. Is this the distributor's correct file?"
    );
  }

  if (new Set(rates).size !== 1) {
    throw new Error(
      "The PDF contains conflicting BCV rates. Upload was cancelled."
    );
  }

  if (dates.length === 0) {
    throw new Error("The PDF's date could not be found.");
  }

  if (new Set(dates).size !== 1) {
    throw new Error(
      "The PDF contains conflicting dates. Upload was cancelled."
    );
  }

  const products = [];
  const productsByName = new Map();

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const match = line.match(PRODUCT_ROW_PATTERN);

    if (!match) {
      continue;
    }

    const price = match[1].replace(/ /g, "");
    const pdfName = normalizeWhitespace(match[2]);

    if (pdfName.length === 0) {
      throw new Error(
        `Malformed product row on extracted line ${index + 1}: product name is empty.`
      );
    }

    const existing = productsByName.get(pdfName);

    if (existing) {
      if (existing.price !== price) {
        throw new Error(
          `Conflicting duplicate product name: "${pdfName}". ` +
            `First price: ${existing.price}. Later price: ${price}.`
        );
      }

      continue;
    }

    const product = { pdfName, price };
    products.push(product);
    productsByName.set(pdfName, product);
  }

  if (products.length === 0) {
    throw new Error("No products were found in the PDF.");
  }

      return {
    pdfDate: dates[0],
    bcvRate: rates[0],
    products,
    extraction: {
      productCount: products.length,
    },
  };
}
export async function parseDistributorPdf(pdfBytes) {
  if (!(pdfBytes instanceof Uint8Array)) {
    throw new TypeError("PDF bytes must be provided as a Uint8Array.");
  }

  const parser = new PDFParse({ data: pdfBytes });

  let result;

  try {
    result = await parser.getText();
  } finally {
    await parser.destroy();
  }

  const text = result.text ?? "";
  const parsed = parseDistributorText(text);

  return {
    ...parsed,
    extraction: {
      ...parsed.extraction,
      pages: result.total ?? null,
    },
  };
}
