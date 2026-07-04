/** Minimal className joiner — filters falsy values. Avoids a clsx dependency. */
export function cn(...classes: Array<string | false | null | undefined>): string {
  return classes.filter(Boolean).join(' ');
}
