
import * as plexTypes from '../../plex/types';

export type RequestInfo = {
	requestId: string;
}

export interface RequestsProvider {
	readonly slug: string;
	readonly isConfigured: boolean;
	requestPlexItem?: (plexItem: plexTypes.PlexMetadataItem, options?: {
		seasons?: number[];
		plexMoviesLibraryId?: string | number;
		plexTVShowsLibraryId?: string | number;
		plexServerURL?: string;
		plexAuthToken?: plexTypes.PlexAuthContext;
	}) => Promise<RequestInfo>;
}
