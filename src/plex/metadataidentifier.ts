
import * as plexTypes from './types';
import { httpError } from '../utils/error';

export type PlexMetadataKeyParts = {
	basePath: string;
	id: string;
	relativePath?: string;
};

export const parseMetadataIDFromKey = (metadataKey: string | null | undefined, basePath: string, warnOnFailure: boolean = true): PlexMetadataKeyParts | null => {
	if(!metadataKey) {
		if(warnOnFailure) {
			console.error(new Error(`Null metadata id passed to parseMetadataIDFromKey`));
		}
		return null;
	}
	if(!metadataKey.startsWith(basePath)) {
		if(warnOnFailure) {
			console.warn(`Unrecognized metadata key ${metadataKey}`);
		}
		return null;
	}
	if(metadataKey.length == basePath.length) {
		if(warnOnFailure) {
			console.warn(`Metadata key is the same as the base path ${metadataKey}`);
		}
		return null;
	}
	let idStartIndex = basePath.length;
	if(!basePath.endsWith('/')) {
		if(metadataKey[basePath.length] != '/') {
			if(warnOnFailure) {
				console.warn(`Unrecognized metadata key ${metadataKey}`);
			}
			return null;
		}
		idStartIndex += 1;
	}
	const parsedBasePath = metadataKey.slice(0, idStartIndex);
	const slashIndex = metadataKey.indexOf('/', idStartIndex);
	if(slashIndex == -1) {
		return {
			basePath: parsedBasePath,
			id: metadataKey.substring(idStartIndex)
		};
	}
	return {
		basePath: parsedBasePath,
		id: metadataKey.substring(idStartIndex, slashIndex),
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

const libraryPathSegment = '/library';

export const plexLibraryMetadataPathToHubsMetadataPath = (metadataPath: string) => {
	const metadataIndex = metadataPath.search(/\/metadata(\/|$)/);
	if(metadataIndex == -1) {
		return metadataPath;
	}
	const libraryStartIndex = metadataIndex - libraryPathSegment.length;
	if(libraryStartIndex >= 0 && metadataPath.slice(libraryStartIndex, libraryStartIndex+libraryPathSegment.length) == libraryPathSegment) {
		metadataPath = `${metadataPath.slice(0, libraryStartIndex)}/hubs${metadataPath.slice(metadataIndex)}`;
	} else {
		metadataPath = `${metadataPath.slice(0, metadataIndex)}/hubs${metadataPath.slice(metadataIndex)}`;
	}
	return metadataPath;
};
