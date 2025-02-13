import qs from 'querystring';
import {
	PlexAuthContext,
	PlexMetadataPage,
	PlexMetadataPageParams
} from '../plex/types';
import { plexDiscoverFetch } from './core';

export const getLibraryMetadata = async (id: string | string[], options: {
	params?: PlexMetadataPageParams,
	children?: boolean,
	authContext?: PlexAuthContext | null
}): Promise<PlexMetadataPage> => {
	const ids = (id instanceof Array) ? id.map((idVal) => qs.escape(idVal)).join(',') : qs.escape(id);
	return await plexDiscoverFetch<PlexMetadataPage>({
		method: 'GET',
		endpoint: `library/metadata/${ids}` + (options.children ? '/children' : ''),
		params: options.params,
		authContext: options.authContext
	});
};
