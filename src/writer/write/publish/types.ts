import type { Article, PublishRecord, PublishTarget } from '../types';

export interface PublishRequest {
	article: Article;
	markdown: string;
	// Called once the platform has accepted the article, so the list can show where it went.
	onRecorded: (record: PublishRecord) => void;
}

// X Helper writes a draft; the user confirms publication on X.
export interface Publisher {
	id: PublishTarget;
	label: () => string;
	hint: () => string;
	run: (request: PublishRequest) => Promise<void>;
}
