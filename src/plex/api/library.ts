import qs from 'querystring';
import * as plexTypes from '../types';
import {
	plexServerFetch
} from './core';

export const getLibraryMetadata = async (id: string | string[], options: {
	params?: plexTypes.PlexMetadataPageParams,
	serverURL: string,
	authContext?: plexTypes.PlexAuthContext | null
}): Promise<plexTypes.PlexMetadataPage> => {
	const idString = (id instanceof Array) ? id.map((idVal) => qs.escape(idVal)).join(',') : qs.escape(id);
	return await plexServerFetch<plexTypes.PlexMetadataPage>({
		serverURL: options.serverURL,
		method: 'GET',
		endpoint: `library/metadata/${idString}`,
		params: options.params,
		authContext: options.authContext
	});
};

export const getLibraryMetadataChildren = async (id: string, options: {
	params?: plexTypes.PlexMetadataChildrenPageParams,
	serverURL: string,
	authContext?: plexTypes.PlexAuthContext | null
}): Promise<plexTypes.PlexMetadataPage> => {
	return await plexServerFetch<plexTypes.PlexMetadataPage>({
		serverURL: options.serverURL,
		method: 'GET',
		endpoint: `library/metadata/${qs.escape(id)}/children`,
		params: options.params,
		authContext: options.authContext
	});
};

export type FindLibraryMetadataArgs = (
	{type?: plexTypes.PlexMediaItemTypeNumeric}
	& ({guid: string} | {'show.guid': string, 'season.index': number})
);

export const findLibraryMetadata = async (args: FindLibraryMetadataArgs, options: {
	params?: plexTypes.PlexMetadataPageParams,
	serverURL: string,
	authContext?: plexTypes.PlexAuthContext | null
}): Promise<plexTypes.PlexMetadataPage> => {
	return await plexServerFetch<plexTypes.PlexMetadataPage>({
		serverURL: options.serverURL,
		method: 'GET',
		endpoint: 'library/all',
		params: {
			...args,
			...options.params
		},
		authContext: options.authContext
	});
};

export const getLibraryMetadataRelatedHubs = async (id: string | string[], options: {
	params?: plexTypes.PlexHubListPageParams,
	serverURL: string,
	authContext?: plexTypes.PlexAuthContext | null
}): Promise<plexTypes.PlexHubsPage> => {
	return await plexServerFetch({
		serverURL: options.serverURL,
		method: 'GET',
		endpoint: `/library/metadata/${(id instanceof Array) ? id.map((idVal) => qs.escape(idVal)).join(',') : qs.escape(id)}/related`,
		params: options.params,
		authContext: options.authContext
	});
};

export const searchLibrary = async (options: {
	params: plexTypes.PlexLibrarySearchParams,
	serverURL: string,
	authContext?: plexTypes.PlexAuthContext | null
}): Promise<plexTypes.PlexLibrarySearchResultsPage> => {
	// parse params
	if(options.params?.searchTypes instanceof Array) {
		options.params.searchTypes = options.params.searchTypes.join(',') as any;
	}
	// send request
	return await plexServerFetch<plexTypes.PlexLibrarySearchResultsPage>({
		serverURL: options.serverURL,
		method: 'GET',
		endpoint: 'library/search',
		params: options.params,
		authContext: options.authContext
	});
};
