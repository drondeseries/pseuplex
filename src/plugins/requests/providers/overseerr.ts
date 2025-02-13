
import * as plexTypes from '../../../plex/types';
import {
	PseuplexApp,
	PseuplexConfigBase
} from '../../../pseuplex';
import {
	RequestInfo,
	RequestsProvider
} from '../provider';
import { httpError } from '../../../utils';

type OverseerPerUserPluginConfig = {
	//
};
export type OverseerrRequestsPluginConfig = PseuplexConfigBase<OverseerPerUserPluginConfig> & {
	overseerr: {
		serverURL: string;
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
		if (cfg.overseerr && cfg.overseerr.serverURL && cfg.overseerr.apiKey) {
			return true;
		}
		return false;
	}
	
	async requestPlexItem(plexItem: plexTypes.PlexMetadataItem, options?: {seasons?: number[]}): Promise<RequestInfo> {
		let guidPrefix: string = 'tmdb://';
		let idKey: ('tvdbId' | 'mediaId') = 'mediaId';
		let type: OverseerrMediaType;
		switch(plexItem.type) {
			case plexTypes.PlexMediaItemType.Movie:
				type = OverseerrMediaType.Movie;
				//guidPrefix = 'tmdb://';
				//idKey = 'mediaId';
				break;

			case plexTypes.PlexMediaItemType.TVShow:
			case plexTypes.PlexMediaItemType.Season:
			case plexTypes.PlexMediaItemType.Episode:
				type = OverseerrMediaType.TV;
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
		console.log(`Parsed ${matchedGuid} to ${matchedId}`);
		const res = await fetch(`${this.config.overseerr.serverURL}/api/v1/request`, {
			method: 'POST',
			headers: {
				'X-Api-Key': this.config.overseerr.apiKey,
				'Content-Type': 'application/json'
			},
			body: JSON.stringify({
				mediaType: type,
				[idKey]: matchedId,
				seasons: options?.seasons
			} as OverseerrRequestModel)
		});
		if(!res.ok) {
			res.body?.cancel();
			throw httpError(res.status, res.statusText);
		}
		const body = await res.text();
		const resData = JSON.parse(body);
		return {
			requestId: resData.id
		};
	}
}

enum OverseerrMediaType {
	Movie = 'movie',
	TV = 'tv'
}

type OverseerrRequestModel = {
	mediaType: OverseerrMediaType;
	mediaId?: number;
	tvdbId?: number;
	seasons?: number[];
	is4k?: boolean;
	serverId?: number;
	profileId?: number;
	rootFolder?: string;
	languageProfileId?: number;
	userId?: number;
}
