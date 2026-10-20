export function showModal(modal: HTMLElement | null): void {
	if (modal) {
		const cleanup = (modal as any).cleanupModal;
		cleanup?.();
		const previousFocus = document.activeElement as HTMLElement | null;
		modal.setAttribute('role', 'dialog');
		modal.setAttribute('aria-modal', 'true');
		modal.setAttribute('aria-label', modal.querySelector('.modal-title')?.textContent || '');
		modal.style.display = 'flex';
		const modalBg = modal.querySelector('.modal-bg');
		const close = () => hideModal(modal);
		modalBg?.addEventListener('click', close);

		// Add escape key listener when showing modal
		const handleEscape = (e: KeyboardEvent) => {
			if (e.key === 'Escape') {
				e.preventDefault();
				hideModal(modal);
			}
			if (e.key === 'Tab') {
				const controls = [...modal.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled),select,textarea,a[href],[tabindex="0"]')].filter(node => node.getClientRects().length);
				const first=controls[0],last=controls.at(-1);
				if(e.shiftKey && document.activeElement===first){e.preventDefault();last?.focus();}
				else if(!e.shiftKey && document.activeElement===last){e.preventDefault();first?.focus();}
			}
		};
		document.addEventListener('keydown', handleEscape);
		(modal as any).cleanupModal = () => {
			modalBg?.removeEventListener('click', close);
			document.removeEventListener('keydown', handleEscape);
			previousFocus?.focus();
		};
	}
}

export function hideModal(modal: HTMLElement | null): void {
	if (modal) {
		modal.style.display = 'none';
		(modal as any).cleanupModal?.();
		delete (modal as any).cleanupModal;
		modal.dispatchEvent(new Event('qx-modal-closed'));

		// Clear the textarea content
		const textarea = modal.querySelector('#import-json-textarea') as HTMLTextAreaElement;
		if (textarea) {
			textarea.value = '';
		}
	}
}
