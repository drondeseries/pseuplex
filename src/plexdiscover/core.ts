import qs from 'querystring';
import { PlexAuthContext } from '../plex/types';
import * as plexServerAPI from '../plex/api';

export const BASE_URL = 'https://discover.provider.plex.tv';

export const plexDiscoverFetch = async <TResult>(options: {
	method?: 'GET' | 'POST' | 'PUT' | 'DELETE',
	endpoint: string,
	params?: {[key: string]: any} | null,
	authContext?: PlexAuthContext | null
}): Promise<TResult> => {
	return await plexServerAPI.fetch({
		serverURL: BASE_URL,
		method: options.method,
		endpoint: options.endpoint,
		params: options.params,
		authContext: options.authContext
	});
};
