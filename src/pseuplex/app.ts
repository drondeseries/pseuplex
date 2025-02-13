
import http from 'http';
import https from 'https';
import stream from 'stream';
import express from 'express';
import httpolyglot from 'httpolyglot';
import * as plexTypes from '../plex/types';
import * as plexServerAPI from '../plex/api';
import { PlexServerPropertiesStore } from '../plex/serverproperties';
import { PlexServerAccountsStore } from '../plex/accounts';
import { createPlexServerIdToGuidCache } from '../plex/metadata';
import { parseMetadataIDFromKey } from '../plex/metadataidentifier';
import {
	plexApiProxy,
	plexHttpProxy,
	PlexProxyLoggingOptions,
	PlexProxyOptions
} from '../plex/proxy';
import {
	createPlexAuthenticationMiddleware,
	IncomingPlexAPIRequest
} from '../plex/requesthandling';
import {
	PseuplexMetadataPage,
	PseuplexMetadataItem,
	PseuplexMetadataSource,
	PseuplexServerProtocol
} from './types';
import { PseuplexConfigBase } from './configbase';
import {
	PseuplexPartialMetadataIDString,
	stringifyPartialMetadataID,
	PseuplexMetadataIDParts,
	stringifyMetadataID
} from './metadataidentifier';
import {
	PseuplexHubListParams,
	PseuplexMetadataParams,
	PseuplexMetadataProvider,
	PseuplexMetadataProviderParams
} from './metadata';
import {
	PseuplexPlugin,
	PseuplexResponseFilterName,
	PseuplexResponseFilters,
	PseuplexPlayQueueURIResolverOptions
} from './plugin';
import {
	parseMetadataIdsFromPathParam,
	pseuplexMetadataIdsRequestMiddleware
} from './requesthandling';
import { CachedFetcher } from '../fetching/CachedFetcher';
import {
	httpError,
	parseQueryParams,
	forArrayOrSingle,
	parseURLPath,
	stringifyURLPath,
	transformArrayOrSingleAsyncParallel,
	expressErrorHandler
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

type PseuplexAppMetadataParams = PseuplexMetadataParams & {
	transformProviderMetadataItem?: (metadataItem: PseuplexMetadataItem, id: PseuplexPartialMetadataIDString, provider: PseuplexMetadataProvider) => PseuplexMetadataItem | Promise<PseuplexMetadataItem>;
	transformPlexMetadataItem?: (metadataItem: PseuplexMetadataItem, plexId: string) => PseuplexMetadataItem | Promise<PseuplexMetadataItem>;
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
	loggingOptions: PseuplexLoggingOptions,
	responseFilterOrders?: PseuplexResponseFilterOrders;
	plugins: PseuplexPluginClass[];
	config: PseuplexAppConfig;
};

export class PseuplexApp {
	readonly slug: string;
	readonly config: PseuplexAppConfig;
	readonly plugins: { [slug: string]: PseuplexPlugin } = {};
	readonly metadataProviders: { [sourceSlug: string]: PseuplexMetadataProvider } = {};
	readonly responseFilters: PseuplexResponseFilterLists = {};

	readonly plexServerURL: string;
	readonly plexAdminAuthContext: plexTypes.PlexAuthContext;
	readonly plexServerProperties: PlexServerPropertiesStore;
	readonly plexServerAccounts: PlexServerAccountsStore;
	readonly clientWebSockets: {[plexToken: string]: stream.Duplex[]} = {};
	readonly plexServerIdToGuidCache: CachedFetcher<string>;

	readonly middlewares: {
		plexAuthentication: express.RequestHandler;
	};
	readonly server: http.Server | https.Server;

	constructor(options: PseuplexAppOptions) {
		this.slug = options.slug ?? 'pseuplex';
		this.config = options.config;
		
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
		this.plexServerIdToGuidCache = createPlexServerIdToGuidCache({
			plexServerURL: this.plexServerURL,
			plexAuthContext: this.plexAdminAuthContext
		});

		// define middlewares
		this.middlewares = {
			plexAuthentication: createPlexAuthenticationMiddleware(this.plexServerAccounts)
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
		const loggingOpts = options.loggingOptions;
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

		router.get('/hubs', [
			this.middlewares.plexAuthentication,
			plexApiProxy(this.plexServerURL, plexProxyArgs, {
				responseModifier: async (proxyRes, resData: plexTypes.PlexLibraryHubsPage, userReq: IncomingPlexAPIRequest, userRes) => {
					const params: plexTypes.PlexHubListPageParams = parseQueryParams(userReq, (key) => !(key in userReq.plex.authContext));
					await this.filterResponse('hubs', resData, { proxyRes, userReq, userRes, params });
					return resData;
				}
			})
		]);

		router.get('/hubs/promoted', [
			this.middlewares.plexAuthentication,
			plexApiProxy(this.plexServerURL, plexProxyArgs, {
				responseModifier: async (proxyRes, resData: plexTypes.PlexLibraryHubsPage, userReq: IncomingPlexAPIRequest, userRes) => {
					const params: plexTypes.PlexHubListPageParams = parseQueryParams(userReq, (key) => !(key in userReq.plex.authContext));
					await this.filterResponse('promotedHubs', resData, { proxyRes, userReq, userRes, params });
					return resData;
				}
			})
		]);
		
		router.get(`/library/metadata/:metadataId`, [
			this.middlewares.plexAuthentication,
			pseuplexMetadataIdsRequestMiddleware(async (req: IncomingPlexAPIRequest, res, metadataIds): Promise<PseuplexMetadataPage> => {
				const params = parseQueryParams(req, (key) => !(key in req.plex.authContext));
				// get metadatas
				const resData = await this.getMetadata(metadataIds, {
					plexServerURL: this.plexServerURL,
					plexAuthContext: req.plex.authContext,
					includeDiscoverMatches: true,
					includeUnmatched: true,
					transformMatchKeys: true,
					metadataBasePath: '/library/metadata',
					qualifiedMetadataIds: true,
					plexParams: params
				});
				// process metadata items
				forArrayOrSingle(resData.MediaContainer.Metadata, (metadataItem) => {
					if(metadataItem.guid) {
						// cache plex id => guid mapping if exists
						const metadataId = metadataItem.Pseuplex.plexMetadataIds?.[this.plexServerURL];
						if(metadataId) {
							this.plexServerIdToGuidCache.setSync(metadataId, metadataItem.guid);
						}
					}
				});
				// filter metadata page
				await this.filterResponse('metadata', resData, { userReq:req, userRes:res, params });
				return resData;
			}),
			plexApiProxy(this.plexServerURL, plexProxyArgs, {
				responseModifier: async (proxyRes, resData: plexTypes.PlexMetadataPage, userReq: IncomingPlexAPIRequest, userRes) => {
					const params: plexTypes.PlexMetadataPageParams = parseQueryParams(userReq, (key) => !(key in userReq.plex.authContext));
					// process metadata items
					forArrayOrSingle(resData.MediaContainer.Metadata, (metadataItem: PseuplexMetadataItem) => {
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
					});
					// filter metadata page
					await this.filterResponse('metadata', resData as PseuplexMetadataPage, { proxyRes, userReq, userRes, params });
					return resData;
				}
			})
		]);

		router.get(`/library/metadata/:metadataId/related`, [
			this.middlewares.plexAuthentication,
			pseuplexMetadataIdsRequestMiddleware(async (req: IncomingPlexAPIRequest, res, metadataIds): Promise<plexTypes.PlexHubsPage> => {
				// get request info
				const params = parseQueryParams(req, (key) => !(key in req.plex.authContext));
				// get metadata
				const resData = await this.getMetadataRelatedHubs(metadataIds, {
					plexParams: params,
					plexServerURL: this.plexServerURL,
					plexAuthContext: req.plex.authContext
				});
				// filter hub list page
				await this.filterResponse('metadataRelatedHubs', resData, { userReq:req, userRes:res, params, metadataIds });
				return resData;
			}),
			plexApiProxy(this.plexServerURL, plexProxyArgs, {
				responseModifier: async (proxyRes, resData: plexTypes.PlexHubsPage, userReq: IncomingPlexAPIRequest, userRes) => {
					// get request info
					const params = parseQueryParams(userReq, (key) => !(key in userReq.plex.authContext));
					const metadataIds = parseMetadataIdsFromPathParam(userReq.params.metadataId);
					// filter hub list page
					await this.filterResponse('metadataRelatedHubs', resData, { proxyRes, userReq, userRes, params, metadataIds });
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
				responseModifier: async (proxyRes, resData, userReq: IncomingPlexAPIRequest, userRes) => {
					// get request info
					const params = parseQueryParams(userReq, (key) => !(key in userReq.plex.authContext));
					// filter metadata
					await this.filterResponse('findGuidInLibrary', resData, { proxyRes, userReq, userRes, params });
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
		const providerParams: PseuplexMetadataProviderParams = {
			...params
		};
		delete (providerParams as PseuplexAppMetadataParams).transformProviderMetadataItem;
		delete (providerParams as PseuplexAppMetadataParams).transformPlexMetadataItem;
		providerParams.transformMetadataItem = params.transformProviderMetadataItem;
		// if not defined, set the metadata base path and use fully-qualified metadata IDs
		if(!providerParams.metadataBasePath) {
			providerParams.metadataBasePath = '/library/metadata';
			if(providerParams.qualifiedMetadataIds == null) {
				providerParams.qualifiedMetadataIds = true;
			}
		}
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
					})).MediaContainer.Metadata;
					// transform metadata
					let metadataItem = ((metadatas instanceof Array) ? metadatas[0] : metadatas) as PseuplexMetadataItem;
					if(!metadataItem) {
						return [];
					}
					metadataItem.Pseuplex = {
						isOnServer: true,
						metadataIds: {},
						plexMetadataIds: {
							[params.plexServerURL]: fullMetadataId
						}
					}
					if(params.transformPlexMetadataItem) {
						metadataItem = await params.transformPlexMetadataItem(metadataItem, fullMetadataId);
					}
					return metadataItem;
				}
				// find matching provider from source
				const provider = this.getMetadataProvider(source);
				if(provider) {
					// fetch from provider
					const partialId = stringifyPartialMetadataID(metadataId);
					return (await provider.get([partialId], providerParams)).MediaContainer.Metadata;
				}
				// TODO handle other source type
				console.error(`Unknown metadata source ${source}`);
				return [];
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

	async getMetadataRelatedHubs(metadataIds: PseuplexMetadataIDParts[], options: PseuplexHubListParams) {
		// determine where each ID comes from
		const plexIds: string[] = [];
		const idsFromProviders: { [sourceSlug: string]: string[] } = {};
		for(const metadataId of metadataIds as PseuplexMetadataIDParts[]) {
			if(metadataId.source == null || metadataId.source == PseuplexMetadataSource.Plex) {
				plexIds.push(stringifyMetadataID(metadataId));
			} else {
				let providerIdList = idsFromProviders[metadataId.source];
				if(!providerIdList) {
					providerIdList = [];
					idsFromProviders[metadataId.source] = providerIdList;
				}
				providerIdList.push(stringifyPartialMetadataID(metadataId));
			}
		}
		// get hub(s) from plex
		let hubs: plexTypes.PlexHubWithItems[] = [];
		let caughtError: Error = undefined;
		if(plexIds.length > 0) {
			try {
				const plexHubsPage = await plexServerAPI.getLibraryMetadataRelatedHubs(plexIds, {
					params: options.plexParams,
					// TODO include forwarded request headers
					serverURL: this.plexServerURL,
					authContext: options.plexAuthContext
				});
				if(plexHubsPage?.MediaContainer?.Hub) {
					hubs = hubs.concat(plexHubsPage.MediaContainer.Hub);
				}
			} catch(error) {
				console.error(error);
				caughtError = error;
			}
		}
		// get hub(s) from other providers
		hubs = hubs.concat(...(await Promise.all(Object.keys(idsFromProviders).map(async (sourceSlug) => {
			try {
				const providerMetadataIds = idsFromProviders[sourceSlug];
				const metadataProvider = this.getMetadataProvider(sourceSlug);
				if(!metadataProvider) {
					console.error(`Unknown metadata source ${sourceSlug}`);
					return null;
				}
				if(!metadataProvider.getRelatedHubs) {
					return null;
				}
				return (await metadataProvider.getRelatedHubs(providerMetadataIds, options))?.MediaContainer?.Hub;
			} catch(error) {
				console.error(error);
				if(!caughtError) {
					caughtError = error;
				}
			}
		}))).filter((hub) => hub));
		// throw error if no hubs
		if(hubs.length == 0 && caughtError) {
			throw caughtError;
		}
		// build hubs page
		return {
			MediaContainer: {
				size: hubs.length,
				identifier: plexTypes.PlexPluginIdentifier.PlexAppLibrary,
				Hub: hubs
			}
		};
	}


	async resolvePlayQueueURI(uri: string, options: PseuplexPlayQueueURIResolverOptions): Promise<string> {
		const uriParts = plexTypes.parsePlayQueueURI(uri);
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


	async filterResponse<TFilterName extends PseuplexResponseFilterName>(filterName: TFilterName, resData: any, context: Parameters<PseuplexResponseFilters[TFilterName]>[1]) {
		const filtersList = this.responseFilters[filterName];
		if (filtersList) {
			const promises = context.previousFilterPromises?.slice(0) ?? [];
			for(const filterDef of filtersList) {
				const result = filterDef.filter(resData, {
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
}
