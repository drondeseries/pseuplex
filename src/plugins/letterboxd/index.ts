import express from 'express';
import * as letterboxd from 'letterboxd-retriever';
import * as plexTypes from '../../plex/types';
import {
	IncomingPlexAPIRequest,
	plexAPIRequestHandler
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
	PseuplexConfigBase,
	PseuplexSimilarItemsHubProvider,
	sendMediaUnavailableNotifications,
	stringifyMetadataID
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

type LetterboxdFlags = {
	letterboxdSimilarItemsEnabled?: boolean;
	letterboxdFriendsActivityHubEnabled?: boolean;
	letterboxdFriendsReviewsEnabled?: boolean;
};
type LetterboxdPerUserPluginConfig = {
	letterboxdUsername?: string;
} & LetterboxdFlags;
export type LetterboxdPluginConfig = (PseuplexConfigBase<LetterboxdPerUserPluginConfig> & LetterboxdFlags);

export default (class LetterboxdPlugin implements PseuplexPlugin {
	static slug = 'letterboxd';
	readonly slug: string = LetterboxdPlugin.slug;
	readonly app: PseuplexApp;
	readonly metadata: LetterboxdMetadataProvider;
	readonly hubs: {
		readonly userFollowingActivity: PseuplexHubProvider & {readonly path: string};
		readonly similar: PseuplexSimilarItemsHubProvider;
	};


	constructor(app: PseuplexApp) {
		this.app = app;
		const self = this;

		// create hub providers
		this.hubs = {
			userFollowingActivity: new class extends PseuplexHubProvider {
				readonly path = `${self.basePath}/hubs/following`;
				override fetch(letterboxdUsername: string): PseuplexHub | Promise<PseuplexHub> {
					// TODO validate that the profile exists
					return createUserFollowingFeedHub(letterboxdUsername, {
						hubPath: `${this.path}?letterboxdUsername=${letterboxdUsername}`,
						style: plexTypes.PlexHubStyle.Shelf,
						promoted: true,
						uniqueItemsOnly: true,
						letterboxdMetadataProvider: self.metadata
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
						defaultCount: 12
					});
				}
			}()
		};

		// create metadata provider
		this.metadata = new LetterboxdMetadataProvider({
			basePath: `${this.basePath}/metadata`,
			similarItemsHubProvider: this.hubs.similar
		});
	}

	get basePath(): string {
		return `/${this.app.slug}/${this.slug}`;
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
			const contentDirectoryID = context.userReq.query['contentDirectoryID'];
			const pinnedContentDirIds = (typeof pinnedContentDirectoryID == 'string') ? pinnedContentDirectoryID.split(',') : pinnedContentDirectoryID;
			if(!pinnedContentDirIds || pinnedContentDirIds.length == 0 || !contentDirectoryID || contentDirectoryID == pinnedContentDirIds[0]) {
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
			plexAPIRequestHandler(async (req: IncomingPlexAPIRequest, res): Promise<plexTypes.PlexMetadataPage> => {
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
					includeDiscoverMatches: true,
					includeUnmatched: true,
					transformMatchKeys: true,
					metadataBasePath: metadataProvider.basePath,
					qualifiedMetadataIds: false,
					plexParams: params
				});
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
							const sockets = this.app.clientWebSockets[reqAuthContext['X-Plex-Token']];
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
			plexAPIRequestHandler(async (req: IncomingPlexAPIRequest, res): Promise<plexTypes.PlexHubsPage> => {
				const id = req.params.id;
				const params = plexTypes.parsePlexHubPageParams(req, {fromListPage:true});
				const hubs: plexTypes.PlexHubWithItems[] = [];
				// add similar items hub
				const hub = await this.hubs.similar.get(id);
				const hubEntry = await hub.getHubListEntry(params, {
					plexServerURL: this.app.plexServerURL,
					plexAuthContext: req.plex.authContext
				});
				hubs.push(hubEntry);
				return {
					MediaContainer: {
						size: hubs.length,
						identifier: plexTypes.PlexPluginIdentifier.PlexAppLibrary,
						Hub: hubs
					}
				};
			})
		]);
		
		// get similar items hub for metadata item
		router.get(`${this.metadata.basePath}/:id/${this.hubs.similar.relativePath}`, [
			this.app.middlewares.plexAuthentication,
			plexAPIRequestHandler(async (req: IncomingPlexAPIRequest, res): Promise<plexTypes.PlexHubsPage> => {
				const id = req.params.id;
				const params = plexTypes.parsePlexHubPageParams(req, {fromListPage:false});
				const hub = await this.hubs.similar.get(id);
				return await hub.getHub(params, {
					plexServerURL: this.app.plexServerURL,
					plexAuthContext: req.plex.authContext
				});
			})
		]);
		
		// get letterboxd friend activity hub
		router.get(this.hubs.userFollowingActivity.path, [
			this.app.middlewares.plexAuthentication,
			plexAPIRequestHandler(async (req: IncomingPlexAPIRequest, res): Promise<plexTypes.PlexMetadataPage> => {
				const letterboxdUsername = stringParam(req.query['letterboxdUsername']);
				if(!letterboxdUsername) {
					throw httpError(400, "No user provided");
				}
				const params = plexTypes.parsePlexHubPageParams(req, {fromListPage:false});
				const hub = await this.hubs.userFollowingActivity.get(letterboxdUsername);
				return await hub.getHub({
					...params,
					listStartToken: stringParam(req.query['listStartToken'])
				}, {
					plexServerURL: this.app.plexServerURL,
					plexAuthContext: req.plex.authContext
				});
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
			includeDiscoverMatches: false,
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
		const friendsActvityHubEnabled = userPrefs?.letterboxdFriendsActivityHubEnabled ?? config.letterboxdFriendsActivityHubEnabled ?? true;
		// add friends activity feed hub if enabled
		if(friendsActvityHubEnabled && userPrefs?.letterboxdUsername) {
			const params = plexTypes.parsePlexHubPageParams(context.userReq, {fromListPage:true});
			const hub = await this.hubs.userFollowingActivity.get(userPrefs.letterboxdUsername);
			const page = await hub.getHubListEntry(params, {
				plexServerURL: this.app.plexServerURL,
				plexAuthContext: context.userReq.plex.authContext
			});
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
		if(userPrefs?.letterboxdSimilarItemsEnabled ?? config.letterboxdSimilarItemsEnabled ?? true) {
			const metadataId = context.metadataId;
			// get plex guid from metadata id
			let plexGuid: string;
			if(metadataId.source == PseuplexMetadataSource.Plex) {
				plexGuid = stringifyMetadataID({
					...metadataId,
					isURL:true
				});
			} else if(metadataId.source == null) {
				plexGuid = await this.app.plexServerIdToGuidCache.getOrFetch(metadataId.id);
			} else {
				return;
			}
			if(!plexGuid) {
				return;
			}
			// get letterboxd id for plex guid
			const letterboxdId = await this.metadata.getIDForPlexGUID(plexGuid, {
				plexAuthContext
			});
			if(!letterboxdId) {
				return;
			}
			// get letterboxd similar movies hub
			const hub =  await this.hubs.similar.get(letterboxdId);
			const hubPageParams = plexTypes.parsePlexHubPageParams(context.userReq, { fromListPage:true });
			const hubEntry = await hub.getHubListEntry(hubPageParams, {
				plexServerURL: this.app.plexServerURL,
				plexAuthContext
			});
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
		const letterboxdFriendsReviewsEnabled = (userPrefs?.letterboxdFriendsReviewsEnabled ?? config.letterboxdFriendsReviewsEnabled ?? true);
		// attach letterboxd friends reviews if needed
		const letterboxdUsername = userPrefs?.letterboxdUsername;
		if(letterboxdFriendsReviewsEnabled && letterboxdUsername && reqParams?.includeReviews == 1) {
			await forArrayOrSingleAsyncParallel(resData.MediaContainer.Metadata, async (metadataItem) => {
				try {
					// get letterboxd id
					let letterboxdMetadataId = metadataItem.Pseuplex.metadataIds[this.metadata.sourceSlug];
					if(!letterboxdMetadataId) {
						if(!metadataItem.guid) {
							return;
						}
						letterboxdMetadataId = await this.metadata.getIDForPlexGUID(metadataItem.guid, {
							metadataItem,
							plexAuthContext
						});
					}
					if(!letterboxdMetadataId) {
						return;
					}
					// attach letterboxd friends reviews
					const getFilmOpts = lbTransform.getFilmOptsFromPartialMetadataId(letterboxdMetadataId);
					const friendViewings = await letterboxd.getFriendsReviews({
						...getFilmOpts,
						username: letterboxdUsername
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
