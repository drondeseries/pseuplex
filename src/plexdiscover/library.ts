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
	return await plexDiscoverFetch<PlexMetadataPage>({
		method: 'GET',
		endpoint: `library/metadata/${(id instanceof Array) ? id.map((idVal) => qs.escape(idVal)).join(',') : qs.escape(id)}`,
		params: options.params,
		authContext: options.authContext
	});
};
