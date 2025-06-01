import { PlexAuthContext } from '../types';
import { PlexMyPlexAccountPage } from '../types/MyPlex';
import { PlexAPIRequestOptions, plexServerFetch } from './core';

export const getMyPlexAccount = async (options: PlexAPIRequestOptions): Promise<PlexMyPlexAccountPage> => {
	return await plexServerFetch<PlexMyPlexAccountPage>({
		...options,
		method: 'GET',
		endpoint: 'myplex/account',
	});
};
