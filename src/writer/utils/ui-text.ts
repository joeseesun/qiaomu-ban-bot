export function t(source: string, args?: ReadonlyArray<string | number | null | undefined>): string {
  return source.replace(/\{(\d+)\}/g, (_, n) => String(args?.[Number(n)] ?? ''));
}
