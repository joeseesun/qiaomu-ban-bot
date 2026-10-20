import { openDb, requestResult, transactionDone } from '../db';
import { newId } from '../images';

export interface ChatMessage { role: 'user' | 'assistant'; content: string; applied?: number[]; thought?: string; thinkMs?: number; refs?: string[] }
export interface ChatSession { id: string; title: string; updatedAt: number; messages: ChatMessage[] }

export const MAX_SESSIONS = 10;
export const MAX_MESSAGES = 40;
const MAX_CHARS = 20000;
const keyFor = (articleId: string) => `aichat:${articleId}`;

export function newSession(): ChatSession { return { id: newId('chat_'), title: '', updatedAt: Date.now(), messages: [] }; }

export function titleOf(messages: ChatMessage[]): string {
	const first = messages.find(m => m.role === 'user')?.content.replace(/\s+/g, ' ').trim() ?? '';
	return first.length > 24 ? `${first.slice(0, 24)}…` : first;
}

export function normalizeSessions(raw: unknown): ChatSession[] {
	return (Array.isArray(raw) ? raw : []).filter((s: any) => s && typeof s.id === 'string' && Array.isArray(s.messages)).map((s: any): ChatSession => ({
		id: s.id, title: String(s.title ?? ''), updatedAt: Number(s.updatedAt) || 0,
		messages: s.messages.filter((m: any) => m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string').slice(-MAX_MESSAGES)
			.map((m: any): ChatMessage => ({ role: m.role, content: m.content.slice(0, MAX_CHARS), ...(Array.isArray(m.applied) ? { applied: m.applied.filter((n: unknown) => Number.isInteger(n)) } : {}), ...(typeof m.thought === 'string' && m.thought ? { thought: m.thought.slice(0, 6000) } : {}), ...(typeof m.thinkMs === 'number' ? { thinkMs: m.thinkMs } : {}), ...(Array.isArray(m.refs) ? { refs: m.refs.filter((r: unknown): r is string => typeof r === 'string').slice(0, 8) } : {}) })),
	})).sort((a, b) => b.updatedAt - a.updatedAt).slice(0, MAX_SESSIONS);
}

export async function loadChat(articleId: string): Promise<ChatSession[]> {
	const db = await openDb();
	return normalizeSessions(await requestResult(db.transaction('meta').objectStore('meta').get(keyFor(articleId))));
}
export async function saveChat(articleId: string, sessions: ChatSession[]): Promise<void> {
	const db = await openDb();
	const tx = db.transaction('meta', 'readwrite');
	tx.objectStore('meta').put(normalizeSessions(sessions.filter(s => s.messages.length)), keyFor(articleId));
	await transactionDone(tx);
}
export async function deleteChat(articleId: string): Promise<void> {
	const db = await openDb();
	const tx = db.transaction('meta', 'readwrite');
	tx.objectStore('meta').delete(keyFor(articleId));
	await transactionDone(tx);
}
