import express from 'express';
import * as letterboxd from 'letterboxd-retriever';
import * as plexTypes from '../../plex/types';
import {
	IncomingPlexAPIRequest,
} from '../../plex/requesthandling';
import { parseMetadataIDFromKey } from '../../plex/metadataidentifier';
import {
	PseuplexApp,
	PseuplexPlugin,
	PseuplexPluginClass,
	PseuplexResponseFilterContext,
	PseuplexHub,
	PseuplexHubProvider,
	PseuplexMetadataPage,
	PseuplexPartialMetadataIDString,
	PseuplexPlayQueueURIResolverOptions,
	PseuplexReadOnlyResponseFilters,
	PseuplexMetadataIDParts,
	PseuplexMetadataSource,
	PseuplexSimilarItemsHubProvider,
	sendMediaUnavailableNotifications,
	stringifyMetadataID,
	parsePartialMetadataID,
	stringifyPartialMetadataID,
	PseuplexMetadataProvider,
	PseuplexSection
} from '../../pseuplex';
import {
	LetterboxdMetadataProvider
} from './metadata';
import {
	createUserFollowingFeedHub,
	createSimilarItemsHub
} from './hubs'
import * as lbTransform from './transform';
import {
	forArrayOrSingleAsyncParallel,
	httpError,
	pushToArray,
	stringParam
} from '../../utils';
import { LetterboxdPluginConfig } from './config';

export default (class LetterboxdPlugin implements PseuplexPlugin {
	static slug = 'letterboxd';
	readonly slug: string = LetterboxdPlugin.slug;
	readonly app: PseuplexApp;
	readonly metadata: LetterboxdMetadataProvider;
	readonly hubs: {
		readonly userFollowingActivity: PseuplexHubProvider & {readonly basePath: string};
		readonly similar: PseuplexSimilarItemsHubProvider;
	};
	//readonly section?: PseuplexSection;


	constructor(app: PseuplexApp) {
		this.app = app;
		const self = this;

		// create section
		/*const section = new PseuplexSection({
			id: -1,//this.slug,
			uuid: "583933fd-07c7-40b6-a18a-bc74304a3102",
			path: this.basePath,
			hubsPath: `${this.basePath}/hubs`,
			title: `Letterboxd Films`,
			hidden: true,
		});
		this.section = section;*/

		// create hub providers
		this.hubs = {
			userFollowingActivity: new class extends PseuplexHubProvider {
				readonly basePath = `${self.basePath}/hubs/following`;
				override fetch(letterboxdUsername: string): PseuplexHub | Promise<PseuplexHub> {
					// TODO validate that the profile exists
					return createUserFollowingFeedHub(letterboxdUsername, {
						hubPath: `${this.basePath}/${letterboxdUsername}`,
						style: plexTypes.PlexHubStyle.Shelf,
						promoted: true,
						uniqueItemsOnly: true,
						letterboxdMetadataProvider: self.metadata,
						...(app.metadataIdMappings ? {
							metadataTransformOptions: {
								metadataBasePath: '/library/metadata',
								qualifiedMetadataId: true,
							},
						} : undefined),
						//section: section,
						//matchToPlexServerMetadata: true
					});
				}
			}(),
			
			similar: new class extends PseuplexHubProvider {
				readonly relativePath = 'similar';
				override fetch(metadataId: PseuplexPartialMetadataIDString): PseuplexHub | Promise<PseuplexHub> {
					return createSimilarItemsHub(metadataId, {
						relativePath: this.relativePath,
						title: "Similar Films on Letterboxd",
						style: plexTypes.PlexHubStyle.Shelf,
						promoted: true,
						letterboxdMetadataProvider: self.metadata,
						...(app.metadataIdMappings ? {
							metadataTransformOptions: {
								metadataBasePath: '/library/metadata',
								qualifiedMetadataId: true,
							},
						} : undefined),
						defaultCount: 12
					});
				}
			}()
		};

		// create metadata provider
		this.metadata = new LetterboxdMetadataProvider({
			basePath: `${this.basePath}/metadata`,
			//section: this.section,
			plexMetadataClient: this.app.plexMetadataClient,
			similarItemsHubProvider: this.hubs.similar,
			plexGuidToInfoCache: this.app.plexGuidToInfoCache,
		});
	}

	get basePath(): string {
		return `/${this.app.slug}/${this.slug}`;
	}

	get metadataProviders(): PseuplexMetadataProvider[] {
		return [this.metadata];
	}

	get config(): LetterboxdPluginConfig {
		return this.app.config;
	}
	
	responseFilters?: PseuplexReadOnlyResponseFilters = {
		hubs: async (resData, context) => {
			await this._addFriendsActivityHubIfNeeded(resData, context);
		},

		promotedHubs: async (resData, context) => {
			const pinnedContentDirectoryID = context.userReq.query['pinnedContentDirectoryID'];
			const pinnedContentDirIds = (typeof pinnedContentDirectoryID == 'string') ? pinnedContentDirectoryID.split(',') : pinnedContentDirectoryID;
			const contentDirectoryID = context.userReq.query['contentDirectoryID'];
			const contentDirIds = (typeof contentDirectoryID == 'string') ? contentDirectoryID.split(',') : contentDirectoryID;
			if(!pinnedContentDirIds || pinnedContentDirIds.length == 0 || !contentDirIds || contentDirIds.length == 0 || contentDirIds[0] == pinnedContentDirIds[0]) {
				// this is the first pinned content directory
				await this._addFriendsActivityHubIfNeeded(resData, context);
			}
		},

		metadata: async (resData, context) => {
			await this._addFriendReviewsIfNeeded(resData, context);
		},

		metadataRelatedHubs: async (resData, context) => {
			await this._addSimilarItemsHubIfNeeded(resData, context);
		},

		metadataFromProvider: async (resData, context) => {
			await this._addFriendReviewsIfNeeded(resData, context);
		},
	}

	defineRoutes(router: express.Express) {
		// get metadata item(s)
		router.get(`${this.metadata.basePath}/:id`, [
			this.app.middlewares.plexAuthentication,
			this.app.middlewares.plexRequestHandler(async (req: IncomingPlexAPIRequest, res): Promise<plexTypes.PlexMetadataPage> => {
				console.log(`\ngot request for letterboxd item ${req.params.id}`);
				const reqAuthContext = req.plex.authContext;
				const reqUserInfo = req.plex.userInfo;
				const params = req.plex.requestParams;
				const itemIdsStr = req.params.id?.trim();
				if(!itemIdsStr) {
					throw httpError(400, "No slug was provided");
				}
				const ids = itemIdsStr.split(',');
				// get metadatas from letterboxd
				const metadataProvider = this.metadata;
				const resData = await metadataProvider.get(ids, {
					plexServerURL: this.app.plexServerURL,
					plexAuthContext: reqAuthContext,
					plexUserInfo: reqUserInfo,
					includePlexDiscoverMatches: true,
					includeUnmatched: true,
					transformMatchKeys: true,
					metadataBasePath: metadataProvider.basePath,
					qualifiedMetadataIds: false,
					plexParams: params
				});
				// add related hubs if included
				if(params['includeRelated'] == 1) {
					// filter related hubs
					await forArrayOrSingleAsyncParallel(resData.MediaContainer.Metadata, async (metadataItem) => {
						const metadataId = metadataItem.Pseuplex.metadataIds[this.metadata.sourceSlug];
						if(!metadataId) {
							return;
						}
						const metadataIdParts = parsePartialMetadataID(metadataId);
						// add similar items hub
						const metadataProvider = this.metadata;
						const resData = await metadataProvider.getRelatedHubs(metadataId, {
							plexServerURL: this.app.plexServerURL,
							plexAuthContext: reqAuthContext,
							plexUserInfo: reqUserInfo,
						});
						// filter response
						await this.app.filterResponse('metadataRelatedHubsFromProvider', resData, { userReq:req, userRes:res, metadataId:metadataIdParts, metadataProvider });
					});
				}
				// filter page
				await this.app.filterResponse('metadataFromProvider', resData, { userReq:req, userRes:res, metadataProvider });
				// send unavailable notification(s) if needed
				if(resData?.MediaContainer?.Metadata) {
					let metadataItems = resData.MediaContainer.Metadata;
					if(!(metadataItems instanceof Array)) {
						metadataItems = [metadataItems];
					}
					const metadataItemsNotOnServer = metadataItems.filter((item) => !item.Pseuplex.isOnServer);
					if(metadataItemsNotOnServer.length > 0
						&& (params.checkFiles == 1 || params.asyncCheckFiles == 1
							|| params.refreshLocalMediaAgent == 1 || params.asyncRefreshLocalMediaAgent == 1
							|| params.refreshAnalysis == 1 || params.asyncRefreshAnalysis)) {
						setTimeout(() => {
							const userToken = reqAuthContext['X-Plex-Token'];
							const sockets = userToken ? this.app.clientWebSockets[userToken] : null;
							if(sockets && sockets.length > 0) {
								for(const metadataItem of metadataItemsNotOnServer) {
									if(!metadataItem.Pseuplex.isOnServer) {
										console.log(`Sending unavailable notifications for ${metadataItem.key} on ${sockets.length} sockets`);
										sendMediaUnavailableNotifications(sockets, {
											userID: reqUserInfo.serverUserID,
											metadataKey: metadataItem.key
										});
									}
								}
							}
						}, 100);
					}
				}
				return resData;
			})
		]);
		
		// get hubs related to metadata item
		router.get(`${this.metadata.basePath}/:id/related`, [
			this.app.middlewares.plexAuthentication,
			this.app.middlewares.plexRequestHandler(async (req: IncomingPlexAPIRequest, res): Promise<plexTypes.PlexHubsPage> => {
				const id = req.params.id;
				const params = plexTypes.parsePlexHubPageParams(req, {fromListPage:true});
				// add similar items hub
				const metadataProvider = this.metadata;
				const resData = await metadataProvider.getRelatedHubs(id, {
					plexServerURL: this.app.plexServerURL,
					plexAuthContext: req.plex.authContext,
					plexUserInfo: req.plex.userInfo,
					plexParams: params,
				})
				// filter response
				const metadataId = parsePartialMetadataID(id);
				await this.app.filterResponse('metadataRelatedHubsFromProvider', resData, { userReq:req, userRes:res, metadataId, metadataProvider });
				// return response
				return resData;
			})
		]);
		
		// get similar items hub for metadata item
		router.get(`${this.metadata.basePath}/:id/${this.hubs.similar.relativePath}`, [
			this.app.middlewares.plexAuthentication,
			this.app.middlewares.plexRequestHandler(async (req: IncomingPlexAPIRequest, res): Promise<plexTypes.PlexHubsPage> => {
				const id = req.params.id;
				const params = plexTypes.parsePlexHubPageParams(req, {fromListPage:false});
				const hub = await this.hubs.similar.get(id);
				return await hub.getHub(params, this.app.contextForRequest(req));
			})
		]);
		
		// get letterboxd friend activity hub
		router.get(`${this.hubs.userFollowingActivity.basePath}/:letterboxdUsername`, [
			this.app.middlewares.plexAuthentication,
			this.app.middlewares.plexRequestHandler(async (req: IncomingPlexAPIRequest, res): Promise<plexTypes.PlexMetadataPage> => {
				const letterboxdUsername = req.params['letterboxdUsername'];
				if(!letterboxdUsername) {
					throw httpError(400, "No user provided");
				}
				const params = plexTypes.parsePlexHubPageParams(req, {fromListPage:false});
				//console.log(`params: ${JSON.stringify(params)}`);
				const hub = await this.hubs.userFollowingActivity.get(letterboxdUsername);
				return await hub.getHub({
					...params,
					listStartToken: stringParam(req.query['listStartToken'])
				}, this.app.contextForRequest(req));
			})
		]);
	}


	async resolvePlayQueueURI(uri: plexTypes.PlexPlayQueueURIParts, options: PseuplexPlayQueueURIResolverOptions): Promise<(string | false)> {
		if(!uri.path || uri.machineIdentifier != options.plexMachineIdentifier) {
			return false;
		}
		const letterboxdMetadataBasePath = this.metadata.basePath;
		if(!(uri.path.startsWith(letterboxdMetadataBasePath) && uri.path[letterboxdMetadataBasePath.length] == '/')) {
			return false;
		}
		// handle letterboxd uri
		const idsStartIndex = letterboxdMetadataBasePath.length+1;
		let idsEndIndex = uri.path.indexOf('/', idsStartIndex);
		if(idsEndIndex == -1) {
			idsEndIndex = uri.path.length;
		}
		const slugs = uri.path.substring(idsStartIndex, idsEndIndex).split(',');
		// get letterboxd item(s) (resolving the key(s) if needed)
		let metadatas = (await this.metadata.get(slugs, {
			plexServerURL: options.plexServerURL,
			plexAuthContext: options.plexAuthContext,
			plexUserInfo: options.plexUserInfo,
			includePlexDiscoverMatches: false,
			includeUnmatched: false,
			transformMatchKeys: false // keep the resolved key
		})).MediaContainer.Metadata;
		if(!metadatas) {
			return false;
		}
		if(!(metadatas instanceof Array)) {
			metadatas = [metadatas];
		}
		// apply new metadata key(s)
		if(metadatas.length <= 0) {
			return false;
		} else if(metadatas.length == 1) {
			uri.path = `${metadatas[0].key}${uri.path.substring(idsEndIndex)}`;
		} else {
			const metadataIds = metadatas?.map((metadata) => {
				return parseMetadataIDFromKey(metadata.key, '/library/metadata/')?.id
			})?.filter((metadataId) => metadataId);
			if(!metadataIds || metadataIds.length == 0) {
				return false;
			}
			uri.path = `/library/metadata/${metadataIds.join(',')}${uri.path.substring(idsEndIndex)}`;
		}
		const newUri = plexTypes.stringifyPlayQueueURIParts(uri);
		console.log(`mapped uri ${uri} to ${newUri}`);
		return newUri;
	}


	async _addFriendsActivityHubIfNeeded(resData: plexTypes.PlexLibraryHubsPage, context: PseuplexResponseFilterContext): Promise<void> {
		const userInfo = context.userReq.plex.userInfo;
		// get prefs
		const config = this.config;
		const userPrefs = config.perUser[userInfo.email];
		const friendsActvityHubEnabled = userPrefs?.letterboxd?.friendsActivityHubEnabled ?? config.letterboxd?.friendsActivityHubEnabled ?? false;
		// add friends activity feed hub if enabled
		if(friendsActvityHubEnabled && userPrefs?.letterboxd?.username) {
			const params = plexTypes.parsePlexHubPageParams(context.userReq, {fromListPage:true});
			const hub = await this.hubs.userFollowingActivity.get(userPrefs.letterboxd.username);
			const page = await hub.getHubListEntry(params, this.app.contextForRequest(context.userReq));
			if(!resData.MediaContainer.Hub) {
				resData.MediaContainer.Hub = [];
			} else if(!(resData.MediaContainer.Hub instanceof Array)) {
				resData.MediaContainer.Hub = [resData.MediaContainer.Hub];
			}
			resData.MediaContainer.Hub.splice(0, 0, page);
			resData.MediaContainer.size += 1;
		}
	}

	async _addSimilarItemsHubIfNeeded(resData: plexTypes.PlexHubsPage, context: PseuplexResponseFilterContext & {metadataId: PseuplexMetadataIDParts}) {
		const userInfo = context.userReq.plex.userInfo;
		const plexAuthContext = context.userReq.plex.authContext;
		// get prefs
		const config = this.config;
		const userPrefs = config.perUser[userInfo.email];
		// add similar letterboxd movies hub
		if(userPrefs?.letterboxd?.similarItemsEnabled ?? config.letterboxd?.similarItemsEnabled ?? true) {
			const metadataId = context.metadataId;
			let letterboxdId: string | null = null;
			// get plex guid from metadata id
			if(metadataId.source == this.metadata.sourceSlug) {
				letterboxdId = stringifyPartialMetadataID(metadataId);
			} else {
				let plexGuid: string | null = null;
				if(metadataId.source == PseuplexMetadataSource.Plex) {
					plexGuid = stringifyMetadataID({
						...metadataId,
						isURL:true
					});
				} else if(metadataId.source == null) {
					plexGuid = await this.app.plexServerIdToGuidCache.getOrFetch(metadataId.id);
				}
				else {
					// doesn't have a plex metadata ID, so don't bother adding similar items hub
					// TODO try resolving the plex GUID from the metadata provider
					return;
				}
				if(!plexGuid) {
					// no plex GUID to map to a letterboxd id
					return;
				}
				// get letterboxd id for plex guid
				letterboxdId = await this.metadata.getIDForPlexGUID(plexGuid, {
					plexAuthContext
				});
			}
			if(!letterboxdId) {
				return;
			}
			// get letterboxd similar movies hub
			const hub =  await this.hubs.similar.get(letterboxdId);
			const hubPageParams = plexTypes.parsePlexHubPageParams(context.userReq, { fromListPage:true });
			const hubEntry = await hub.getHubListEntry(hubPageParams, this.app.contextForRequest(context.userReq));
			resData.MediaContainer.Hub = pushToArray(resData.MediaContainer.Hub, hubEntry);
			resData.MediaContainer.size = (resData.MediaContainer.size ?? 0) + 1;
			if(resData.MediaContainer.totalSize != null) {
				resData.MediaContainer.totalSize += 1;
			}
		}
		return resData;
	}

	async _addFriendReviewsIfNeeded(resData: PseuplexMetadataPage, context: PseuplexResponseFilterContext) {
		const userInfo = context.userReq.plex.userInfo;
		const plexAuthContext = context.userReq.plex.authContext;
		const reqParams = context.userReq.plex.requestParams;
		// get prefs
		const config = this.config;
		const userPrefs = config.perUser[userInfo.email];
		const letterboxdFriendsReviewsEnabled = (userPrefs?.letterboxd?.friendsReviewsEnabled ?? config.letterboxd?.friendsReviewsEnabled ?? true);
		// attach letterboxd friends reviews if needed
		const letterboxdUsername = userPrefs?.letterboxd?.username;
		if(letterboxdFriendsReviewsEnabled && letterboxdUsername && reqParams?.includeReviews == 1) {
			await forArrayOrSingleAsyncParallel(resData.MediaContainer.Metadata, async (metadataItem) => {
				try {
					// get letterboxd id
					let letterboxdMetadataId: (string | null | undefined) = metadataItem.Pseuplex.metadataIds[this.metadata.sourceSlug];
					if(!letterboxdMetadataId) {
						if(!metadataItem.guid) {
							return;
						}
						letterboxdMetadataId = await this.metadata.getIDForPlexGUID(metadataItem.guid, {
							metadataItem,
							plexAuthContext
						});
						if(!letterboxdMetadataId) {
							return;
						}
					}
					// attach letterboxd friends reviews
					const getFilmOpts = lbTransform.getFilmOptsFromPartialMetadataId(letterboxdMetadataId);
					const friendViewings = await letterboxd.getReviews({
						...getFilmOpts,
						userSlug: letterboxdUsername,
						friends: true
					});
					const reviews = friendViewings.items.map((viewing) => {
						return lbTransform.viewingToPlexReview(viewing);
					});
					if(metadataItem.Review) {
						metadataItem.Review = reviews.concat(metadataItem.Review);
					} else {
						metadataItem.Review = reviews;
					}
				} catch(error) {
					console.error(error);
				}
			});
		}
	}
} as PseuplexPluginClass);
