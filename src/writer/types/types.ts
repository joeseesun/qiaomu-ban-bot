export interface Provider {
	id: string;
	name: string;
	baseUrl: string;
	apiKey: string;
	apiKeyRequired?: boolean;
	presetId?: string;
	// Signed in with an account instead of an API key (ChatGPT or Codex).
	oauth?: OAuthCredentials;
}

export interface OAuthCredentials {
	kind: 'chatgpt' | 'codex';
	clientId: string;
	access: string;
	refresh: string;
	idToken?: string;
	expires: number;
	accountId?: string;
	email?: string;
	plan?: string;
}

export interface ModelConfig {
	reasoningEfforts?: string[];
	reasoningEffort?: string;
	id: string;
	providerId: string;
	providerModelId: string;
	name: string;
	enabled: boolean;
}
