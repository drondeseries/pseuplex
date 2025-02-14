
import { CachedFetcher } from '../fetching/CachedFetcher';
import * as plexTypes from '../plex/types';
import * as plexServerAPI from '../plex/api';
import { parsePlexMetadataGuid } from '../plex/metadataidentifier';
import * as plexDiscoverAPI from '../plexdiscover';
import * as extPlexTransform from './externalplex/transform';
import {
	PseuplexMetadataItem,
	PseuplexMetadataPage
} from './types';
import {
	findMatchingPlexMediaItem,
	PlexMediaItemMatchParams
} from './matching';
import {
	parsePartialMetadataID,
	PseuplexPartialMetadataIDString,
	stringifyMetadataID
} from './metadataidentifier';
import {
	pseuplexHubPageParamsFromHubListParams,
	PseuplexHubProvider
} from './hub';
import {
	firstOrSingle,
	HttpError,
	transformArrayOrSingleAsyncParallel
} from '../utils';


export type PseuplexMetadataParams = {
	plexServerURL: string;
	plexAuthContext: plexTypes.PlexAuthContext;
	includeDiscoverMatches?: boolean;
	includeUnmatched?: boolean;
	transformMatchKeys?: boolean;
	metadataBasePath?: string;
	qualifiedMetadataIds?: boolean;
	plexParams?: plexTypes.PlexMetadataPageParams;
};

export type PseuplexMetadataChildrenParams = {
	plexServerURL: string;
	plexAuthContext: plexTypes.PlexAuthContext;
	includeDiscoverMatches?: boolean;
	plexParams?: plexTypes.PlexMetadataPageParams;
	start: number;
	count: number;
};

export type PseuplexHubListParams = {
	plexParams?: plexTypes.PlexHubListPageParams;
	plexServerURL: string;
	plexAuthContext: plexTypes.PlexAuthContext;
};

export type PseuplexMetadataProviderParams = PseuplexMetadataParams & {
	transformMetadataItem?: (metadataItem: PseuplexMetadataItem, id: PseuplexPartialMetadataIDString, provider: PseuplexMetadataProvider) => PseuplexMetadataItem | Promise<PseuplexMetadataItem>;
};

export type PseuplexMetadataChildrenProviderParams = PseuplexMetadataChildrenParams;

export interface PseuplexMetadataProvider {
	readonly sourceSlug: string;
	readonly basePath: string;
	get(ids: string[], options: PseuplexMetadataProviderParams): Promise<PseuplexMetadataPage>;
	getChildren(id: string, options: PseuplexMetadataChildrenProviderParams): Promise<PseuplexMetadataPage>;
	getRelatedHubs?: (id: string, options: PseuplexHubListParams) => Promise<plexTypes.PlexHubsPage>;
}

export type PseuplexSimilarItemsHubProvider = PseuplexHubProvider & {
	relativePath: string
};

export type PseuplexMetadataProviderOptions = {
	basePath: string;
	similarItemsHubProvider?: PseuplexSimilarItemsHubProvider;
};

export type PseuplexMetadataTransformOptions = {
	qualifiedMetadataId: boolean;
	metadataBasePath: string;
};

export type PseuplexMetadataListPage<TMetadataItem> = {
	offset: number;
	totalItemCount: number;
	items: TMetadataItem[];
};

export abstract class PseuplexMetadataProviderBase<TMetadataItem> implements PseuplexMetadataProvider {
	abstract readonly sourceSlug: string;
	readonly basePath: string;
	readonly similarItemsHubProvider?: PseuplexSimilarItemsHubProvider | undefined;

	readonly idToPlexGuidCache: CachedFetcher<string>;
	readonly plexGuidToIDCache: CachedFetcher<string>;

	constructor(options: PseuplexMetadataProviderOptions) {
		this.basePath = options.basePath;
		this.similarItemsHubProvider = options.similarItemsHubProvider;
		this.idToPlexGuidCache = new CachedFetcher(async (id: string) => {
			throw new Error("Cannot fetch guid from cache");
		});
		this.plexGuidToIDCache = new CachedFetcher(async (id: string) => {
			throw new Error("Cannot fetch id from cache");
		});
	}
	
	abstract fetchMetadataItem(id: PseuplexPartialMetadataIDString, options: {
		plexServerURL: string,
		plexAuthContext: plexTypes.PlexAuthContext,
		plexParams?: plexTypes.PlexMetadataPageParams
	}): Promise<TMetadataItem>;
	fetchMetadataItemChildren?: (id: PseuplexPartialMetadataIDString, options: {
		plexServerURL: string,
		plexAuthContext: plexTypes.PlexAuthContext,
		plexParams?: plexTypes.PlexMetadataPageParams,
		start?: number,
		count?: number
	}) => Promise<PseuplexMetadataListPage<TMetadataItem>>;
	abstract transformMetadataItem(metadataItem: TMetadataItem, options: PseuplexMetadataTransformOptions): PseuplexMetadataItem;
	abstract idFromMetadataItem(metadataItem: TMetadataItem): PseuplexPartialMetadataIDString;
	
	abstract getPlexMatchParams(metadataItem: TMetadataItem): PlexMediaItemMatchParams;
	async getPlexGUIDForID(id: PseuplexPartialMetadataIDString, options: {
		plexServerURL: string;
		plexAuthContext: plexTypes.PlexAuthContext
	}): Promise<string> {
		let plexGuid = this.idToPlexGuidCache.get(id);
		if(plexGuid || plexGuid === null) {
			return await plexGuid;
		}
		// get provider metadata item
		return await this.idToPlexGuidCache.set(id, (async () => {
			const item = await this.fetchMetadataItem(id, {
				plexServerURL: options.plexServerURL,
				plexAuthContext: options.plexAuthContext
			});
			const matchParams = this.getPlexMatchParams(item);
			if(!matchParams) {
				return null;
			}
			const matchingMetadata = await findMatchingPlexMediaItem({
				...matchParams,
				authContext: options.plexAuthContext
			});
			const plexGuid = matchingMetadata?.guid;
			if(!plexGuid) {
				return null;
			}
			this.plexGuidToIDCache.setSync(plexGuid, id);
			return plexGuid;
		})());
	}
	async attachPlexDataIfAble(metadataId: PseuplexPartialMetadataIDString, metadataItem: plexTypes.PlexMetadataItem, options: {
		plexServerURL: string;
		plexAuthContext: plexTypes.PlexAuthContext
	}): Promise<plexTypes.PlexMetadataItem> {
		try {
			const plexGuid = (options.plexAuthContext?.['X-Plex-Token']) ?
				await this.getPlexGUIDForID(metadataId, {
					plexServerURL: options.plexServerURL,
					plexAuthContext: options.plexAuthContext
				})
				: await this.idToPlexGuidCache.get(metadataId);
			if(plexGuid) {
				metadataItem.guid = plexGuid;
			}
		} catch(error) {
			console.error(error);
		}
		return metadataItem;
	}

	abstract findMatchForPlexItem(metadataItem: plexTypes.PlexMetadataItem): Promise<TMetadataItem | null>;
	async getIDForPlexItem(metadataItem: plexTypes.PlexMetadataItem): Promise<PseuplexPartialMetadataIDString | null> {
		// try to get ID from cache
		const plexGuid = metadataItem.guid;
		if(plexGuid) {
			const id = await this.plexGuidToIDCache.get(plexGuid);
			if(id) {
				return id;
			} else if(id === null) {
				return null;
			}
		}
		// find match
		const result = await this.findMatchForPlexItem(metadataItem);
		if(!result) {
			return null;
		}
		return this.idFromMetadataItem(result);
	}
	async getIDForPlexGUID(plexGuid: string, options: {
		metadataItem?: plexTypes.PlexMetadataItem;
		plexAuthContext: plexTypes.PlexAuthContext
	}): Promise<PseuplexPartialMetadataIDString> {
		// try to get id from cache
		const id = await this.plexGuidToIDCache.get(plexGuid);
		if(id) {
			return id;
		} else if(id === null) {
			return null;
		}
		// get metadata item
		let metadataItem = options.metadataItem;
		if(!metadataItem) {
			const metadatas = (await plexDiscoverAPI.getLibraryMetadata(plexGuid, {
				authContext: options.plexAuthContext
			}))?.MediaContainer?.Metadata;
			metadataItem = (metadatas instanceof Array) ? metadatas[0] : metadatas;
		}
		if(!metadataItem) {
			throw new Error("Metadata not found");
		}
		// find match
		const result = await this.findMatchForPlexItem(metadataItem);
		if(!result) {
			return null;
		}
		return this.idFromMetadataItem(result);
	}

	async get(ids: PseuplexPartialMetadataIDString[], options: PseuplexMetadataProviderParams): Promise<PseuplexMetadataPage> {
		const plexGuids: {[id: PseuplexPartialMetadataIDString]: Promise<string> | string | null} = {};
		const plexMatches: {[id: PseuplexPartialMetadataIDString]: (Promise<plexTypes.PlexMetadataItem> | plexTypes.PlexMetadataItem | null)} = {};
		const providerItems: {[id: PseuplexPartialMetadataIDString]: TMetadataItem | Promise<TMetadataItem>} = {};
		const transformOpts: PseuplexMetadataTransformOptions = {
			qualifiedMetadataId: options.qualifiedMetadataIds ?? false,
			metadataBasePath: options.metadataBasePath ?? this.basePath
		};
		const externalPlexTransformOpts: PseuplexMetadataTransformOptions = {
			qualifiedMetadataId: true,
			metadataBasePath: '/library/metadata'
		};
		// process each id
		for(const id of ids) {
			if(id in plexGuids) {
				// already got the mapping for this ID (ie there was a repeat ID in this query)
				continue;
			}
			// check if matching GUID exists for provider metadata id
			let plexGuid = this.idToPlexGuidCache.get(id);
			if(plexGuid || plexGuid === null) {
				plexGuids[id] = plexGuid;
			}
			if(plexGuid) {
				// already have the mapping between ID and plex guid, so no need to fetch from provider (can get metadata from server or plex discover)
				continue;
			}
			// get raw metadata item from provider
			const itemTask = providerItems[id] ?? this.fetchMetadataItem(id, {
				plexServerURL: options.plexServerURL,
				plexAuthContext: options.plexAuthContext,
				plexParams: options.plexParams
			});
			providerItems[id] = itemTask;
			if(plexGuid !== null) {
				// find matching plex GUID for metadata item
				const metadataTask = (async () => {
					const item = await itemTask;
					const matchParams = this.getPlexMatchParams(item);
					if(!matchParams) {
						return null;
					}
					return await findMatchingPlexMediaItem({
						...matchParams,
						authContext: options.plexAuthContext,
						params: options.plexParams
					});
				})();
				const guidTask = metadataTask.then((m) => (m?.guid ?? null));
				plexMatches[id] = metadataTask;
				plexGuids[id] = this.idToPlexGuidCache.set(id, guidTask.then((guid) => {
					if(guid) {
						this.plexGuidToIDCache.setSync(id, guid);
					}
					return guid;
				}));
			}
		}
		// wait for all GUIDs to be fetched
		const guidsToFetch = (await Promise.all(Object.values(plexGuids))).filter((guid) => guid);
		// map guids to items on the plex server
		const plexMetadataMap: {[guid: string]: PseuplexMetadataItem} = {};
		let serverResult: plexTypes.PlexMetadataPage | undefined = undefined;
		if(guidsToFetch.length > 0) {
			try {
				// get metadata items from plex server
				serverResult = await plexServerAPI.getLibraryMetadata(guidsToFetch, {
					serverURL: options.plexServerURL,
					authContext: options.plexAuthContext,
					params: options.plexParams
				});
			} catch(error) {
				if((error as HttpError).statusCode != 404) {
					console.warn(error);
				}
			}
			let metadatas = serverResult?.MediaContainer.Metadata;
			if(metadatas) {
				if(!(metadatas instanceof Array)) {
					metadatas = [metadatas];
				}
				for(const metadata of metadatas) {
					if(metadata.guid) {
						const pseuMetadata = metadata as PseuplexMetadataItem;
						pseuMetadata.Pseuplex = {
							isOnServer: true,
							metadataIds: {},
							plexMetadataIds: {}
						};
						plexMetadataMap[metadata.guid] = pseuMetadata;
					}
				}
			}
		}
		// map items to plex discover metadata if allowed
		if(options.includeDiscoverMatches ?? true) {
			// fill any missing items in plexMetadataMap with values from plexMatches
			for(const id of ids) {
				const guid = await plexGuids[id];
				if(guid) {
					if(!plexMetadataMap[guid]) {
						const matchMetadata = await plexMatches[id];
						if(matchMetadata?.guid && !plexMetadataMap[matchMetadata.guid]) {
							plexMetadataMap[matchMetadata.guid] = extPlexTransform.transformExternalPlexMetadata(matchMetadata, plexDiscoverAPI.BASE_URL, externalPlexTransformOpts);
						}
					}
				}
			}
			// get any remaining guids from plex discover
			const remainingGuids = guidsToFetch.filter((guid) => !plexMetadataMap[guid]);
			if(remainingGuids.length > 0) {
				const discoverResult = await plexDiscoverAPI.getLibraryMetadata(remainingGuids.map((guid) => parsePlexMetadataGuid(guid)?.id), {
					authContext: options.plexAuthContext,
					params: options.plexParams
				});
				let metadatas = discoverResult?.MediaContainer.Metadata;
				if(metadatas) {
					if(!(metadatas instanceof Array)) {
						metadatas = [metadatas];
					}
					for(const metadata of metadatas) {
						if(metadata.guid) {
							plexMetadataMap[metadata.guid] = extPlexTransform.transformExternalPlexMetadata(metadata, plexDiscoverAPI.BASE_URL, externalPlexTransformOpts);
						}
					}
				}
			}
		}
		// get all results
		const metadatas = (await Promise.all(ids.map(async (id) => {
			const guid = await plexGuids[id];
			let metadataItem = guid ? plexMetadataMap[guid] : null;
			if(metadataItem) {
				// attach provider ID to metadata item
				metadataItem.Pseuplex.metadataIds[this.sourceSlug] = id;
				// transform metadata item key if needed
				if(options.transformMatchKeys || !metadataItem.Pseuplex.isOnServer) {
					// transform keys back to the original key used to fetch this item
					let metadataId: string;
					if(transformOpts.qualifiedMetadataId) {
						const idParts = parsePartialMetadataID(id);
						metadataId = stringifyMetadataID({
							...idParts,
							source: this.sourceSlug,
							isURL: false
						});
					} else {
						metadataId = id;
					}
					metadataItem.key = `${transformOpts.metadataBasePath}/${metadataId}`;
				}
			} else if(options.includeUnmatched ?? true) {
				// get or fetch the metadata item
				let providerMetadataItemTask = providerItems[id];
				if(!providerMetadataItemTask) {
					// fetch the raw metadata item, since we may have skipped this step earlier in anticipation of a guid match
					providerMetadataItemTask = this.fetchMetadataItem(id, {
						plexServerURL: options.plexServerURL,
						plexAuthContext: options.plexAuthContext,
						plexParams: options.plexParams
					});
					providerItems[id] = providerMetadataItemTask;
				}
				const providerMetadataItem = await providerMetadataItemTask;
				metadataItem = this.transformMetadataItem(providerMetadataItem, transformOpts);
			} else {
				return null;
			}
			// transform metadata item
			if(options.transformMetadataItem) {
				metadataItem = await options.transformMetadataItem(metadataItem, id, this);
			}
			return metadataItem;
		}))).filter((metadata) => metadata);
		// done
		return {
			MediaContainer: {
				size: metadatas.length,
				allowSync: false,
				identifier: plexTypes.PlexPluginIdentifier.PlexAppLibrary,
				// TODO include library section info
				Metadata: metadatas
			}
		};
	}

	async getChildren(id: PseuplexPartialMetadataIDString, options: PseuplexMetadataChildrenProviderParams): Promise<PseuplexMetadataPage> {
		if(!this.fetchMetadataItemChildren) {
			if(options.includeDiscoverMatches) {
				const extPlexTransformOpts: PseuplexMetadataTransformOptions = {
					qualifiedMetadataId: true,
					metadataBasePath: '/library/metadata'
				};
				const metadataItemsPage = await this.get([id], {
					plexServerURL: options.plexServerURL,
					plexAuthContext: options.plexAuthContext,
					includeDiscoverMatches: true,
					includeUnmatched: false
				});
				const metadataItem = firstOrSingle(metadataItemsPage.MediaContainer?.Metadata);
				if(metadataItem?.guid) {
					const plexGuidParts = parsePlexMetadataGuid(metadataItem.guid);
					const mappedMetadataPage = await plexDiscoverAPI.getLibraryMetadataChildren(plexGuidParts.id, {
						authContext: options.plexAuthContext,
						params: options.plexParams
					});
					mappedMetadataPage.MediaContainer.Metadata = await transformArrayOrSingleAsyncParallel(mappedMetadataPage.MediaContainer.Metadata, async (metadataItem) => {
						return extPlexTransform.transformExternalPlexMetadata(metadataItem, plexDiscoverAPI.BASE_URL, extPlexTransformOpts);
					});
					return mappedMetadataPage as PseuplexMetadataPage;
				}
			}
			return {
				MediaContainer: {
					size: 0,
					Metadata: []
				}
			};
		}
		const transformOpts: PseuplexMetadataTransformOptions = {
			qualifiedMetadataId: false,
			metadataBasePath: this.basePath
		};
		const childItemsPage = await this.fetchMetadataItemChildren(id, {
			plexServerURL: options.plexServerURL,
			plexAuthContext: options.plexAuthContext,
			plexParams: options.plexParams,
			start: options.start,
			count: options.count
		});
		return {
			MediaContainer: {
				offset: childItemsPage.offset,
				size: childItemsPage.items?.length ?? 0,
				totalSize: childItemsPage.totalItemCount,
				Metadata: childItemsPage.items.map((metadataItem) => {
					let pseuMetadataItem = this.transformMetadataItem(metadataItem, transformOpts);
					return pseuMetadataItem;
				})
			}
		};
	}

	get getRelatedHubs() {
		const hubProvider = this.similarItemsHubProvider;
		if(!hubProvider) {
			return undefined;
		}
		return async (id: string, options: PseuplexHubListParams): Promise<plexTypes.PlexHubsPage> => {
			const params = pseuplexHubPageParamsFromHubListParams(options.plexParams);
			const hub = await hubProvider.get(id);
			return await hub.getHub(params, {
				plexServerURL: options.plexServerURL,
				plexAuthContext: options.plexAuthContext
			});
		};
	}
}
