import qs from 'querystring';
import { PlexAuthContext } from '../plex/types';
import * as plexServerAPI from '../plex/api';

export const BASE_URL = 'https://discover.provider.plex.tv';

export const plexDiscoverFetch = async <TResult>(options: {
	method?: 'GET' | 'POST' | 'PUT' | 'DELETE',
	endpoint: string,
	params?: {[key: string]: any} | null,
	headers?: {[key: string]: string},
	authContext?: PlexAuthContext | null
}): Promise<TResult> => {
	return await plexServerAPI.fetch({
		...options,
		serverURL: BASE_URL
	});
};
