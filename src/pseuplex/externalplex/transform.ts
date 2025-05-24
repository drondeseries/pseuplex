import qs from 'querystring';
import * as plexTypes from '../../plex/types';
import { parseMetadataIDFromKey } from '../../plex/metadataidentifier';
import {
	PseuplexMetadataItem,
	PseuplexMetadataSource
} from '../types';
import { PseuplexMetadataTransformOptions } from '../metadata';
import {
	PseuplexPartialMetadataIDParts,
	stringifyMetadataID,
	stringifyPartialMetadataID
} from '../metadataidentifier';

export const createPartialExternalPlexMetadataIdParts = (opts: {serverURL: string, metadataId: string}): PseuplexPartialMetadataIDParts => {
	return {
		directory: opts.serverURL,
		id: opts.metadataId
	};
};

export const createPartialExternalPlexMetadataId = (opts: {serverURL: string, metadataId: string}): string => {
	return stringifyPartialMetadataID(createPartialExternalPlexMetadataIdParts(opts));
};

export const createFullExternalPlexMetadataId = (opts:{serverURL: string, metadataId: string, asUrl: boolean}): string => {
	return stringifyMetadataID({
		isURL: opts.asUrl,
		source: PseuplexMetadataSource.PlexServer,
		directory: opts.serverURL,
		id: opts.metadataId
	});
};

export const transformExternalPlexMetadata = (metadataItem: plexTypes.PlexMetadataItem, serverURL: string, transformOpts: PseuplexMetadataTransformOptions): PseuplexMetadataItem => {
	const pseuMetadataItem = metadataItem as PseuplexMetadataItem;
	delete pseuMetadataItem.Media;
	delete pseuMetadataItem.userState;
	let metadataId = pseuMetadataItem.ratingKey;
	if(!metadataId) {
		metadataId = parseMetadataIDFromKey(pseuMetadataItem.key, '/library/metadata/')?.id;
		if(metadataId) {
			metadataId = qs.unescape(metadataId);
		}
	}
	const partialMetadataId = createPartialExternalPlexMetadataId({
		serverURL,
		metadataId
	});
	const fullMetadataId = createFullExternalPlexMetadataId({
		serverURL,
		metadataId,
		asUrl: false
	});
	pseuMetadataItem.ratingKey = fullMetadataId;
	pseuMetadataItem.key = `${transformOpts.metadataBasePath}/${transformOpts.qualifiedMetadataId ? fullMetadataId : partialMetadataId}`;
	pseuMetadataItem.Pseuplex = {
		isOnServer: false,
		metadataIds: {},
		plexMetadataIds: {
			[serverURL]: metadataId
		}
	};
	return pseuMetadataItem;
};
