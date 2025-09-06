// src/utils/formatCurrency.ts
// Helper za evropski format valute (npr. 4.300,20 €) i parsiranje "money-like" stringova.

/** Pretvori string/broj u Number (podržava EU format sa zarezom). */
function toNumberLike(input: any): number | null {
  if (input === null || input === undefined) return null;
  if (typeof input === "number" && isFinite(input)) return input;

  const raw = String(input).trim();
  if (!raw) return null;

  // Ukloni sve osim brojeva, tačke, zareza i minusa
  let s = raw.replace(/[^0-9,.\-]/g, "");

  // Ako postoje i zarez i tačka, pretpostavi da je zarez separator hiljada
  if (s.includes(",") && s.includes(".")) {
    s = s.replace(/,/g, "");
  } else if (s.includes(",") && !s.includes(".")) {
    // Ako postoji samo zarez, tretiraj ga kao decimalni separator
    s = s.replace(/,/g, ".");
  }

  const n = parseFloat(s);
  return isFinite(n) ? n : null;
}

/** Formatiraj vrednost u EU oblik (npr. "4.300,20 €"). */
export function formatCurrency(
  value: any,
  {
    locale = "de-DE",
    currency = "EUR",
    showSymbol = true,
    symbolPosition = "after", // "before" -> "€ 1.234,56"
  }: {
    locale?: string;
    currency?: string;
    showSymbol?: boolean;
    symbolPosition?: "after" | "before";
  } = {}
): string {
  const n = toNumberLike(value);
  if (n === null) return "";

  const formatted = new Intl.NumberFormat(locale, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n);

  if (!showSymbol) return formatted;

  const symbol = currency === "EUR" ? "€" : currency;
  return symbolPosition === "before" ? `${symbol} ${formatted}` : `${formatted} ${symbol}`;
}

/** Parsiraj "money-like" string u broj (0 ako nije validan). */
export function moneyToNumber(value: any): number {
  const n = toNumberLike(value);
  return n === null ? 0 : n;
}