
import express from 'express';
import * as plexTypes from '../../plex/types';
import * as plexServerAPI from '../../plex/api';
import { parsePlexMetadataGuid } from '../../plex/metadataidentifier';
import {
	IncomingPlexAPIRequest,
} from '../../plex/requesthandling';
import { PlexServerAccountInfo } from '../../plex/accounts';
import {
	PseuplexApp,
	PseuplexConfigBase,
	PseuplexPlugin,
	PseuplexPluginClass,
	PseuplexReadOnlyResponseFilters
} from '../../pseuplex';
import {
	RequestInfo,
	RequestsProvider
} from './provider';
import { OverseerrRequestsProvider } from './providers/overseerr';
import {
	stringParam,
	intParam,
	pushToArray,
	isNullOrEmpty,
	httpError,
	findInArrayOrSingle,
	forArrayOrSingle,
	firstOrSingle,
	transformArrayOrSingle
} from '../../utils';
import * as reqsTransform from './transform';

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

	get basePath(): string {
		return `/${this.app.slug}/${this.slug}`;
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
			const requestProvider = await this._getRequestsProviderForPlexUser(plexAuthContext['X-Plex-Token'], plexUserInfo);
			if(!requestProvider) {
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
			// create hook metadata
			const metadataItem = await reqsTransform.createRequestButtonMetadataItem({
				pluginBasePath: this.basePath,
				mediaType,
				guid,
				season,
				requestProvider,
				plexMetadataClient: this.app.plexMetadataClient,
				authContext: plexAuthContext,
				moviesLibraryId: this.config.plex.requestedMoviesLibraryId,
				tvShowsLibraryId: this.config.plex.requestedTVShowsLibraryId,
			});
			if(!metadataItem) {
				return;
			}
			resData.MediaContainer.Metadata = pushToArray(resData.MediaContainer.Metadata, metadataItem);
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
			const children = endpoint.endsWith(reqsTransform.ChildrenRelativePath);

			// get metadata for requested item
			router.get(endpoint, [
				this.app.middlewares.plexAuthentication,
				this.app.middlewares.plexRequestHandler(async (req: IncomingPlexAPIRequest, res) => {
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
					} else if(!reqProvider.isConfigured) {
						throw httpError(418, `Requests provider with ID ${providerSlug} is not configured`);
					}
					// ensure user is allowed to make requests to this request provider
					if(!(await reqProvider.canPlexUserMakeRequests(plexAuthContext['X-Plex-Token'], plexUserInfo))) {
						throw httpError(401, `User is not allowed to make ${reqProvider.slug} requests`);
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
					const transformOpts: reqsTransform.TransformMetadataOptions = {
						pluginBasePath: this.basePath,
						requestProviderSlug: reqProvider.slug
					};
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
						if(itemKey.endsWith(reqsTransform.ChildrenRelativePath)) {
							if(!children) {
								itemKey = itemKey.substring(0, (itemKey.length - reqsTransform.ChildrenRelativePath.length));
							}
						} else {
							if(children) {
								itemKey += reqsTransform.ChildrenRelativePath;
							}
						}
						const plexDisplayedPage: plexTypes.PlexMetadataPage = await plexServerAPI.fetch({
							serverURL: plexServerURL,
							authContext: plexAuthContext,
							method: 'GET',
							endpoint: itemKey,
							params: plexParams
						});
						// transform response
						if(children) {
							// transform to show requestable seasons if missing any
							const plexGuidParts = parsePlexMetadataGuid(libraryMetadataItem.guid);
							const discoverMetadataPage = await this.app.plexMetadataClient.getMetadataChildren(plexGuidParts.id, plexParams, {
								authContext: plexAuthContext
							});
							plexDisplayedPage.MediaContainer.Metadata = transformArrayOrSingle(discoverMetadataPage.MediaContainer.Metadata, (metadataItem) => {
								const matchingItem = metadataItem.guid ?
									findInArrayOrSingle(plexDisplayedPage.MediaContainer.Metadata, (cmpMetadataItem) => {
										return (cmpMetadataItem.guid == metadataItem.guid);
									})
									: undefined;
								if(matchingItem) {
									return matchingItem;
								}
								reqsTransform.transformRequestableSeasonMetadata(metadataItem, transformOpts);
								return metadataItem;
							});
						} else {
							// transform metadata item key since not getting children
							forArrayOrSingle(plexDisplayedPage.MediaContainer.Metadata, (metadataItem) => {
								reqsTransform.setMetadataItemKeyToRequestKey(metadataItem, transformOpts);
							});
						}
						return plexDisplayedPage;
					}
					// get the plex discover ID of the metadata
					let itemId: string;
					let itemType: plexTypes.PlexMediaItemType | string;
					if(season != null && plexGuidParts.type == plexTypes.PlexMediaItemType.TVShow) {
						// get guid for season
						const showChildrenPage = await this.app.plexMetadataClient.getMetadataChildren(plexGuidParts.id, undefined, {
							authContext: plexAuthContext
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
					const resDataPromise = children ?
						this.app.plexMetadataClient.getMetadataChildren(itemId, plexParams)
						: this.app.plexMetadataClient.getMetadata(itemId, plexParams);
					const requestedPlexItemPage = (children || itemId != plexGuidParts.id) ?
						await this.app.plexMetadataClient.getMetadata(plexGuidParts.id)
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
							forArrayOrSingle(resData.MediaContainer.Metadata, (metadataItem) => {
								reqsTransform.transformRequestableSeasonMetadata(metadataItem, transformOpts);
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
							reqsTransform.setMetadataItemKeyToRequestKey(metadataItem, transformOpts);
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
			try {
				if(provider.isConfigured && await provider.canPlexUserMakeRequests(token, userInfo)) {
					return provider;
				}
			} catch(error) {
				console.error(error);
			}
		}
		return null;
	}

} as PseuplexPluginClass);
