import {
	PlexLanguage,
	PlexLibraryAgent,
	PlexMediaItemTypeNumeric
} from './common';
import { PlexMediaContainer } from './MediaContainer';
import { PlexContentDirectory } from './MediaProvider';

export type PlexGetLibraryMatchesParams = {
	guid?: string,
	type?: PlexMediaItemTypeNumeric | PlexMediaItemTypeNumeric[],
	title?: string,
	year?: number,
	agent?: PlexLibraryAgent,
	language?: PlexLanguage
};

export type PlexLibrarySectionsPage = PlexMediaContainer & {
	MediaContainer: {
		title1: string;
		Directory: PlexContentDirectory[];
	}
};
