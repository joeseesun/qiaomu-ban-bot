import browser from '../../utils/browser-polyfill';
import { t } from '../../utils/ui-text';
import { h, toast } from '../editor/dom';
import { saveImage } from '../images';
import { ASPECTS, generateImage, loadImageModels, modelsOf, readyModels, serviceName, type ImageModelConfig } from '../image-models';
import { getLocalStorage, setLocalStorage } from '../../utils/storage-utils';

export function describeImageError(error: unknown): string {
	const text = String((error as Error)?.message ?? error);
	if (/HTTP (401|403)/.test(text)) return t('密钥无效，或这个密钥没有生图权限');
	if (/HTTP 429/.test(text)) return t('请求太频繁，或额度用完了，稍后再试');
	if (/HTTP 400/.test(text)) return t('服务拒绝了这次请求：{0}', [text.replace(/^HTTP 400:?\s*/, '').slice(0, 160) || t('描述可能不被接受')]);
	if (/empty-image/.test(text)) return t('服务没有返回图片，换个描述再试');
	if (/abort|timeout|timed out/i.test(text)) return t('等得太久了，已经取消');
	if (/not-ready/.test(text)) return t('这个生图模型还没填完整');
	return text.slice(0, 200);
}

export interface ImageApply { label: string; run: (imageId: string, prompt: string) => void | Promise<void> }
export interface ImageDialogOptions { title?: string; prompt?: string; aspect?: string; autoRun?: boolean; applies: ImageApply[] }

export const openImageSettings = () => { void browser.tabs.create({ url: browser.runtime.getURL('settings.html?section=image-models') }); };

// Describe a picture, pick a shape, look at the result, then decide where it goes.
export async function openImageDialog(options: ImageDialogOptions): Promise<void> {
	const store = await loadImageModels();
	const models = readyModels(store);
	const dialog = h('dialog', { class: 'qw-dialog qw-image-dialog', 'aria-label': options.title ?? t('AI 配图') });
	const close = () => { controller?.abort(); if (url) URL.revokeObjectURL(url); dialog.close(); dialog.remove(); };
	let controller: AbortController | undefined;
	let url = '';
	const title = h('h2', { class: 'qw-dialog-title', text: options.title ?? t('AI 配图') });
	dialog.addEventListener('cancel', event => { event.preventDefault(); close(); });
	document.body.append(dialog);

	if (!models.length) {
		const go = h('button', { type: 'button', class: 'qw-btn qw-btn-primary', text: t('去添加生图模型') });
		go.addEventListener('click', () => { close(); openImageSettings(); });
		const cancel = h('button', { type: 'button', class: 'qw-btn', text: t('取消'), onclick: close });
		dialog.append(title, h('p', { class: 'qw-dialog-note', text: t('还没有可用的生图模型。添加一个以后，就能在这里生成配图和封面。') }), h('div', { class: 'qw-dialog-actions' }, cancel, go));
		dialog.showModal();
		return;
	}

	const prompt = h('textarea', { class: 'qw-field', rows: 4, placeholder: t('描述想要的画面、风格和构图'), spellcheck: false });
	prompt.value = options.prompt ?? '';
	const aspect = h('select', { class: 'qw-field', 'aria-label': t('画面比例') });
	for (const a of ASPECTS) aspect.append(h('option', { value: a, text: a }));
	aspect.value = options.aspect && (ASPECTS as readonly string[]).includes(options.aspect) ? options.aspect : '16:9';
	// Every model of every connected service, grouped by service; the last choice is remembered.
	const model = h('select', { class: 'qw-field', 'aria-label': t('生图模型') });
	const choices: { key: string; config: ImageModelConfig; modelId: string }[] = [];
	for (const config of models) {
		const group = h('optgroup', { label: serviceName(config) });
		for (const modelId of modelsOf(config)) { const key = `${config.id}\u0000${modelId}`; choices.push({ key, config, modelId }); group.append(h('option', { value: key, text: modelId })); }
		model.append(group);
	}
	const fallback = models.find(m => m.id === store.defaultId) ?? models[0];
	const remembered = String(await getLocalStorage('qiaomuWriteImageChoice') ?? '');
	model.value = choices.some(c => c.key === remembered) ? remembered : `${fallback.id}\u0000${fallback.model}`;
	const status = h('p', { class: 'qw-dialog-note', role: 'status', 'aria-live': 'polite' });
	const preview = h('div', { class: 'qw-image-preview', hidden: true });
	const generate = h('button', { type: 'button', class: 'qw-btn qw-btn-primary', text: t('生成') });
	const cancel = h('button', { type: 'button', class: 'qw-btn', text: t('关闭'), onclick: close });
	const applies = options.applies.map(apply => { const b = h('button', { type: 'button', class: 'qw-btn qw-btn-primary', text: apply.label, hidden: true }); return { apply, b }; });
	let blob: Blob | undefined;

	const run = async () => {
		const text = prompt.value.trim();
		if (!text) { status.textContent = t('先写下想要的画面'); prompt.focus(); return; }
		const choice = choices.find(c => c.key === model.value) ?? choices[0];
		void setLocalStorage('qiaomuWriteImageChoice', choice.key);
		controller?.abort(); controller = new AbortController();
		blob = undefined; applies.forEach(({ b }) => { b.hidden = true; });
		generate.disabled = true; generate.textContent = t('生成中…'); status.textContent = t('通常需要十几秒到一分钟，可以先做别的事，这个窗口别关。');
		try {
			blob = await generateImage(choice.config, text, aspect.value, controller.signal, choice.modelId);
			if (url) URL.revokeObjectURL(url);
			url = URL.createObjectURL(blob);
			preview.textContent = ''; preview.hidden = false;
			preview.append(h('img', { src: url, alt: text }));
			status.textContent = ''; applies.forEach(({ b }) => { b.hidden = false; });
			generate.textContent = t('重新生成');
		} catch (error) {
			if ((error as Error)?.name === 'AbortError' && !dialog.isConnected) return;
			status.textContent = describeImageError(error); generate.textContent = blob ? t('重新生成') : t('生成');
		} finally { generate.disabled = false; }
	};
	generate.addEventListener('click', () => void run());
	for (const { apply, b } of applies) {
		b.addEventListener('click', async () => {
			if (!blob) return;
			b.disabled = true;
			try { const image = await saveImage(blob, 'ai-image.png'); await apply.run(image.id, prompt.value.trim()); close(); }
			catch { toast(t('这张图片没能保存'), 'error'); b.disabled = false; }
		});
	}
	const row = h('div', { class: 'qw-image-row' }, aspect, choices.length > 1 ? model : null);
	dialog.append(title, prompt, row, status, preview, h('div', { class: 'qw-dialog-actions' }, cancel, generate, ...applies.map(({ b }) => b)));
	dialog.showModal();
	prompt.focus();
	if (options.autoRun && prompt.value.trim()) void run();
}
