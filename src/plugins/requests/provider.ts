
import * as plexTypes from '../../plex/types';
import { PlexServerAccountInfo } from '../../plex/accounts';

export type RequestInfo = {
	requestId: string | number;
};

export type PlexMediaRequestOptions = {
	seasons?: number[];
	plexServerURL: string;
	plexUserInfo: PlexServerAccountInfo;
	plexAuthContext: plexTypes.PlexAuthContext;
};

export interface RequestsProvider {
	readonly slug: string;
	readonly isConfigured: boolean;
	readonly canRequestEpisodes: boolean;
	canPlexUserMakeRequests: (token: string, userInfo: PlexServerAccountInfo) => Promise<boolean>;
	requestPlexItem?: (plexItem: plexTypes.PlexMetadataItem, options: PlexMediaRequestOptions) => Promise<RequestInfo>;
}

export type RequestsProviders = {
	[providerSlug: string]: RequestsProvider
};
