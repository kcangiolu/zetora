// An amount of money for display. An answer often costs a fraction of a cent,
// which two decimals would show as 0.00: below a cent, two significant digits.
export function formatCost(amount: number, locale: string, currency = 'USD'): string {
  const precision =
    amount !== 0 && Math.abs(amount) < 0.01
      ? { maximumSignificantDigits: 2 }
      : { minimumFractionDigits: 2, maximumFractionDigits: 2 };
  return new Intl.NumberFormat(locale, { style: 'currency', currency, ...precision }).format(amount);
}
