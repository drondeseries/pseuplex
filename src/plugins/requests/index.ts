
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
	PseuplexMetadataProvider,
	PseuplexMetadataSource,
	PseuplexPlugin,
	PseuplexPluginClass,
	PseuplexReadOnlyResponseFilters
} from '../../pseuplex';
import * as extPlexTransform from '../../pseuplex/externalplex/transform';
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
import {
	RequestInfo,
	RequestsProvider,
	RequestsProviders,
} from './provider';
import { OverseerrRequestsProvider } from './providers/overseerr';
import { PlexRequestsHandler } from './handler';
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
	readonly requestProviders: RequestsProviders = {};
	readonly requestsHandler: PlexRequestsHandler;

	constructor(app: PseuplexApp) {
		this.app = app;
		const requestProviders = [
			new OverseerrRequestsProvider(app)
		];
		for(const provider of requestProviders) {
			this.requestProviders[provider.slug] = provider;
		}
		this.requestsHandler = new PlexRequestsHandler({
			basePath: `/${this.app.slug}/${PseuplexMetadataSource.Request}`,
			requestProviders: this.requestProviders,
			plexMetadataClient: this.app.plexMetadataClient
		});
	}

	get basePath(): string {
		return `/${this.app.slug}/${this.slug}`;
	}

	get metadataProviders(): PseuplexMetadataProvider[] {
		return [this.requestsHandler];
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
			const metadataItem = await this.requestsHandler.createRequestButtonMetadata({
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
		// handle different paths for a plex request
		for(const endpoint of [
			`${this.requestsHandler.basePath}/:providerSlug/:mediaType/:plexId`,
			`${this.requestsHandler.basePath}/:providerSlug/:mediaType/:plexId/children`,
			`${this.requestsHandler.basePath}/:providerSlug/:mediaType/:plexId/season/:season`,
			`${this.requestsHandler.basePath}/:providerSlug/:mediaType/:plexId/season/:season/children`
		]) {
			const children = endpoint.endsWith(reqsTransform.ChildrenRelativePath);

			// get metadata for requested item
			router.get(endpoint, [
				this.app.middlewares.plexAuthentication,
				this.app.middlewares.plexRequestHandler(async (req: IncomingPlexAPIRequest, res) => {
					// get request properties
					const { providerSlug, mediaType, plexId } = req.params;
					const season = intParam(req.params.season);
					const plexUserInfo = req.plex.userInfo;
					const plexAuthContext = req.plex.authContext;
					const plexParams = req.plex.requestParams;
					const plexServerURL = this.app.plexServerURL;
					// handle request
					return this.requestsHandler.handlePlexRequest({
						requestProviderSlug: providerSlug,
						mediaType: mediaType as plexTypes.PlexMediaItemType,
						plexId,
						season
					}, {
						children,
						plexServerURL,
						plexAuthContext,
						plexUserInfo,
						plexParams
					});
				})
			]);

			if(!children) {
				// TODO handle /related routes
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
