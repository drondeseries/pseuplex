
import { CachedFetcher } from '../fetching/CachedFetcher';
import * as plexTypes from './types';
import * as plexServerAPI from './api';
import { PlexClient, PlexClientMethodOptions } from './client';
import { forArrayOrSingle, httpError } from '../utils';
import { parsePlexMetadataGuid } from './metadataidentifier';

export const createPlexServerIdToGuidCache = (options: {
	plexServerURL: string;
	plexAuthContext: plexTypes.PlexAuthContext;
}) => {
	return new CachedFetcher(async (id: string) => {
		let metadatas = (await plexServerAPI.getLibraryMetadata(id, {
			serverURL: options.plexServerURL,
			authContext: options.plexAuthContext
		}))?.MediaContainer?.Metadata;
		let metadata: plexTypes.PlexMetadataItem;
		if(metadatas instanceof Array) {
			metadata = metadatas[0];
		} else {
			metadata = metadatas;
		}
		if(!metadata) {
			throw httpError(404, "Not Found");
		}
		return metadata.guid;
	});
};


export class PlexGuidToInfoCache extends CachedFetcher<{
	slug?: string;
	parentSlug?: string;
	grandparentSlug?: string;
}> {
	plexMetadataClient: PlexClient;

	constructor(options: {
		plexMetadataClient: PlexClient;
	}) {
		super(async (guid: string) => {
			const guidParts = parsePlexMetadataGuid(guid);
			let metadatas = (await this.plexMetadataClient.getMetadata(guidParts.id))?.MediaContainer?.Metadata;
			let metadataItem: plexTypes.PlexMetadataItem;
			if(metadatas instanceof Array) {
				metadataItem = metadatas[0];
			} else {
				metadataItem = metadatas;
			}
			if(!metadataItem) {
				throw httpError(404, "Not Found");
			}
			return this.metadataToInfo(metadataItem);
		});
		this.plexMetadataClient = options.plexMetadataClient;
	}

	private metadataToInfo(metadataItem: plexTypes.PlexMetadataItem) {
		return {
			slug: metadataItem.slug,
			parentSlug: metadataItem.parentSlug,
			grandparentSlug: metadataItem.grandparentSlug,
		};
	}

	cacheMetadataItem(metadataItem: plexTypes.PlexMetadataItem) {
		if(metadataItem && metadataItem.slug && metadataItem.guid) {
			this.setSync(metadataItem.guid, this.metadataToInfo(metadataItem));
		}
	}
	
	cacheMetadataItems(metadataItems: plexTypes.PlexMetadataItem[] | plexTypes.PlexMetadataItem) {
		forArrayOrSingle(metadataItems, (metadataItem) => {
			this.cacheMetadataItem(metadataItem);
		});
	}

	cacheMetadataItemForGuid(guid: string, metadataItemTask: Promise<plexTypes.PlexMetadataItem | undefined | null>) {
		this.setSync(guid, metadataItemTask.then((item) => {
			if(!item) {
				return null;
			}
			return this.metadataToInfo(item);
		}));
	}
}
