export function formatCurrency(value: number): string {
  if (!value) return '-';
  return value.toLocaleString('en-SG', {
    style: 'currency',
    currency: 'SGD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  });
}
