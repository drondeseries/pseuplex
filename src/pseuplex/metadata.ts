
import { CachedFetcher } from '../fetching/CachedFetcher';
import * as plexTypes from '../plex/types';
import * as plexServerAPI from '../plex/api';
import { removeFileParamsFromMetadataParams } from '../plex/api/serialization';
import { parsePlexMetadataGuid } from '../plex/metadataidentifier';
import {
	PlexClient
} from '../plex/client';
import { PlexGuidToInfoCache } from '../plex/metadata';
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
	PseuplexHubProvider
} from './hub';
import type { PseuplexSection } from './section';
import {
	firstOrSingle,
	forArrayOrSingle,
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
	plexParams?: plexTypes.PlexMetadataChildrenPageParams;
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
	getRelatedHubs(id: string, options: PseuplexHubListParams): Promise<plexTypes.PlexHubsPage>;
}

export type PseuplexSimilarItemsHubProvider = PseuplexHubProvider & {
	relativePath: string
};

export type PseuplexMetadataProviderOptions = {
	basePath: string;
	section?: PseuplexSection;
	plexMetadataClient: PlexClient;
	similarItemsHubProvider?: PseuplexSimilarItemsHubProvider;
	plexGuidToInfoCache?: PlexGuidToInfoCache;
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
	abstract readonly sourceDisplayName: string;
	abstract readonly sourceSlug: string;

	readonly basePath: string;
	readonly section?: PseuplexSection;
	readonly plexMetadataClient: PlexClient;
	readonly similarItemsHubProvider?: PseuplexSimilarItemsHubProvider | undefined;

	readonly idToPlexGuidCache: CachedFetcher<string>;
	readonly plexGuidToIDCache: CachedFetcher<string>;
	readonly plexGuidToInfoCache?: PlexGuidToInfoCache;

	constructor(options: PseuplexMetadataProviderOptions) {
		this.basePath = options.basePath;
		this.section = options.section;
		this.plexMetadataClient = options.plexMetadataClient;
		this.similarItemsHubProvider = options.similarItemsHubProvider;
		this.idToPlexGuidCache = new CachedFetcher(async (id: string) => {
			throw new Error("Cannot fetch guid from cache");
		});
		this.plexGuidToIDCache = new CachedFetcher(async (id: string) => {
			throw new Error("Cannot fetch id from cache");
		});
		this.plexGuidToInfoCache = options.plexGuidToInfoCache;
	}
	
	abstract fetchMetadataItem(id: PseuplexPartialMetadataIDString, options: {
		plexServerURL: string,
		plexAuthContext: plexTypes.PlexAuthContext,
		plexParams?: plexTypes.PlexMetadataPageParams
	}): Promise<TMetadataItem>;
	fetchMetadataItemChildren?: (id: PseuplexPartialMetadataIDString, options: {
		plexServerURL: string,
		plexAuthContext: plexTypes.PlexAuthContext,
		plexParams?: plexTypes.PlexMetadataChildrenPageParams
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
			const matchingMetadata = await findMatchingPlexMediaItem(this.plexMetadataClient, {
				...matchParams,
				authContext: options.plexAuthContext
			});
			const plexGuid = matchingMetadata?.guid;
			if(!plexGuid) {
				return null;
			}
			this.plexGuidToIDCache.setSync(plexGuid, id);
			if(this.plexGuidToInfoCache) {
				this.plexGuidToInfoCache.cacheMetadataItem(matchingMetadata);
			}
			return plexGuid;
		})());
	}
	async attachPlexDataIfAble(metadataId: PseuplexPartialMetadataIDString, metadataItem: plexTypes.PlexMetadataItem, options: {
		plexServerURL: string;
		plexAuthContext: plexTypes.PlexAuthContext
	}): Promise<plexTypes.PlexMetadataItem> {
		try {
			// get plex guid
			const plexGuid = (options.plexAuthContext?.['X-Plex-Token']) ?
				await this.getPlexGUIDForID(metadataId, {
					plexServerURL: options.plexServerURL,
					plexAuthContext: options.plexAuthContext
				})
				: await this.idToPlexGuidCache.get(metadataId);
			// attach plex guid if able
			if(plexGuid) {
				metadataItem.guid = plexGuid;
				const guidParts = parsePlexMetadataGuid(plexGuid);
				if(guidParts.type) {
					metadataItem.type = guidParts.type as plexTypes.PlexMediaItemType;
				}
			}
			// attach additional metadata if able
			const plexInfo = await this.plexGuidToInfoCache?.getOrFetch(plexGuid);
			if(plexInfo) {
				metadataItem.slug = plexInfo.slug;
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
			const guidParts = parsePlexMetadataGuid(plexGuid);
			const metadataTask = this.plexMetadataClient.getMetadata(guidParts.id, {}, {
				authContext: options.plexAuthContext
			}).then((result) => {
				const metadatas = result?.MediaContainer?.Metadata;
				return (metadatas instanceof Array) ? metadatas[0] : metadatas;
			});
			this.plexGuidToInfoCache.cacheMetadataItemForGuid(plexGuid, metadataTask);
			metadataItem = await metadataTask;
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
		const plextvMetadataParams = removeFileParamsFromMetadataParams(options.plexParams);
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
				// find matching plex metadata for metadata item
				const metadataTask = (async () => {
					const item = await itemTask;
					const matchParams = this.getPlexMatchParams(item);
					if(!matchParams) {
						return null;
					}
					const metadataItem = await findMatchingPlexMediaItem(this.plexMetadataClient, {
						...matchParams,
						authContext: options.plexAuthContext
					});
					if(!metadataItem?.ratingKey) {
						return metadataItem;
					}
					// TODO check if we even need to fetch this again?
					const detailedMetadataItem = firstOrSingle((await this.plexMetadataClient.getMetadata(metadataItem.ratingKey, plextvMetadataParams, {
						authContext: options.plexAuthContext
					})).MediaContainer?.Metadata);
					// cache metadata info
					if(this.plexGuidToInfoCache) {
						this.plexGuidToInfoCache.cacheMetadataItem(detailedMetadataItem);
					}
					return detailedMetadataItem;
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
							plexMetadataMap[matchMetadata.guid] = extPlexTransform.transformExternalPlexMetadata(matchMetadata, this.plexMetadataClient.serverURL, externalPlexTransformOpts);
						}
					}
				}
			}
			// get any remaining guids from plex discover
			const remainingGuids = guidsToFetch.filter((guid) => !plexMetadataMap[guid]);
			if(remainingGuids.length > 0) {
				const discoverTask = this.plexMetadataClient.getMetadata(remainingGuids.map((guid) => parsePlexMetadataGuid(guid).id), plextvMetadataParams, {
					authContext: options.plexAuthContext,
				});
				// cache result if needed
				if(this.plexGuidToInfoCache) {
					const guidMapTask = discoverTask.then((result) => {
						const guidMap: {[key: string]: plexTypes.PlexMetadataItem} = {};
						forArrayOrSingle(result.MediaContainer.Metadata, (metadataItem) => {
							if(metadataItem.guid) {
								guidMap[metadataItem.guid] = metadataItem;
							}
						});
						return guidMap;
					});
					for(const guid of remainingGuids) {
						this.plexGuidToInfoCache.cacheMetadataItemForGuid(guid, guidMapTask.then((guidMap) => guidMap[guid]));
					}
				}
				// get discover result and store in metadata map
				const discoverResult = await discoverTask;
				let metadatas = discoverResult?.MediaContainer.Metadata;
				if(metadatas) {
					if(!(metadatas instanceof Array)) {
						metadatas = [metadatas];
					}
					for(const metadata of metadatas) {
						if(metadata.guid) {
							plexMetadataMap[metadata.guid] = extPlexTransform.transformExternalPlexMetadata(metadata, this.plexMetadataClient.serverURL, externalPlexTransformOpts);
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
					// get full metadata id
					const idParts = parsePartialMetadataID(id);
					const fullMetadataId = stringifyMetadataID({
						...idParts,
						source: this.sourceSlug,
						isURL: false
					});
					// transform keys back to the original key used to fetch this item
					let metadataId: string;
					if(transformOpts.qualifiedMetadataId) {
						metadataId = fullMetadataId;
					} else {
						metadataId = id;
					}
					metadataItem.key = `${transformOpts.metadataBasePath}/${metadataId}`;
					//metadataItem.slug = fullMetadataId;
					if(!metadataItem.Pseuplex.isOnServer) {
						metadataItem.ratingKey = fullMetadataId;
					}
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
				...(this.section ? {
					librarySectionID: this.section.id,
					librarySectionTitle: this.section.title,
					librarySectionUUID: this.section.uuid
				} : undefined),
				Metadata: metadatas
			}
		};
	}

	async getChildren(id: PseuplexPartialMetadataIDString, options: PseuplexMetadataChildrenProviderParams): Promise<PseuplexMetadataPage> {
		if(!this.fetchMetadataItemChildren) {
			if(options.includeDiscoverMatches && this.plexMetadataClient) {
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
					const mappedMetadataPage = await this.plexMetadataClient.getMetadataChildren(plexGuidParts.id, options.plexParams, {
						authContext: options.plexAuthContext
					});
					mappedMetadataPage.MediaContainer.Metadata = await transformArrayOrSingleAsyncParallel(mappedMetadataPage.MediaContainer.Metadata, async (metadataItem) => {
						return extPlexTransform.transformExternalPlexMetadata(metadataItem, this.plexMetadataClient.serverURL, extPlexTransformOpts);
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
			plexParams: options.plexParams
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

	async getRelatedHubs(id: string, options: PseuplexHubListParams): Promise<plexTypes.PlexHubsPage> {
		const hubEntries: plexTypes.PlexHubWithItems[] = [];
		if(this.similarItemsHubProvider) {
			const hub = await this.similarItemsHubProvider.get(id);
			const hubListEntry = await hub.getHubListEntry(options.plexParams ?? {}, {
				plexServerURL: options.plexServerURL,
				plexAuthContext: options.plexAuthContext
			});
			hubEntries.push(hubListEntry);
		}
		return {
			MediaContainer: {
				size: hubEntries.length,
				totalSize: hubEntries.length,
				identifier: plexTypes.PlexPluginIdentifier.PlexAppLibrary,
				Hub: hubEntries
			}
		};
	}
}
