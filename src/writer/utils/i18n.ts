import messages from './messages.json';
export function getMessage(key: string, values?: string | string[]): string {
  const entry = (messages as any)[key]; if (!entry) return key;
  const args = typeof values === 'string' ? [values] : values || [];
  return entry.message.replace(/\$([\w]+)\$/g, (original: string, name: string) => {
    const index = Number(entry.placeholders?.[name.toLowerCase()]?.content?.replace('$','')) - 1;
    return index >= 0 ? args[index] ?? '' : original;
  }).replace(/\$(\d+)/g, (_: string, index: string) => args[Number(index)-1] ?? '');
}
export function translatePage(root: ParentNode = document): void {
  root.querySelectorAll<HTMLElement>('[data-i18n]').forEach(node => node.textContent = getMessage(node.dataset.i18n!));
}

export async function initializeI18n(): Promise<void> { translatePage(); }
