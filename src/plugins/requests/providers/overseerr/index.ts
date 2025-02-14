
import * as plexTypes from '../../../../plex/types';
import { PlexServerAccountInfo } from '../../../../plex/accounts';
import { parsePlexMetadataGuid } from '../../../../plex/metadataidentifier';
import * as plexDiscoverAPI from '../../../../plexdiscover';
import {
	PseuplexApp,
	PseuplexConfigBase
} from '../../../../pseuplex';
import {
	PlexMediaRequestOptions,
	RequestInfo,
	RequestsProvider
} from '../../provider';
import * as overseerrAPI from './api';
import { firstOrSingle, httpError } from '../../../../utils';

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
	
	overseerrUsersMinLifetime: number = 60;
	
	_overseerrUsers: overseerrAPI.User[] | undefined = undefined;
	_plexTokensToOverseerrUsersMap: {[token: string]: overseerrAPI.User} = {};
	_overseerrUsersTask: Promise<void> | null = null;
	_lastOverseerrUsersFetchTime: number | null = null;
	
	constructor(app: PseuplexApp) {
		this.app = app;
	}
	
	get config(): OverseerrRequestsPluginConfig {
		return this.app.config as OverseerrRequestsPluginConfig;
	}
	
	get isConfigured(): boolean {
		const cfg = this.config?.overseerr;
		if (cfg && cfg.host && cfg.apiKey) {
			return true;
		}
		return false;
	}

	get canRequestEpisodes(): boolean {
		return false;
	}

	async _refetchOverseerrUsersIfAble(): Promise<boolean> {
		// wait for existing fetch operation, if any
		if(this._overseerrUsersTask) {
			await this._overseerrUsersTask;
			return true;
		}
		// check if enough time has passed that we can refetch
		if(this._lastOverseerrUsersFetchTime != null && (process.uptime() - this._lastOverseerrUsersFetchTime) < this.overseerrUsersMinLifetime) {
			return false;
		}
		try {
			const cfg = this.config.overseerr;
			// fetch overseer users
			const task = overseerrAPI.getUsers({
				serverURL: cfg.host,
				apiKey: cfg.apiKey,
				params: {
					take: 1000
				}
			}).then((usersPage) => {
				this._overseerrUsers = usersPage.results;
				this._plexTokensToOverseerrUsersMap = {};
				this._lastOverseerrUsersFetchTime = process.uptime();
			});
			// store pending task and wait
			this._overseerrUsersTask = task;
			await task;
			return true;
		} finally {
			// delete pending task
			this._overseerrUsersTask = null;
		}
	}

	_findOverseerrUserFromPlexUser(token: string, userInfo: PlexServerAccountInfo): (overseerrAPI.User | null) {
		let overseerrUser = this._plexTokensToOverseerrUsersMap[token];
		if(overseerrUser) {
			return overseerrUser;
		}
		overseerrUser = this._overseerrUsers?.find((osrUser) => {
			return (osrUser.plexId != null && osrUser.plexId == userInfo.plexUserID)
				|| (osrUser.plexUsername && osrUser.plexUsername == userInfo.plexUsername);
		});
		if(overseerrUser) {
			this._plexTokensToOverseerrUsersMap[token] = overseerrUser;
			return overseerrUser;
		}
		return null;
	}

	async _getOverseerrUserFromPlexUser(token: string, userInfo: PlexServerAccountInfo): Promise<overseerrAPI.User | null> {
		let overseerrUser = this._findOverseerrUserFromPlexUser(token, userInfo);
		if(overseerrUser) {
			return overseerrUser;
		}
		if(await this._refetchOverseerrUsersIfAble()) {
			return this._findOverseerrUserFromPlexUser(token, userInfo);
		}
		return null;
	}

	async canPlexUserMakeRequests(token: string, userInfo: PlexServerAccountInfo): Promise<boolean> {
		const overseerrUser = await this._getOverseerrUserFromPlexUser(token, userInfo);
		if(overseerrUser) {
			return true;
		}
		return false;
	}
	
	async requestPlexItem(plexItem: plexTypes.PlexMetadataItem, options: PlexMediaRequestOptions): Promise<RequestInfo> {
		// get overseerr user info
		const overseerrUser = await this._getOverseerrUserFromPlexUser(options.plexAuthContext['X-Plex-Token'], options.plexUserInfo);
		if(!overseerrUser) {
			throw httpError(401, `User is not allowed to request media from ${this.slug}`);
		}
		// get plex item info
		let guidPrefix: string = 'tmdb://';
		let mediaIdKey: ('tvdbId' | 'mediaId') = 'mediaId';
		let type: overseerrAPI.MediaType;
		switch(plexItem.type) {
			case plexTypes.PlexMediaItemType.Movie:
				type = overseerrAPI.MediaType.Movie;
				//guidPrefix = 'tmdb://';
				//mediaIdKey = 'mediaId';
				break;

			case plexTypes.PlexMediaItemType.Episode:
				// get season to request instead
				type = overseerrAPI.MediaType.TV;
				//guidPrefix = 'tvdb://';
				//mediaIdKey = 'tvdbId';
				if(plexItem.parentIndex == null) {
					throw httpError(500, `Unable to request season for episode`);
				}
				if(!plexItem.grandparentGuid) {
					throw httpError(500, `Unable to determine show for episode`);
				}
				const grandparentGuidParts = parsePlexMetadataGuid(plexItem.grandparentGuid);
				options.seasons = [plexItem.parentIndex];
				plexItem = firstOrSingle((await plexDiscoverAPI.getLibraryMetadata(grandparentGuidParts.id, {
					authContext: options.plexAuthContext
				})).MediaContainer.Metadata);
				if(!plexItem) {
					throw httpError(500, `Unable to fetch show for episode`);
				}
				break;

			case plexTypes.PlexMediaItemType.Season:
				// get show for season to request
				type = overseerrAPI.MediaType.TV;
				//guidPrefix = 'tvdb://';
				//mediaIdKey = 'tvdbId';
				if(plexItem.index == null) {
					throw httpError(500, `Unable to determine season index`);
				}
				if(!plexItem.parentGuid) {
					throw httpError(500, `Unable to determine show for season`);
				}
				const parentGuidParts = parsePlexMetadataGuid(plexItem.parentGuid);
				options.seasons = [plexItem.index];
				plexItem = firstOrSingle((await plexDiscoverAPI.getLibraryMetadata(parentGuidParts.id, {
					authContext: options.plexAuthContext
				})).MediaContainer.Metadata);
				if(!plexItem) {
					throw httpError(500, `Unable to fetch show for season`);
				}
				break;
				
			case plexTypes.PlexMediaItemType.TVShow:
				type = overseerrAPI.MediaType.TV;
				//guidPrefix = 'tvdb://';
				//mediaIdKey = 'tvdbId';
				break;

			default:
				throw new Error(`Unsupported media type ${type}`);
		}
		// find matching media id
		const matchedGuid = plexItem.Guid?.find((guid) => guid.id?.startsWith(guidPrefix))?.id;
		if(!matchedGuid) {
			throw new Error(`Could not find ID to request`);
		}
		const mediaId = Number.parseInt(matchedGuid.substring(guidPrefix.length));
		if(Number.isNaN(mediaId)) {
			throw new Error(`Failed to parse matched guid ${matchedGuid}`);
		}
		//console.log(`Parsed ${matchedGuid} to ${matchedId}`);
		// send request to overseerr
		const cfg = this.config.overseerr;
		const resData = await overseerrAPI.request({
			serverURL: cfg.host,
			apiKey: cfg.apiKey,
			params: {
				mediaType: type,
				[mediaIdKey]: mediaId,
				userId: overseerrUser.id,
				seasons: options?.seasons
			}
		});
		return {
			requestId: resData.id
		};
	}
}
