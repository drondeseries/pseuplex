import * as plexTypes from '../plex/types';
import { booleanQueryParam } from '../plex/api/serialization';
import { plexDiscoverFetch } from './core';

export const search = async (options: {
	params: plexTypes.PlexTVSearchParams,
	authContext?: plexTypes.PlexAuthContext | null
}): Promise<plexTypes.PlexTVSearchResultsPage> => {
	// send request
	return await plexDiscoverFetch<plexTypes.PlexTVSearchResultsPage>({
		method: 'GET',
		endpoint: 'library/search',
		params: options.params,
		authContext: options.authContext
	});
};
