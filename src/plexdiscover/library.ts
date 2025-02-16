import qs from 'querystring';
import * as plexTypes from '../plex/types';
import { plexDiscoverFetch } from './core';

export const getLibraryMetadata = async (id: string | string[], options: {
	params?: plexTypes.PlexMetadataPageParams,
	authContext?: plexTypes.PlexAuthContext | null
}): Promise<plexTypes.PlexMetadataPage> => {
	const idString = (id instanceof Array) ? id.map((idVal) => qs.escape(idVal)).join(',') : qs.escape(id);
	return await plexDiscoverFetch<plexTypes.PlexMetadataPage>({
		method: 'GET',
		endpoint: `library/metadata/${idString}`,
		params: options.params,
		authContext: options.authContext
	});
};

export const getLibraryMetadataChildren = async (id: string, options: {
	params?: plexTypes.PlexMetadataChildrenPageParams,
	authContext?: plexTypes.PlexAuthContext | null
}): Promise<plexTypes.PlexMetadataPage> => {
	return await plexDiscoverFetch<plexTypes.PlexMetadataPage>({
		method: 'GET',
		endpoint: `library/metadata/${qs.escape(id)}/children`,
		params: options.params,
		authContext: options.authContext
	});
};
