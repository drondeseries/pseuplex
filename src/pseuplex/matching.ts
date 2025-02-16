import * as plexTypes from '../plex/types';
import { PlexClient } from '../plex/client';
import { findInArrayOrSingle, firstOrSingle } from '../utils';

export type PlexMetadataMatchStoreOptions = {
	plexServerURL: string,
	plexAuthContext: plexTypes.PlexAuthContext
};

export class PlexMetadataMatchStore {
	_options: PlexMetadataMatchStoreOptions;
	_tmdbIdsToPlexGuids: { [key: string]: string } = {};
	_imdbIdsToPlexGuids: { [key: string]: string } = {};

	constructor(options: PlexMetadataMatchStoreOptions) {
		this._options = options;
	}
}

export type PlexMediaItemMatchParams = {
	title: string,
	year?: number | string,
	types: plexTypes.PlexMediaItemTypeNumeric | plexTypes.PlexMediaItemTypeNumeric[],
	guids: `${string}://${string}`[]
};

export const findMatchingPlexMediaItem = async (metadataClient: PlexClient, options: PlexMediaItemMatchParams & {
	authContext?: plexTypes.PlexAuthContext | null
}): Promise<plexTypes.PlexMetadataItem | null> => {
	// match against guids
	if(options.guids) {
		for(const guid of options.guids) {
			const matchesPage = await metadataClient.getMatches({
				type: options.types,
				guid
			}, {
				authContext: options.authContext
			});
			const metadataItem = firstOrSingle(matchesPage.MediaContainer.Metadata);
			if(metadataItem) {
				return metadataItem;
			}
		}
	}
	// no matches against guids, so try finding by title and year if possible
	if(options.year) {
		const matchesPage = await metadataClient.getMatches({
			type: options.types,
			title: options.title,
			year: options.year as number
		});
		const lowercaseTitle = options.title.toLowerCase();
		const metadataItem = findInArrayOrSingle(matchesPage.MediaContainer.Metadata, (metadataItem) => {
			return (metadataItem.title.toLowerCase() == lowercaseTitle && metadataItem.year == options.year);
		});
		if(metadataItem) {
			return metadataItem;
		}
	}
	return null;
};
