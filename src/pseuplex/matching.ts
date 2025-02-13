import * as plexDiscoverAPI from '../plexdiscover';
import * as plexTypes from '../plex/types';

export type PlexMetadataMatchStoreOptions = {
	plexServerURL: string,
	plexAuthContext: plexTypes.PlexAuthContext,
	sharedServersMinLifetime: number
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
	types: plexDiscoverAPI.SearchType | plexDiscoverAPI.SearchType[],
	guids: `${string}://${string}`[],
};

export const findMatchingPlexMediaItem = async (options: PlexMediaItemMatchParams & {
	authContext?: plexTypes.PlexAuthContext | null,
	params?: plexTypes.PlexMetadataPageParams
}) => {
	var guidsSet = new Set<string>(options.guids);
	return await findMatchingPlexMetadata({
		query: options.year ? `${options.title} ${options.year}` : options.title,
		searchTypes: options.types,
		authContext: options.authContext,
		params: options.params
	}, (searchResult) => {
		/*return ((searchResult.Metadata.title == options.title || searchResult.Metadata.originalTitle == options.title)
			&& (searchResult.Metadata.year == options.year));*/
		return true;
	}, (metadata) => {
		if(metadata.Guid && metadata.Guid.length > 0 && options.guids.length > 0) {
			for(const guid of metadata.Guid) {
				if(guidsSet.has(guid.id)) {
					return true;
				}
			}
			return false;
		}
		return true;
	});
};

type SearchResultMatchFilter = (resultItem: plexTypes.PlexLibrarySearchResult) => boolean;
type MetadataMatchFilter = (metadataItem: plexTypes.PlexMetadataItem) => boolean;

const findMatchingPlexMetadata = async (options: {
	authContext?: plexTypes.PlexAuthContext | null,
	query: string,
	limit?: number,
	searchTypes: plexDiscoverAPI.SearchType | plexDiscoverAPI.SearchType[],
	params?: plexTypes.PlexMetadataPageParams
}, filter: SearchResultMatchFilter, validate: MetadataMatchFilter): Promise<plexTypes.PlexMetadataItem | null> => {
	const resultsPage = await plexDiscoverAPI.search({
		authContext: options.authContext,
		params: {
			...options.params,
			query: options.query,
			searchProviders: plexDiscoverAPI.SearchProvider.Discover,
			searchTypes: options.searchTypes,
			limit: options.limit ?? 10
		}
	});
	const searchResultsList = resultsPage.MediaContainer?.SearchResults;
	if(searchResultsList) {
		for(const searchResults of searchResultsList) {
			if(searchResults.SearchResult) {
				for(const searchResult of searchResults.SearchResult) {
					if(filter(searchResult)) {
						// fetch metadata details
						let key = searchResult.Metadata.key;
						if(key.endsWith('/children')) {
							key = key.substring(0, key.length-'/children'.length);
						}
						const metadataPage = await plexDiscoverAPI.fetch<plexTypes.PlexMetadataPage>({
							endpoint: key,
							authContext: options.authContext,
							params: options.params
						});
						let metadataItems = metadataPage?.MediaContainer?.Metadata;
						const metadataItem = (metadataItems instanceof Array) ? metadataItems[0] : metadataItems;
						if(metadataItem) {
							// validate metadata
							if(validate(metadataItem)) {
								return metadataItem;
							}
						}
					}
				}
			}
		}
	}
	return null;
};
