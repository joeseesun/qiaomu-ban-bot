import { createMarkdownContent } from './defuddle';
export type TranscriptExportMode = 'original' | 'translated' | 'bilingual';
export function translatedCount(transcript: Element): { ready: number; total: number } {
 const segments = Array.from(transcript.querySelectorAll<HTMLElement>('.transcript-segment'));
 return { ready: segments.filter(s => s.dataset.translationReady === 'true' && typeof s.dataset.translatedText === 'string').length, total: segments.length };
}
// Clone only the caption content, never player controls or live-reader affordances.
export function exportTranscript(transcript: Element, url: string, mode: TranscriptExportMode): string {
 const clone = transcript.cloneNode(true) as HTMLElement;
 clone.querySelectorAll('.transcript-heading-tools, .transcript-translation, .transcript-scrub-track, button, input, select, style').forEach(el => el.remove());
 for (const segment of Array.from(clone.querySelectorAll<HTMLElement>('.transcript-segment'))) {
  const translation = segment.dataset.translationReady === 'true' ? segment.dataset.translatedText?.trim() : '';
  if (mode === 'original') continue;
  if (!translation) {if(mode==='translated'&&segment.dataset.translationReady==='true'){const timestamp=segment.querySelector('strong')?.cloneNode(true);segment.replaceChildren();if(timestamp)segment.append(timestamp);}continue;}
  const original = segment.cloneNode(true) as HTMLElement; original.querySelector('strong')?.remove();
  if (original.textContent?.replace(/^\s*·\s*/, '').replace(/\s+/g, ' ').trim() === translation.replace(/\s+/g, ' ').trim()) continue;
  const translated = clone.ownerDocument.createElement('div');
  for (const text of translation.split(/\n\s*\n/)) { const p = clone.ownerDocument.createElement('p'); p.textContent = text; translated.append(p); }
  if (mode === 'translated') {
   const timestamp = segment.querySelector('strong')?.cloneNode(true);
   segment.replaceChildren(); if (timestamp) segment.append(timestamp, clone.ownerDocument.createTextNode(' · '));
  }
  segment.append(translated);
 }
 return createMarkdownContent(clone.outerHTML, url).trim();
}

