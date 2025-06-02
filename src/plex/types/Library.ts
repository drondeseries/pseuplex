import {
	PlexLanguage,
	PlexLibraryAgent,
	PlexLibraryScanner,
	PlexMediaItemType,
	PlexMediaItemTypeNumeric
} from './common';
import { PlexMediaContainer } from './MediaContainer';

export type PlexGetLibraryMatchesParams = {
	guid?: string,
	type?: PlexMediaItemTypeNumeric | PlexMediaItemTypeNumeric[],
	title?: string,
	year?: number,
	agent?: PlexLibraryAgent,
	language?: PlexLanguage
};

export type PlexLibrarySection = {
	allowSync: boolean;
	art?: string;
	composite?: string; // "/library/sections/2/composite/1738767496"
	filters: boolean;
	refreshing?: boolean;
	thumb?: string; // "/:/resources/show.png", "/:/resources/movie.png"
	key: string;
	type: PlexMediaItemType;
	title: string;
	agent?: PlexLibraryAgent;
	scanner?: PlexLibraryScanner;
	language?: string; // "en-US"
	uuid: string;
	updatedAt?: number;
	createdAt?: number;
	scannedAt?: number;
	content: boolean;
	directory: boolean;
	contentChangedAt?: number;
	hidden?: number;
	Location?: PlexSectionLocation[];
	Preferences?: PlexSectionPreferences;
}

export interface PlexSectionLocation {
	id: number;
	path: string;
}

export interface PlexSectionPreferences {
	Setting: PlexSectionSetting[];
}

export interface PlexSectionSetting {
	id: string;
	label: string;
	summary: string;
	type: 'bool' | 'int' | 'text';
	default: string;
	value: string;
	hidden: boolean;
	advanced: boolean;
	group: string;
	enumValues?: string; // "0:Disabled|1:For recorded items|2:For all items"
}

export type PlexLibrarySectionsPage = PlexMediaContainer & {
	MediaContainer: {
		size: number;
		title1: string;
		Directory: PlexLibrarySection[];
	}
};
