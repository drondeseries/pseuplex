import {
	PlexLanguage,
	PlexLibraryAgent,
	PlexMediaItemTypeNumeric
} from './common';

export type PlexGetLibraryMatchesParams = {
	guid?: string,
	type?: PlexMediaItemTypeNumeric | PlexMediaItemTypeNumeric[],
	title?: string,
	year?: number,
	agent?: PlexLibraryAgent,
	language?: PlexLanguage
};
