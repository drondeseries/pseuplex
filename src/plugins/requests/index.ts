
import qs from 'querystring';
import express from 'express';
import * as plexTypes from '../../plex/types';
import * as plexServerAPI from '../../plex/api';
import { parsePlexMetadataGuid } from '../../plex/metadataidentifier';
import {
	IncomingPlexAPIRequest,
	plexAPIRequestHandler
} from '../../plex/requesthandling';
import { PlexServerAccountInfo } from '../../plex/accounts';
import * as plexDiscoverAPI from '../../plexdiscover';
import {
	PseuplexApp,
	PseuplexConfigBase,
	PseuplexPlugin,
	PseuplexPluginClass,
	PseuplexReadOnlyResponseFilters,
	stringifyMetadataID
} from '../../pseuplex';
import {
	RequestInfo,
	RequestsProvider
} from './provider';
import { OverseerrRequestsProvider } from './providers/overseerr';
import {
	stringParam,
	intParam,
	intArrayParam,
	pushToArray,
	isNullOrEmpty,
	httpError,
	WithOptionalProps,
	WithOptionalPropsRecursive,
	HttpError,
	findInArrayOrSingle,
	forArrayOrSingle,
	firstOrSingle
} from '../../utils';

const urlChildrenSuffix = '/children';

type RequestsFlags = {
	requestsEnabled?: boolean;
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

export default (class RequestsPlugin implements PseuplexPlugin {
	static slug = 'requests';
	readonly slug = RequestsPlugin.slug;
	readonly app: PseuplexApp;
	readonly requestProviders: {
		[providerSlug: string]: RequestsProvider
	} = {};


	constructor(app: PseuplexApp) {
		this.app = app;

		const requestProviders = [
			new OverseerrRequestsProvider(app)
		];
		for(const provider of requestProviders) {
			this.requestProviders[provider.slug] = provider;
		}
	}

	get config(): RequestsPluginConfig {
		return this.app.config as RequestsPluginConfig;
	}

	responseFilters?: PseuplexReadOnlyResponseFilters = {
		findGuidInLibrary: async (resData, context) => {
			const plexAuthContext = context.userReq.plex.authContext;
			const plexUserInfo = context.userReq.plex.userInfo;
			// check if requests are enabled
			const requestsEnabled = this.config.perUser[plexUserInfo.email]?.requestsEnabled ?? this.config.requestsEnabled;
			if(!requestsEnabled) {
				return;
			}
			// wait for all previous filters
			await Promise.all(context.previousFilterPromises ?? []);
			// only show request option if no items were found
			if(!isNullOrEmpty(resData.MediaContainer.Metadata)) {
				return;
			}
			// get request provider
			const provider = await this._getRequestsProviderForPlexUser(plexAuthContext['X-Plex-Token'], plexUserInfo);
			if(!provider) {
				return;
			}
			// parse params
			const mediaType = intParam(context.userReq.query['type']);
			let guid = stringParam(context.userReq.query['guid']);
			let season: number | undefined = undefined;
			if(!guid) {
				guid = stringParam(context.userReq.query['show.guid']);
				if(!guid) {
					return;
				}
				season = intParam(context.userReq.query['season.index']);
			}
			// determine properties
			let requestActionTitle: string;
			let librarySectionID: string | number;
			switch(mediaType) {
				case plexTypes.PlexMediaItemTypeNumeric.Movie:
					requestActionTitle = "Request Movie";
					librarySectionID = this.config.plex.requestedMoviesLibraryId;
					break;
				case plexTypes.PlexMediaItemTypeNumeric.Show:
					requestActionTitle = "Request Show";
					librarySectionID = this.config.plex.requestedTVShowsLibraryId;
					break;
				case plexTypes.PlexMediaItemTypeNumeric.Season:
					requestActionTitle = "Request Season";
					librarySectionID = this.config.plex.requestedTVShowsLibraryId;
					break;
				case plexTypes.PlexMediaItemTypeNumeric.Episode:
					requestActionTitle = "Request Episode";
					librarySectionID = this.config.plex.requestedTVShowsLibraryId;
					break;
				default:
					// can't request type
					return;
			}
			// create hook metadata
			const metadataItem: WithOptionalPropsRecursive<plexTypes.PlexMetadataItem> = {
				guid: guid,
				key: `/${this.app.slug}/${this.slug}/${provider.slug}/request/${qs.escape(guid)}`
					+ (season != null ? `/season/${season}` : ''),
				ratingKey: stringifyMetadataID({ // TODO include providerSlug and season in this key somehow
					source: this.slug, // TODO metadata provider
					directory: mediaType != null ? `${mediaType}` : undefined,
					id: guid
				}),
				librarySectionTitle: requestActionTitle,
				librarySectionID,
				librarySectionKey: `/library/sections/${librarySectionID}`,
				Media: [{
					videoResolution: requestActionTitle
				}]
			};
			resData.MediaContainer.Metadata = pushToArray(resData.MediaContainer.Metadata, metadataItem as plexTypes.PlexMetadataItem);
			resData.MediaContainer.size += 1;
		}
	}

	defineRoutes(router: express.Express) {
		// handle different types of item requests
		for(const endpoint of [
			`/${this.app.slug}/${this.slug}/:providerSlug/request/:guid`,
			`/${this.app.slug}/${this.slug}/:providerSlug/request/:guid/children`,
			`/${this.app.slug}/${this.slug}/:providerSlug/request/:guid/season/:season`,
			`/${this.app.slug}/${this.slug}/:providerSlug/request/:guid/season/:season/children`
		]) {
			const children = endpoint.endsWith(urlChildrenSuffix);

			// get metadata for requested item
			router.get(endpoint, [
				this.app.middlewares.plexAuthentication,
				plexAPIRequestHandler(async (req: IncomingPlexAPIRequest, res) => {
					// get request properties
					const { providerSlug, guid } = req.params;
					const season = intParam(req.params.season);
					const plexUserInfo = req.plex.userInfo;
					const plexAuthContext = req.plex.authContext;
					const plexParams = req.plex.requestParams;
					const plexServerURL = this.app.plexServerURL;
					// find requests provider
					const reqProvider = this.requestProviders[providerSlug];
					if(!reqProvider) {
						throw httpError(400, `No requests provider with ID ${providerSlug}`);
					}
					// ensure user is allowed to make requests to this request provider
					if(!(await reqProvider.canPlexUserMakeRequests(plexAuthContext['X-Plex-Token'], plexUserInfo))) {
						throw httpError(401, `User is not allowed to make ${providerSlug} requests`);
					}
					// parse guid
					const plexGuidParts = parsePlexMetadataGuid(guid);
					if(plexGuidParts.protocol != 'plex') {
						throw httpError(400, "Invalid plex guid");
					}
					let numericMediaType = plexTypes.PlexMediaItemTypeToNumeric[plexGuidParts.type];
					if(numericMediaType == null) {
						throw httpError(400, `Unknown media type ${plexGuidParts.type}`);
					}
					// check if item already exists on the plex server
					const libraryMetadataPage = await plexServerAPI.findLibraryMetadata((
						(numericMediaType == plexTypes.PlexMediaItemTypeNumeric.Show && season != null) ? {
							type: plexTypes.PlexMediaItemTypeNumeric.Season,
							'show.guid': guid,
							'season.index': season
						}
						: {
							type: numericMediaType,
							guid: guid
						}
					), {
						serverURL: plexServerURL,
						authContext: plexAuthContext
					});
					const libraryMetadataItem = firstOrSingle(libraryMetadataPage.MediaContainer.Metadata);
					if(libraryMetadataItem) {
						// item already exists on the plex server, so just redirect to the plex server metadata
						let itemKey = libraryMetadataItem.key;
						if(itemKey.endsWith(urlChildrenSuffix)) {
							if(!children) {
								itemKey = itemKey.substring(0, itemKey.length-urlChildrenSuffix.length);
							}
						} else {
							if(children) {
								itemKey += urlChildrenSuffix;
							}
						}
						const plexDisplayedPage: plexTypes.PlexMetadataPage = await plexServerAPI.fetch({
							serverURL: plexServerURL,
							authContext: plexAuthContext,
							method: 'GET',
							endpoint: itemKey,
							params: plexParams
						});
						// transform metadata item key if not getting children
						if(!children) { // TODO also transform to show requestable seasons if missing any
							forArrayOrSingle(plexDisplayedPage.MediaContainer.Metadata, (metadataItem) => {
								this._transformMetadataItemKeyToRequestKey(providerSlug, metadataItem);
							});
						}
						// TODO add requestable seasons
						return plexDisplayedPage;
					}
					// since item is not on server, get from plex discover
					// get the plex discover ID of the metadata
					let itemId: string;
					let itemType: plexTypes.PlexMediaItemType | string;
					if(season != null && plexGuidParts.type == plexTypes.PlexMediaItemType.TVShow) {
						// get guid for season
						const showChildrenPage = await plexDiscoverAPI.getLibraryMetadata(plexGuidParts.id, {
							authContext: plexAuthContext,
							children: true
						});
						const seasonItem = findInArrayOrSingle(showChildrenPage.MediaContainer.Metadata, (item) => {
							return item.index == season
						});
						if(!seasonItem) {
							throw httpError(404, `Invalid season ${season}`);
						}
						const seasonGuidParts = parsePlexMetadataGuid(seasonItem.guid);
						if(seasonGuidParts.protocol != 'plex') {
							throw httpError(500, "Invalid plex guid for season");
						} else if(seasonGuidParts.type != plexTypes.PlexMediaItemType.Season) {
							throw httpError(500, `Unexpected plex guid type ${seasonGuidParts.type} for season`);
						}
						itemId = seasonGuidParts.id;
						itemType = seasonGuidParts.type;
					} else {
						itemId = plexGuidParts.id;
						itemType = plexGuidParts.type;
					}
					// fetch item (and maybe children) from plex discover
					const resDataPromise = plexDiscoverAPI.getLibraryMetadata(itemId, {
						authContext: plexAuthContext,
						params: plexParams,
						children: children
					});
					const requestedPlexItemPage = (children || itemId != plexGuidParts.id) ?
						await plexDiscoverAPI.getLibraryMetadata(plexGuidParts.id, {
							authContext: plexAuthContext
						})
						: await resDataPromise;
					const resData = await resDataPromise;
					// send request if needed
					let reqInfo: RequestInfo | undefined = undefined;
					if(itemType != plexTypes.PlexMediaItemType.TVShow && !children) {
						// send media request
						const requestedPlexItem = firstOrSingle(requestedPlexItemPage.MediaContainer.Metadata);
						if(requestedPlexItem) {
							reqInfo = await reqProvider.requestPlexItem(requestedPlexItem, {
								plexServerURL: this.app.plexServerURL,
								plexUserInfo,
								plexAuthContext,
								seasons: season != null ? [season] : undefined
							});
							// TODO add request state to the output metadata somehow
						}
					}
					// update response content
					if(children) {
						if(itemType == plexTypes.PlexMediaItemType.Season) {
							// don't show individual episodes for a requested season
							resData.MediaContainer.Metadata = [];
							resData.MediaContainer.size = 0;
							resData.MediaContainer.totalSize = 0;
						} else if(itemType == plexTypes.PlexMediaItemType.TVShow) {
							// make seasons requestable
							// TODO transform seasons to look a little more "requestable"
							forArrayOrSingle(resData.MediaContainer.Metadata, (metadataItem) => {
								this._transformMetadataItemKeyToRequestKey(providerSlug, metadataItem);
							});
						}
					} else {
						// update metadata item for page
						forArrayOrSingle(resData.MediaContainer.Metadata, (metadataItem) => {
							if(itemType == plexTypes.PlexMediaItemType.TVShow) {
								metadataItem.title = `Request • ${metadataItem.title}`;
							} else {
								metadataItem.title = `${metadataItem.title} • Requesting...`
							}
							this._transformMetadataItemKeyToRequestKey(providerSlug, metadataItem);
						});
					}
					return resData;
				})
			]);

			if(!children) {
				// TODO handle related items request
			}
		}
	}

	async _getRequestsProviderForPlexUser(token: string, userInfo: PlexServerAccountInfo): Promise<RequestsProvider | null> {
		for(const slug in this.requestProviders) {
			const provider = this.requestProviders[slug];
			if(provider.isConfigured && await provider.canPlexUserMakeRequests(token, userInfo)) {
				return provider;
			}
		}
		return null;
	}

	_transformMetadataItemKeyToRequestKey(providerSlug: string, metadataItem: plexTypes.PlexMetadataItem, opts?: {children?: boolean}) {
		let itemGuid = metadataItem.guid;
		let season: number = undefined;
		if(metadataItem.type == plexTypes.PlexMediaItemType.Season) {
			itemGuid = metadataItem.parentGuid;
			season = metadataItem.index;
		}
		const children = opts?.children ?? metadataItem.key.endsWith(urlChildrenSuffix);
		metadataItem.key = `/${this.app.slug}/${this.slug}/${providerSlug}/request/${qs.escape(itemGuid)}`
			+ (season != null ? `/season/${season}` : '')
			+ (children ? urlChildrenSuffix : '');
	}

} as PseuplexPluginClass);
