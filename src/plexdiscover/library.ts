import qs from 'querystring';
import {
	PlexAuthContext,
	PlexMetadataPage,
	PlexMetadataPageParams
} from '../plex/types';
import { plexDiscoverFetch } from './core';

export const getLibraryMetadata = async (id: string | string[], options: {
	params?: PlexMetadataPageParams,
	authContext?: PlexAuthContext | null
}): Promise<PlexMetadataPage> => {
	const idString = (id instanceof Array) ? id.map((idVal) => qs.escape(idVal)).join(',') : qs.escape(id);
	return await plexDiscoverFetch<PlexMetadataPage>({
		method: 'GET',
		endpoint: `library/metadata/${idString}`,
		params: options.params,
		authContext: options.authContext
	});
};

export const getLibraryMetadataChildren = async (id: string, options: {
	params?: PlexMetadataPageParams,
	offset?: number,
	count?: number,
	authContext?: PlexAuthContext | null
}): Promise<PlexMetadataPage> => {
	const params = {
		...options.params,
	};
	if(options.offset != null) {
		params['X-Plex-Container-Start'] = options.offset;
	}
	if(options.count != null) {
		params['X-Plex-Container-Size'] = options.count;
	}
	return await plexDiscoverFetch<PlexMetadataPage>({
		method: 'GET',
		endpoint: `library/metadata/${qs.escape(id)}/children`,
		params: params,
		authContext: options.authContext
	});
};
