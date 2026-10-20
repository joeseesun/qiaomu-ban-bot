// Mock for webextension-polyfill in test environment
export const runtime = {
	getURL: (path: string) => `chrome-extension://mock-id/${path}`,
	sendMessage: async () => ({}),
	onMessage: {
		addListener: () => {},
		removeListener: () => {},
	},
};

export const storage = {
	local: {
		get: async () => ({}),
		set: async () => {},
	},
	sync: {
		get: async () => ({}),
		set: async () => {},
	},
	onChanged: {
		addListener: () => {},
		removeListener: () => {},
	},
};

export const tabs = {
	query: async () => [],
	sendMessage: async () => ({}),
};

export const i18n = {
	getMessage: (key: string) => key,
};

export const permissions = { contains: async () => true, request: async () => true };
export default {
	permissions,
	runtime,
	storage,
	tabs,
	i18n,
};
