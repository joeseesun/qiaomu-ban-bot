import type { ArticleSource } from '../write/source-import';
export interface ClipPreview {
 clip: {url:string;title:string;markdown:string}; local:{requestId:string}; articleSource?:ArticleSource;
 mediaReadUrl?:string; studySource?:unknown; localMedia?:unknown; remoteMedia?:unknown;
 transcriptExport?:{mode:'display'|'original'|'translated'|'bilingual'}; studyEditedAt?:number; readerAppendix?:string;
}
