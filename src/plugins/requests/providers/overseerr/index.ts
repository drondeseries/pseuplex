
import * as plexTypes from '../../../../plex/types';
import {
	PseuplexApp,
	PseuplexConfigBase
} from '../../../../pseuplex';
import {
	RequestInfo,
	RequestsProvider
} from '../../provider';
import * as overseerrAPI from './api';

type OverseerPerUserPluginConfig = {
	//
};
export type OverseerrRequestsPluginConfig = PseuplexConfigBase<OverseerPerUserPluginConfig> & {
	overseerr: {
		host: string;
		apiKey: string;
	}
};

export class OverseerrRequestsProvider implements RequestsProvider {
	readonly slug = 'overseerr';
	readonly app: PseuplexApp;
	
	constructor(app: PseuplexApp) {
		this.app = app;
	}
	
	get config(): OverseerrRequestsPluginConfig {
		return this.app.config as OverseerrRequestsPluginConfig;
	}
	
	get isConfigured(): boolean {
		const cfg = this.config;
		if (cfg.overseerr && cfg.overseerr.host && cfg.overseerr.apiKey) {
			return true;
		}
		return false;
	}
	
	async requestPlexItem(plexItem: plexTypes.PlexMetadataItem, options?: {seasons?: number[]}): Promise<RequestInfo> {
		let guidPrefix: string = 'tmdb://';
		let idKey: ('tvdbId' | 'mediaId') = 'mediaId';
		let type: overseerrAPI.MediaType;
		switch(plexItem.type) {
			case plexTypes.PlexMediaItemType.Movie:
				type = overseerrAPI.MediaType.Movie;
				//guidPrefix = 'tmdb://';
				//idKey = 'mediaId';
				break;

			case plexTypes.PlexMediaItemType.Episode:
				// TODO request season instead
			case plexTypes.PlexMediaItemType.Season:
				// TODO get show metadata and set seasons
			case plexTypes.PlexMediaItemType.TVShow:
				type = overseerrAPI.MediaType.TV;
				//guidPrefix = 'tvdb://';
				//idKey = 'tvdbId';
				break;

			default:
				throw new Error(`Unsupported media type ${type}`);
		}
		const matchedGuid = plexItem.Guid?.find((guid) => guid.id?.startsWith(guidPrefix))?.id;
		if(!matchedGuid) {
			throw new Error(`Could not find ID to request`);
		}
		const matchedId = Number.parseInt(matchedGuid.substring(guidPrefix.length));
		if(Number.isNaN(matchedId)) {
			throw new Error(`Failed to parse matched id ${matchedGuid}`);
		}
		//console.log(`Parsed ${matchedGuid} to ${matchedId}`);
		const resData = await overseerrAPI.request({
			serverURL: this.config.overseerr.host,
			apiKey: this.config.overseerr.apiKey,
			params: {
				mediaType: type,
				[idKey]: matchedId,
				seasons: options?.seasons
			}
		});
		return {
			requestId: resData.id
		};
	}
}
