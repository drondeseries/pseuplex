import * as plexTypes from '../plex/types';
import { booleanQueryParam } from '../plex/api/core';
import { plexDiscoverFetch } from './core';

export enum SearchProvider {
	Discover = 'discover',
	plexAvailableOnDemand = 'plexAVOD',
	plexTVOnDemand = 'plexTVOD',
	plexFAST = 'plexFAST'
};

export enum SearchType {
	AvailabilityPlatforms = 'availabilityPlatforms',
	Categories = 'categories',
	Movies = plexTypes.PlexLibrarySearchType.Movies,
	TV = plexTypes.PlexLibrarySearchType.TV,
	Music = plexTypes.PlexLibrarySearchType.Music,
	People = plexTypes.PlexLibrarySearchType.People,
	TVOnDemand = 'tvod',
	LiveTV = 'livetv'
}

export enum SearchResultsType {
	Plex = 'plex',
	PlexTVOnDemand = 'plex_tvod',
	External = 'external'
};

export type SearchResults = {
	id: SearchResultsType;
	title: string;
	size: number;
	SearchResult?: plexTypes.PlexLibrarySearchResult[];
};

export type SearchResultsPage = {
	MediaContainer: {
		suggestedTerms: string[];
		identifier: string[];
		size: number;
		SearchResults: SearchResults[];
	}
};

export const search = async (options: {
	params: {
		query: string;
		searchTypes: SearchType | SearchType[];
		searchProviders: SearchProvider | SearchProvider[];
		limit?: number;
		includeMetadata?: boolean;
		filterPeople?: boolean;
	},
	authContext?: plexTypes.PlexAuthContext | null
}): Promise<SearchResultsPage> => {
	// parse params
	if(options.params?.searchTypes instanceof Array) {
		options.params.searchTypes = options.params.searchTypes.join(',') as any;
	}
	if(options.params?.searchProviders instanceof Array) {
		options.params.searchProviders = options.params.searchProviders.join(',') as any;
	}
	if(options.params.includeMetadata != null) {
		options.params.includeMetadata = booleanQueryParam(options.params.includeMetadata) as any;
	}
	if(options.params.filterPeople != null) {
		options.params.filterPeople = booleanQueryParam(options.params.filterPeople) as any;
	}
	// send request
	return await plexDiscoverFetch<SearchResultsPage>({
		method: 'GET',
		endpoint: 'library/search',
		params: options.params,
		authContext: options.authContext
	});
};
