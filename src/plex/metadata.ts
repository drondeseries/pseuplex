
import { CachedFetcher } from '../fetching/CachedFetcher';
import * as plexTypes from './types';
import * as plexServerAPI from './api';
import { httpError } from '../utils';

export const createPlexServerIdToGuidCache = (options: {
	plexServerURL: string;
	plexAuthContext: plexTypes.PlexAuthContext;
	onFetchMetadataItem?: (id: string, metadata: plexTypes.PlexMetadataItem) => void;
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
		if(options.onFetchMetadataItem) {
			options.onFetchMetadataItem(id, metadata);
		}
		return metadata.guid;
	});
};

export type PlexMetadataKeyParts = {
	basePath: string;
	id: string;
	relativePath?: string;
};

export const parseMetadataIDFromKey = (metadataKey: string | null | undefined, basePath: string): PlexMetadataKeyParts | null => {
	if(!metadataKey) {
		return null;
	}
	if(!basePath.endsWith('/')) {
		basePath += '/';
	}
	if(!metadataKey.startsWith(basePath)) {
		console.warn(`Unrecognized metadata key ${metadataKey}`);
		return null;
	}
	const slashIndex = metadataKey.indexOf('/', basePath.length);
	if(slashIndex == -1) {
		return {
			basePath,
			id: metadataKey.substring(basePath.length)
		};
	}
	return {
		basePath,
		id: metadataKey.substring(basePath.length, slashIndex),
		relativePath: metadataKey.substring(slashIndex)
	};
};
