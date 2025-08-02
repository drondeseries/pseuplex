import { PseuplexConfigBase } from '../../pseuplex/configbase';

type RequestsFlags = {
	requests?: {
		enabled?: boolean;
		requestableSeasons?: boolean;
	},
};
type RequestsPerUserPluginConfig = {
	//
} & RequestsFlags;
export type RequestsPluginConfig = PseuplexConfigBase<RequestsPerUserPluginConfig> & RequestsFlags & {
	plex: {
		requestedMoviesLibraryId?: string | number;
		requestedTVShowsLibraryId?: string | number;
	}
};
