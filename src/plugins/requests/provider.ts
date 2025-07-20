
import * as plexTypes from '../../plex/types';
import { PlexServerAccountInfo } from '../../plex/accounts';
import { PseuplexRequestContext } from '../../pseuplex';
import { RequestInfo } from './types';

export type PlexMediaRequestOptions = {
	seasons?: number[];
	context: PseuplexRequestContext;
};

export interface RequestsProvider {
	readonly slug: string;
	readonly isConfigured: boolean;
	readonly canRequestEpisodes: boolean;
	canPlexUserMakeRequests: (token: string, userInfo: PlexServerAccountInfo) => Promise<boolean>;
	requestPlexItem: (plexItem: plexTypes.PlexMetadataItem, options: PlexMediaRequestOptions) => Promise<RequestInfo>;
}

export type RequestsProviders = {
	[providerSlug: string]: RequestsProvider
};
