
import http from 'http';
import https from 'https';
import stream from 'stream';
import express from 'express';
import httpolyglot from 'httpolyglot';
import * as plexTypes from '../plex/types';
import * as plexServerAPI from '../plex/api';
import { PlexServerPropertiesStore } from '../plex/serverproperties';
import { PlexServerAccountsStore } from '../plex/accounts';
import {
	PlexGuidToInfoCache,
	createPlexServerIdToGuidCache,
} from '../plex/metadata';
import { parseMetadataIDFromKey } from '../plex/metadataidentifier';
import {
	plexApiProxy,
	plexHttpProxy,
	PlexProxyLoggingOptions,
	PlexProxyOptions
} from '../plex/proxy';
import {
	createPlexAuthenticationMiddleware,
	IncomingPlexAPIRequest,
	PlexAPIRequestHandler,
	plexAPIRequestHandler,
	PlexAPIRequestHandlerOptions
} from '../plex/requesthandling';
import { PlexClient } from '../plex/client';
import * as extPlexTransform from './externalplex/transform';
import {
	PseuplexMetadataPage,
	PseuplexMetadataItem,
	PseuplexMetadataSource,
	PseuplexServerProtocol
} from './types';
import { PseuplexConfigBase } from './configbase';
import {
	stringifyPartialMetadataID,
	stringifyMetadataID,
	PseuplexMetadataIDParts,
	parseMetadataID,
} from './metadataidentifier';
import {
	PseuplexHubListParams,
	PseuplexMetadataChildrenProviderParams,
	PseuplexMetadataProvider,
	PseuplexMetadataProviderParams,
	PseuplexMetadataTransformOptions,
} from './metadata';
import {
	PseuplexPlugin,
	PseuplexResponseFilterName,
	PseuplexResponseFilters,
	PseuplexPlayQueueURIResolverOptions
} from './plugin';
import {
	parseMetadataIdFromPathParam,
	pseuplexMetadataIdRequestMiddleware,
	pseuplexMetadataIdsRequestMiddleware
} from './requesthandling';
import { IDMappings } from './idmappings';
import { CachedFetcher } from '../fetching/CachedFetcher';
import {
	httpError,
	parseURLPath,
	stringifyURLPath,
	forArrayOrSingle,
	forArrayOrSingleAsyncParallel,
	transformArrayOrSingle,
	transformArrayOrSingleAsyncParallel,
	expressErrorHandler,
	intParam,
} from '../utils';
import { urlLogString } from '../logging';



// plugins

type ResponseFilterDefinition<TFilter> = {
	slug: string;
	filter: TFilter;
};
export type PseuplexResponseFilterOrders = { [filterName in PseuplexResponseFilterName]: string[]; };
export type PseuplexResponseFilterLists = { [filterName in PseuplexResponseFilterName]?: ResponseFilterDefinition<PseuplexResponseFilters[filterName]>[] };
export type PseuplexPluginClass = {
	readonly slug: string;
	new(app: PseuplexApp): PseuplexPlugin;
};


// app

type PseuplexAppMetadataParams = {
	plexServerURL: string;
	plexAuthContext: plexTypes.PlexAuthContext;
	plexParams?: plexTypes.PlexMetadataPageParams;
};

type PseuplexAppMetadataChildrenParams = {
	plexServerURL: string;
	plexAuthContext: plexTypes.PlexAuthContext;
	plexParams?: plexTypes.PlexMetadataChildrenPageParams;
};

type PseuplexAppConfig = PseuplexConfigBase<{[key: string]: any}> & {[key: string]: any};

type PseuplexLoggingOptions = {
	logUserRequests?: boolean;
} & PlexProxyLoggingOptions;

export type PseuplexAppOptions = {
	slug?: string;
	protocol?: PseuplexServerProtocol
	serverOptions: https.ServerOptions;
	plexServerURL: string;
	plexAdminAuthContext: plexTypes.PlexAuthContext;
	plexMetadataClient: PlexClient;
	loggingOptions: PseuplexLoggingOptions,
	responseFilterOrders?: PseuplexResponseFilterOrders;
	plugins: PseuplexPluginClass[];
	config: PseuplexAppConfig;
	mapPseuplexMetadataIds?: boolean;
};

export class PseuplexApp {
	readonly slug: string;
	readonly config: PseuplexAppConfig;
	readonly plugins: { [slug: string]: PseuplexPlugin } = {};
	readonly metadataProviders: { [sourceSlug: string]: PseuplexMetadataProvider } = {};
	readonly responseFilters: PseuplexResponseFilterLists = {};
	readonly metadataIdMappings?: IDMappings;

	readonly plexServerURL: string;
	readonly plexAdminAuthContext: plexTypes.PlexAuthContext;
	readonly plexServerProperties: PlexServerPropertiesStore;
	readonly plexServerAccounts: PlexServerAccountsStore;
	readonly clientWebSockets: {[plexToken: string]: stream.Duplex[]} = {};
	readonly plexServerIdToGuidCache: CachedFetcher<string>;
	readonly plexGuidToInfoCache?: PlexGuidToInfoCache;
	readonly plexMetadataClient: PlexClient;

	readonly middlewares: {
		plexAuthentication: express.RequestHandler;
		plexRequestHandler: <TResult>(handler: PlexAPIRequestHandler<TResult>) => ((req: express.Request, res: express.Response) => Promise<void>)
	};
	readonly server: http.Server | https.Server;

	constructor(options: PseuplexAppOptions) {
		this.slug = options.slug ?? 'pseuplex';
		this.config = options.config;
		if(options.mapPseuplexMetadataIds) {
			this.metadataIdMappings = IDMappings.create();
		}
		const loggingOpts = options.loggingOptions;
		
		// define properties
		this.plexServerURL = options.plexServerURL;
		this.plexAdminAuthContext = options.plexAdminAuthContext;
		this.plexServerProperties = new PlexServerPropertiesStore({
			plexServerURL: this.plexServerURL,
			plexAuthContext: this.plexAdminAuthContext
		});
		this.plexServerAccounts = new PlexServerAccountsStore({
			plexServerProperties: this.plexServerProperties
		});
		this.plexMetadataClient = options.plexMetadataClient;
		this.plexServerIdToGuidCache = createPlexServerIdToGuidCache({
			plexServerURL: this.plexServerURL,
			plexAuthContext: this.plexAdminAuthContext
		});
		this.plexGuidToInfoCache = new PlexGuidToInfoCache({
			plexMetadataClient: this.plexMetadataClient
		});

		// define middlewares
		const plexReqHandlerOpts: PlexAPIRequestHandlerOptions = {
			logResponses: loggingOpts.logUserResponses,
			logResponseBody: loggingOpts.logUserResponseBody,
			logFullURLs: loggingOpts.logFullURLs
		};
		this.middlewares = {
			plexAuthentication: createPlexAuthenticationMiddleware(this.plexServerAccounts),
			plexRequestHandler: <TResult>(handler: PlexAPIRequestHandler<TResult>) => plexAPIRequestHandler(handler, plexReqHandlerOpts)
		};

		// loop through and instantiate plugins
		const responseFilterOrders = options.responseFilterOrders ?? {};
		const tmpPluginSlugsSet = new Set<string>();
		for(const pluginClass of options.plugins) {
			// instantiate plugin
			if(pluginClass.slug in this.plugins) {
				console.error(`Ignoring duplicate plugin slug '${pluginClass.slug}'`);
				continue;
			}
			const plugin = new pluginClass(this);

			// add plugin metadata providers
			const metadataProvider = plugin.metadata;
			if(metadataProvider) {
				const metadataSlug = metadataProvider.sourceSlug;
				if(metadataSlug in this.metadataProviders) {
					console.error(`Ignoring duplicate metadata provider '${metadataProvider.sourceSlug}' in plugin '${pluginClass.slug}'`);
					continue;
				}
				this.metadataProviders[metadataSlug] = metadataProvider;
			}

			// add plugin response filters
			const pluginResponseFilters = plugin.responseFilters;
			if(pluginResponseFilters) {
				for(const filterName in pluginResponseFilters) {
					const filter: ResponseFilterDefinition<any> = {
						slug: pluginClass.slug,
						filter: pluginResponseFilters[filterName as PseuplexResponseFilterName]
					};
					// get or create list for filter
					let filterList = this.responseFilters[filterName as PseuplexResponseFilterName];
					if(!filterList) {
						filterList = [];
						this.responseFilters[filterName] = filterList;
					}
					// determine plugin order of filters
					const filterOrder = responseFilterOrders[filterName];
					const filterIndex = filterOrder ? filterOrder.indexOf(pluginClass.slug) : -1;
					if(filterIndex === -1) {
						// no order defined, so just add the filter
						filterList.push(filter);
						continue;
					}
					// filter has a defined order, so find any filters ahead of this filter
					tmpPluginSlugsSet.clear();
					for(let i=(filterIndex+1); i<filterOrder.length; i++) {
						tmpPluginSlugsSet.add(filterOrder[i]);
					}
					// loop through already-added filters and insert this one where needed
					let filterInsertIndex = 0;
					for(const existingFilter of filterList) {
						if(tmpPluginSlugsSet.has(existingFilter.slug)) {
							break;
						}
						filterInsertIndex++;
					}
					filterList.splice(filterInsertIndex, 0, filter);
				}
			}

			// add plugin
			this.plugins[pluginClass.slug] = plugin;
		}

		// create router and define routes
		const protocol = options.protocol ?? PseuplexServerProtocol.httpolyglot;
		const plexProxyArgs: PlexProxyOptions = {
			...loggingOpts
		};
		const router = express();

		router.use((req, res, next) => {
			// log request if needed
			if(loggingOpts.logUserRequests) {
				console.log(`\nUser ${req.method} ${urlLogString(loggingOpts, req.originalUrl)}`);
			}
			next();
		});

		for(const pluginSlug in this.plugins) {
			const plugin = this.plugins[pluginSlug];
			plugin.defineRoutes(router);
		}

		router.get('/media/providers', [
			this.middlewares.plexAuthentication,
			plexApiProxy(this.plexServerURL, plexProxyArgs, {
				responseModifier: async (proxyRes, resData: plexTypes.PlexServerMediaProvidersPage, userReq: IncomingPlexAPIRequest, userRes) => {
					await this.filterResponse('mediaProviders', resData, { proxyRes, userReq, userRes });
					return resData;
				}
			})
		]);

		router.get('/hubs', [
			this.middlewares.plexAuthentication,
			plexApiProxy(this.plexServerURL, plexProxyArgs, {
				responseModifier: async (proxyRes, resData: plexTypes.PlexLibraryHubsPage, userReq: IncomingPlexAPIRequest, userRes) => {
					// filter response
					await this.filterResponse('hubs', resData, { proxyRes, userReq, userRes });
					// remap IDs if needed (since filters may add hubs)
					if(this.metadataIdMappings && resData.MediaContainer.Hub) {
						for(const hub of resData.MediaContainer.Hub) {
							this.remapHubMetadataIdsIfNeeded(hub);
						}
					}
					return resData;
				}
			})
		]);

		router.get('/hubs/promoted', [
			this.middlewares.plexAuthentication,
			plexApiProxy(this.plexServerURL, plexProxyArgs, {
				responseModifier: async (proxyRes, resData: plexTypes.PlexLibraryHubsPage, userReq: IncomingPlexAPIRequest, userRes) => {
					// filter rresponse
					await this.filterResponse('promotedHubs', resData, { proxyRes, userReq, userRes });
					// remap IDs if needed (since filters may add hubs)
					if(this.metadataIdMappings && resData.MediaContainer.Hub) {
						for(const hub of resData.MediaContainer.Hub) {
							this.remapHubMetadataIdsIfNeeded(hub);
						}
					}
					return resData;
				}
			})
		]);
		
		router.get(`/library/metadata/:metadataId`, [
			this.middlewares.plexAuthentication,
			pseuplexMetadataIdsRequestMiddleware({
				...plexReqHandlerOpts,
				metadataIdMappings: this.metadataIdMappings,
			}, async (req: IncomingPlexAPIRequest, res, metadataIds, keysToIdsMap): Promise<PseuplexMetadataPage> => {
				// get metadatas
				const resData = await this.getMetadata(metadataIds, {
					plexServerURL: this.plexServerURL,
					plexAuthContext: req.plex.authContext,
					plexParams: req.plex.requestParams
				});
				// process metadata items
				await forArrayOrSingleAsyncParallel(resData.MediaContainer.Metadata, async (metadataItem) => {
					if(metadataItem.guid) {
						// cache plex id => guid mapping if exists
						const metadataId = metadataItem.Pseuplex.plexMetadataIds?.[this.plexServerURL];
						if(metadataId) {
							this.plexServerIdToGuidCache.setSync(metadataId, metadataItem.guid);
						}
					}
					// filter related hubs if included
					if(req.plex.requestParams['includeRelated'] == 1) {
						// get metadata id
						let metadataIdString = parseMetadataIDFromKey(metadataItem.key, '/library/metadata/')?.id;
						if(!metadataIdString) {
							metadataIdString = metadataItem.ratingKey;
						}
						if(metadataIdString) {
							// filter related hubs
							const metadataId = parseMetadataID(metadataIdString);
							const relatedHubsResponse: plexTypes.PlexHubsPage = {
								MediaContainer: metadataItem.Related ?? {}
							};
							await this.filterResponse('metadataRelatedHubs', relatedHubsResponse, { userReq:req, userRes:res, metadataId });
							metadataItem.Related = relatedHubsResponse.MediaContainer;
						} else {
							console.error("Failed to determine metadataId from metadata item");
						}
					}
				});
				// filter metadata page
				await this.filterResponse('metadata', resData, { userReq:req, userRes:res });
				// remap IDs if needed
				if(this.metadataIdMappings) {
					forArrayOrSingle(resData.MediaContainer.Metadata, (metadataItem) => {
						this.remapMetadataIdIfNeeded(metadataItem, keysToIdsMap);
					});
				}
				return resData;
			}),
			plexApiProxy(this.plexServerURL, plexProxyArgs, {
				responseModifier: async (proxyRes, resData: plexTypes.PlexMetadataPage, userReq: IncomingPlexAPIRequest, userRes) => {
					// process metadata items
					await forArrayOrSingleAsyncParallel(resData.MediaContainer.Metadata, async (metadataItem: PseuplexMetadataItem) => {
						const metadataId = parseMetadataIDFromKey(metadataItem.key, '/library/metadata/')?.id;
						metadataItem.Pseuplex = {
							isOnServer: true,
							metadataIds: {},
							plexMetadataIds: {
								[this.plexServerURL]: metadataId
							}
						};
						// cache id => guid mapping
						if(metadataItem.guid && metadataId) {
							this.plexServerIdToGuidCache.setSync(metadataId, metadataItem.guid);
						}
						// filter related hubs if included
						if(userReq.plex.requestParams['includeRelated'] == 1) {
							// filter related hubs
							const metadataIdParts = parseMetadataID(metadataId);
							const relatedHubsResponse: plexTypes.PlexHubsPage = {
								MediaContainer: metadataItem.Related
							};
							await this.filterResponse('metadataRelatedHubs', relatedHubsResponse, { proxyRes, userReq, userRes, metadataId:metadataIdParts });
							metadataItem.Related = relatedHubsResponse.MediaContainer;
						}
					});
					// filter metadata page
					await this.filterResponse('metadata', resData as PseuplexMetadataPage, { proxyRes, userReq, userRes });
					// no need to remap IDs here, since the request was proxied
					return resData;
				}
			})
		]);

		router.get(`/library/children/:metadataId/children`, [
			this.middlewares.plexAuthentication,
			pseuplexMetadataIdRequestMiddleware({
				...plexReqHandlerOpts,
				metadataIdMappings: this.metadataIdMappings,
			}, async (req: IncomingPlexAPIRequest, res, metadataId, keysToIdsMap): Promise<plexTypes.PlexMetadataPage | PseuplexMetadataPage> => {
				// get metadatas
				const plexParams = {
					...req.plex.requestParams,
					'X-Plex-Container-Start': intParam(req.query['X-Plex-Container-Start'] ?? req.header('x-plex-container-start')),
					'X-Plex-Container-Size': intParam(req.query['X-Plex-Container-Size'] ?? req.header('x-plex-container-size'))
				}
				const resData = await this.getMetadataChildren(metadataId, {
					plexServerURL: this.plexServerURL,
					plexAuthContext: req.plex.authContext,
					plexParams: plexParams
				});
				// remap IDs if needed
				if(this.metadataIdMappings) {
					forArrayOrSingle(resData.MediaContainer.Metadata, (metadataItem) => {
						this.remapMetadataIdIfNeeded(metadataItem, keysToIdsMap);
					});
				}
				return resData;
			}),
			// no need to modify proxied response here (for now)
		]);

		router.get(`/library/metadata/:metadataId/related`, [
			this.middlewares.plexAuthentication,
			pseuplexMetadataIdRequestMiddleware({
				...plexReqHandlerOpts,
				metadataIdMappings: this.metadataIdMappings,
			}, async (req: IncomingPlexAPIRequest, res, metadataId, keysToIdsMap): Promise<plexTypes.PlexHubsPage> => {
				// get metadata
				const resData = await this.getMetadataRelatedHubs(metadataId, {
					plexParams: req.plex.requestParams,
					plexServerURL: this.plexServerURL,
					plexAuthContext: req.plex.authContext
				});
				// filter hub list page
				await this.filterResponse('metadataRelatedHubs', resData, { userReq:req, userRes:res, metadataId });
				// remap IDs if needed
				if(this.metadataIdMappings && resData.MediaContainer.Hub) {
					for(const hub of resData.MediaContainer.Hub) {
						this.remapHubMetadataIdsIfNeeded(hub, keysToIdsMap);
					}
				}
				return resData;
			}),
			plexApiProxy(this.plexServerURL, plexProxyArgs, {
				responseModifier: async (proxyRes, resData: plexTypes.PlexHubsPage, userReq: IncomingPlexAPIRequest, userRes) => {
					// get request info
					const metadataId = parseMetadataIdFromPathParam(userReq.params.metadataId);
					// filter hub list page
					await this.filterResponse('metadataRelatedHubs', resData, { proxyRes, userReq, userRes, metadataId });
					// remap IDs if needed (since filters may add hubs)
					if(this.metadataIdMappings && resData.MediaContainer.Hub) {
						for(const hub of resData.MediaContainer.Hub) {
							this.remapHubMetadataIdsIfNeeded(hub);
						}
					}
					return resData;
				}
			})
		]);

		router.get(`/library/all`, [
			this.middlewares.plexAuthentication,
			plexApiProxy(this.plexServerURL, plexProxyArgs, {
				filter: (req, res) => {
					// only filter if guid is included
					if(req.query['guid'] || req.query['show.guid']) {
						return true;
					}
					return false
				},
				responseModifier: async (proxyRes, resData: plexTypes.PlexMetadataPage, userReq: IncomingPlexAPIRequest, userRes) => {
					// filter metadata
					await this.filterResponse('findGuidInLibrary', resData, { proxyRes, userReq, userRes });
					// remap IDs if needed
					if(this.metadataIdMappings) {
						forArrayOrSingle(resData.MediaContainer.Metadata, (metadataItem) => {
							this.remapMetadataIdIfNeeded(metadataItem);
						});
					}
					return resData;
				}
			})
		]);

		router.post('/playQueues', [
			this.middlewares.plexAuthentication,
			plexApiProxy(this.plexServerURL, plexProxyArgs, {
				requestPathModifier: async (req: IncomingPlexAPIRequest): Promise<string> => {
					// parse url path
					const urlPathParts = parseURLPath(req.originalUrl);
					const queryItems = urlPathParts.queryItems;
					if(!queryItems) {
						return req.originalUrl;
					}
					// check for play queue uri
					let uriProp = queryItems['uri'];
					if(!uriProp) {
						return req.originalUrl;
					}
					// resolve play queue uri
					const resolveOptions: PseuplexPlayQueueURIResolverOptions = {
						plexMachineIdentifier: await this.plexServerProperties.getMachineIdentifier(),
						plexServerURL: this.plexServerURL,
						plexAuthContext: req.plex.authContext
					};
					uriProp = await transformArrayOrSingleAsyncParallel(uriProp, async (uri) => {
						return await this.resolvePlayQueueURI(uri, resolveOptions);
					});
					queryItems['uri'] = uriProp;
					return stringifyURLPath(urlPathParts);
				}
			})
		]);

		// proxy requests to plex
		const plexGeneralProxy = plexHttpProxy(this.plexServerURL);
		plexGeneralProxy.on('error', (error) => {
			console.error();
			console.error(error);
		});
		router.use((req, res) => {
			plexGeneralProxy.web(req,res);
		});
		router.use(expressErrorHandler);
		
		// create http/https/http+https server
		let server: (http.Server | https.Server | undefined) = undefined;
		switch(protocol) {
			case PseuplexServerProtocol.http:
				server = http.createServer(options.serverOptions, router);
				break;
			case PseuplexServerProtocol.https:
				server = https.createServer(options.serverOptions, router);
				break;
			case PseuplexServerProtocol.httpolyglot:
				server = httpolyglot.createServer(options.serverOptions, router);
				break;
			default:
				console.warn(`Unknown protocol '${protocol}'`);
				server = httpolyglot.createServer(options.serverOptions, router);
				break;
		}

		// handle upgrade to socket
		server.on('upgrade', (req, socket, head) => {
			if(loggingOpts.logUserRequests) {
				console.log(`\nupgrade ws ${req.url}`);
			}
			const plexToken = plexTypes.parsePlexTokenFromRequest(req);
			if(plexToken) {
				// save socket per plex token
				// TODO wait until response from plex before adding to socket list
				let sockets = this.clientWebSockets[plexToken];
				if(!sockets) {
					sockets = [];
					this.clientWebSockets[plexToken] = sockets;
				}
				sockets.push(socket);
				socket.on('close', () => {
					const socketIndex = sockets.indexOf(socket);
					if(socketIndex != -1) {
						sockets.splice(socketIndex, 1);
						if(sockets.length == 0) {
							delete this.clientWebSockets[plexToken];
						}
					} else {
						console.error(`Couldn't find socket to remove for ${req.url}`);
					}
					if(loggingOpts.logUserRequests) {
						console.log(`closed socket ${req.url}`);
					}
				});
			}
			plexGeneralProxy.ws(req, socket, head);
		});

		this.server = server;
	}


	getMetadataProvider(sourceSlug: string): (PseuplexMetadataProvider | null) {
		return this.metadataProviders[sourceSlug] ?? null;
	}


	async getMetadata(metadataIds: PseuplexMetadataIDParts[], params: PseuplexAppMetadataParams): Promise<PseuplexMetadataPage> {
		let caughtError: Error | undefined = undefined;
		// create provider params
		const transformOpts: PseuplexMetadataTransformOptions = {
			metadataBasePath: '/library/metadata',
			qualifiedMetadataId: true
		};
		const providerParams: PseuplexMetadataProviderParams = {
			...params,
			includeDiscoverMatches: true,
			includeUnmatched: true,
			transformMatchKeys: true,
			metadataBasePath: transformOpts.metadataBasePath,
			qualifiedMetadataIds: transformOpts.qualifiedMetadataId
		};
		// get metadata for each id
		const metadataItems = (await Promise.all(metadataIds.map(async (metadataId) => {
			try {
				let source = metadataId.source;
				// if the metadataId doesn't have a source, assume plex
				if (source == null || source == PseuplexMetadataSource.Plex) {
					// fetch from plex
					const fullMetadataId = stringifyMetadataID(metadataId);
					const metadatas = (await plexServerAPI.getLibraryMetadata(fullMetadataId, {
						params: params.plexParams,
						serverURL: params.plexServerURL,
						authContext: params.plexAuthContext,
					})).MediaContainer?.Metadata;
					// transform metadata
					return transformArrayOrSingle(metadatas, (metadataItem: PseuplexMetadataItem) => {
						metadataItem.Pseuplex = {
							isOnServer: true,
							metadataIds: {},
							plexMetadataIds: {
								[params.plexServerURL]: metadataItem.ratingKey
							}
						};
						return metadataItem;
					});
				} else if(source == PseuplexMetadataSource.PlexServer) {
					// fetch from from external plex server
					const itemPlexServerURL = metadataId.directory;
					if(!itemPlexServerURL) {
						throw httpError(400, `Invalid metadata id`);
					}
					const metadatas = (await plexServerAPI.getLibraryMetadata(metadataId.id, {
						serverURL: itemPlexServerURL,
						authContext: params.plexAuthContext,
						params: params.plexParams
					})).MediaContainer?.Metadata;
					// transform metadata
					return transformArrayOrSingle(metadatas, (metadataItem: PseuplexMetadataItem) => {
						return extPlexTransform.transformExternalPlexMetadata(metadataItem, itemPlexServerURL, transformOpts);
					});
				}
				// find matching provider from source
				const metadataProvider = this.getMetadataProvider(source);
				if(!metadataProvider) {
					throw httpError(404, `Unknown metadata source ${source}`);
				}
				// fetch from provider
				const partialId = stringifyPartialMetadataID(metadataId);
				return (await metadataProvider.get([partialId], providerParams)).MediaContainer.Metadata;
			} catch(error) {
				if(!caughtError) {
					caughtError = error;
				}
			}
		}))).reduce<PseuplexMetadataItem[]>((accumulator, element) => {
			if(element) {
				accumulator = accumulator.concat(element);
			}
			return accumulator;
		}, []);
		if(metadataItems.length == 0) {
			if(caughtError) {
				throw caughtError;
			}
			throw httpError(404, "Not Found");
		}
		return {
			MediaContainer: {
				size: metadataItems.length,
				allowSync: false,
				identifier: plexTypes.PlexPluginIdentifier.PlexAppLibrary,
				Metadata: metadataItems
			}
		};
	}

	async getMetadataChildren(metadataId: PseuplexMetadataIDParts, params: PseuplexAppMetadataChildrenParams): Promise<plexTypes.PlexMetadataPage | PseuplexMetadataPage> {
		// create provider params
		const transformOpts: PseuplexMetadataTransformOptions = {
			metadataBasePath: '/library/metadata',
			qualifiedMetadataId: true
		};
		const providerParams: PseuplexMetadataChildrenProviderParams = {
			...params,
			includeDiscoverMatches: true
		};
		// get metadata for each id
		let source = metadataId.source;
		// if the metadataId doesn't have a source, assume plex
		if (source == null || source == PseuplexMetadataSource.Plex) {
			// fetch from plex
			const fullMetadataId = stringifyMetadataID(metadataId);
			const metadataPage = await plexServerAPI.getLibraryMetadataChildren(fullMetadataId, {
				params: params.plexParams,
				serverURL: params.plexServerURL,
				authContext: params.plexAuthContext,
			});
			// TODO transform metadata children
			return metadataPage;
		} else if(source == PseuplexMetadataSource.PlexServer) {
			// fetch from from external plex server
			const itemPlexServerURL = metadataId.directory;
			if(!itemPlexServerURL) {
				throw httpError(400, `Invalid metadata id`);
			}
			const metadataPage = await plexServerAPI.getLibraryMetadataChildren(metadataId.id, {
				serverURL: itemPlexServerURL,
				authContext: params.plexAuthContext,
				params: params.plexParams
			});
			// transform metadata
			metadataPage.MediaContainer.Metadata = transformArrayOrSingle(metadataPage.MediaContainer.Metadata, (metadataItem: PseuplexMetadataItem) => {
				return extPlexTransform.transformExternalPlexMetadata(metadataItem, itemPlexServerURL, transformOpts);
			});
			return metadataPage;
		}
		// find matching provider from source
		const metadataProvider = this.getMetadataProvider(source);
		if(!metadataProvider) {
			throw httpError(404, `Unknown metadata source ${source}`);
		}
		// fetch from provider
		const partialId = stringifyPartialMetadataID(metadataId);
		return await metadataProvider.getChildren(partialId, providerParams);
	}

	async getMetadataRelatedHubs(metadataId: PseuplexMetadataIDParts, options: PseuplexHubListParams): Promise<plexTypes.PlexHubsPage> {
		// determine where each ID comes from
		if(metadataId.source == null || metadataId.source == PseuplexMetadataSource.Plex) {
			// get related hubs from pms
			const metadataIdString = stringifyMetadataID(metadataId);
			return await plexServerAPI.getLibraryMetadataRelatedHubs(metadataIdString, {
				params: options.plexParams,
				// TODO include forwarded request headers
				serverURL: options.plexServerURL,
				authContext: options.plexAuthContext
			});
		} else if(metadataId.source == PseuplexMetadataSource.PlexServer) {
			// TODO get related hubs from external server?
			/*const itemPlexServerURL = metadataId.directory;
			if(!itemPlexServerURL) {
				throw httpError(400, `Invalid metadata id`);
			}
			const hubsPage = await plexServerAPI.getLibraryMetadataRelatedHubs(metadataId.id, {
				serverURL: itemPlexServerURL,
				authContext: options.plexAuthContext,
				params: options.plexParams
			});*/
			// TODO transform external plex hubs
			return {
				MediaContainer: {
					size: 0,
					totalSize: 0,
					Hub: []
				}
			};
		}
		// get related hubs from provider
		const metadataProvider = this.getMetadataProvider(metadataId.source);
		if(!metadataProvider) {
			throw httpError(404, `Unknown metadata source ${metadataId.source}`);
		}
		const providerMetadataId = stringifyPartialMetadataID(metadataId);
		return await metadataProvider.getRelatedHubs(providerMetadataId, options);
	}


	async resolvePlayQueueURI(uri: string, options: PseuplexPlayQueueURIResolverOptions): Promise<string> {
		const uriParts = plexTypes.parsePlayQueueURI(uri);
		// remap if the path is using a mapped id
		if(this.metadataIdMappings) {
			const metadataKeyParts = parseMetadataIDFromKey(uriParts.path, '/library/metadata/');
			if(metadataKeyParts) {
				const metadataIdParts = parseMetadataID(metadataKeyParts.id);
				if(metadataIdParts.source && metadataIdParts.source != PseuplexMetadataSource.Plex) {
					const privateId = this.metadataIdMappings.getKeyForID(metadataKeyParts.id);
					if(privateId != null) {
						const privatePath = `/library/metadata/${privateId}` + (metadataKeyParts?.relativePath ?? '');
						uriParts.path = privatePath;
					}
				}
			}
		}
		// check if any plugins can resolve the URI
		for(const pluginSlug in this.plugins) {
			const plugin = this.plugins[pluginSlug];
			if(plugin.resolvePlayQueueURI) {
				const resolvedURI = await plugin.resolvePlayQueueURI(uriParts, options);
				if(resolvedURI) {
					return resolvedURI;
				}
			}
		}
		return uri;
	}


	async filterResponse<TFilterName extends PseuplexResponseFilterName>(filterName: TFilterName, resData: Parameters<PseuplexResponseFilters[TFilterName]>[0], context: Parameters<PseuplexResponseFilters[TFilterName]>[1]) {
		const filtersList = this.responseFilters[filterName];
		if (filtersList) {
			const promises = context.previousFilterPromises?.slice(0) ?? [];
			for(const filterDef of filtersList) {
				const result = filterDef.filter(resData as any, {
					...context,
					previousFilterPromises: promises.slice(0)
				} as any);
				if(result) {
					promises.push(result.catch((error) => {
						console.error(error);
					}));
				}
			}
			await Promise.all(promises);
		}
		return resData;
	}

	// remaps private IDs (such as "letterboxd:film:mission-impossible") to plex-acceptable IDs (such as "-2")
	remapHubMetadataIdsIfNeeded(hub: plexTypes.PlexHubWithItems, keysToIdsMap?: {[key: string]: (number | string)}) {
		if(!this.metadataIdMappings) {
			return;
		}
		// check if hub key needs to be mapped
		let metadataKeyParts = parseMetadataIDFromKey(hub.hubKey, '/library/metadata/');
		let metadataIds: (string | number)[] = metadataKeyParts?.id.split(',');
		if(metadataIds) {
			for(let i=0; i<metadataIds.length; i++) {
				const metadataIdString = `${metadataIds[i]}`;
				const metadataId = parseMetadataID(metadataIdString);
				if(!metadataId.source || metadataId.source == PseuplexMetadataSource.Plex) {
					// don't map plex IDs
					continue;
				}
				// map the ID
				const publicId = keysToIdsMap?.[metadataIdString] ?? this.metadataIdMappings.getIDForKey(metadataIdString);
				metadataIds[i] = publicId;
			}
			hub.hubKey = `/library/metadata/${metadataIds.join(',')}` + (metadataKeyParts?.relativePath ?? '');
		}
		// remap metadata items if needed
		if(hub.Metadata) {
			for(const metadataItem of hub.Metadata) {
				this.remapMetadataIdIfNeeded(metadataItem, keysToIdsMap);
			}
		}
	}

	// remaps private IDs (such as "letterboxd:film:mission-impossible") to plex-acceptable IDs (such as "-2")
	remapMetadataIdIfNeeded(metadataItem: plexTypes.PlexMetadataItem, keysToIdsMap?: {[key: string]: (number | string)}) {
		if(!this.metadataIdMappings) {
			return;
		}
		// check if ID needs to be mapped
		let metadataKeyParts = parseMetadataIDFromKey(metadataItem.key, '/library/metadata/');
		let metadataIdString = metadataKeyParts?.id;
		if(!metadataIdString) {
			metadataIdString = metadataItem.ratingKey;
			if(!metadataIdString) {
				// failed to find the ID of the item
				return;
			}
		}
		const metadataId = parseMetadataID(metadataIdString);
		if(!metadataId.source || metadataId.source == PseuplexMetadataSource.Plex) {
			// don't map plex IDs
			return;
		}
		// map the ID
		const publicId = keysToIdsMap?.[metadataIdString] ?? this.metadataIdMappings.getIDForKey(metadataIdString);
		const publicPath = `/library/metadata/${publicId}` + (metadataKeyParts?.relativePath ?? '');
		metadataItem.ratingKey = `${publicId}`;
		metadataItem.key = publicPath;
		// map related items if needed
		if(metadataItem.Related?.Hub) {
			for(const hub of metadataItem.Related.Hub) {
				this.remapHubMetadataIdsIfNeeded(hub, keysToIdsMap);
			}
		}
	}
}
