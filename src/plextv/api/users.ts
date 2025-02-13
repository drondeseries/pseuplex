import { PlexAuthContext } from '../../plex/types';
import { plexTVFetch } from './core';
import { PlexTVCurrentUserInfo } from '../types/User';

export const getCurrentUser = async (options: {
	authContext: PlexAuthContext
}): Promise<PlexTVCurrentUserInfo> => {
	return await plexTVFetch<PlexTVCurrentUserInfo>({
		method: 'GET',
		endpoint: `api/v2/user`,
		headers: {
			'Accept': 'application/json'
		},
		authContext: options.authContext
	});
};
