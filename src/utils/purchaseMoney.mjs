import Decimal from 'decimal.js';

export function parseUnitPrice(value) {
  const text = String(value).trim();
  if (!/^\d+(?:[.,]\d{1,4})?$/.test(text)) return null;
  const price = new Decimal(text.replace(',', '.'));
  return price.gt(0) ? price.toFixed() : null;
}

export function unitPriceInput(value) {
  return new Decimal(value).toFixed(4).replace('.', ',');
}

export function formatMoney(value, currency = 'ARS', digits = 2) {
  const precision = { minimumFractionDigits: digits, maximumFractionDigits: digits };
  try {
    return new Intl.NumberFormat('es-AR', { style: 'currency', currency, ...precision }).format(value);
  } catch {
    return `${currency} ${new Intl.NumberFormat('es-AR', precision).format(value)}`;
  }
}
