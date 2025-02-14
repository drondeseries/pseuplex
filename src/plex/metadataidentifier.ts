
import * as plexTypes from './types';
import { httpError } from '../utils';

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

export type PlexMetadataGuidParts = {
	protocol: 'plex' | string;
	type: plexTypes.PlexMediaItemType | string;
	id: string
};

export const parsePlexMetadataGuid = (guid: string): PlexMetadataGuidParts => {
	if(!guid) {
		throw httpError(400, "Invalid empty guid");
	}
	// trim trailing slashes
	while(guid.endsWith('/')) {
		guid = guid.substring(0, guid.length-1);
	}
	// parse ID portion
	const slashIndex = guid.lastIndexOf('/');
	if(slashIndex == -1) {
		throw httpError(400, `Invalid guid`);
	}
	const id = guid.substring(slashIndex+1);
	// parse type portion
	const prevSlashIndex = guid.lastIndexOf('/', slashIndex-1);
	if(prevSlashIndex == -1) {
		throw httpError(400, `Invalid guid`);
	}
	const type = guid.substring(prevSlashIndex+1, slashIndex);
	// parse protocol
	if(prevSlashIndex < 3 || guid[prevSlashIndex-2] != ':' || guid[prevSlashIndex-1] != '/') {
		throw httpError(400, "Invalid guid structure");
	}
	const protocol = guid.substring(0, prevSlashIndex-2);
	// parse protocol
	return {
		protocol,
		type,
		id
	};
};

export const parsePlexExternalGuids = (guids: plexTypes.PlexGuid[]): {[source: string]: string} => {
	const ids: {[source: string]: string} = {};
	if(guids) {
		for(const guid of guids) {
			const delimiterIndex = guid.id?.indexOf('://') ?? -1;
			if(delimiterIndex != -1) {
				ids[guid.id.substring(0, delimiterIndex)] = guid.id.substring(delimiterIndex+3);
			}
		}
	}
	return ids;
};
