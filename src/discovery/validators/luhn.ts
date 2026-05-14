/** Luhn (mod 10) check for payment card numbers. */

export function isValidLuhn(digits: string): boolean {
  const compact = digits.replace(/\D/g, "");
  if (compact.length < 13 || compact.length > 19) return false;

  let sum = 0;
  let alt = false;
  for (let i = compact.length - 1; i >= 0; i -= 1) {
    let n = compact.charCodeAt(i) - 48;
    if (n < 0 || n > 9) return false;
    if (alt) {
      n *= 2;
      if (n > 9) n -= 9;
    }
    sum += n;
    alt = !alt;
  }
  return sum % 10 === 0;
}
