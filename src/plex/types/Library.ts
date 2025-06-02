import {
	PlexLanguage,
	PlexLibraryAgent,
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
	art: string;
	composite: string;
	filters: boolean;
	refreshing: boolean;
	thumb: string;
	key: string;
	type: string;
	title: string;
	agent: string;
	scanner: string;
	language: string;
	uuid: string;
	updatedAt: number;
	createdAt: number;
	scannedAt: number;
	content: boolean;
	directory: boolean;
	contentChangedAt: number;
	hidden: number;
	Location: PlexSectionLocation[];
	Preferences: PlexSectionPreferences;
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
