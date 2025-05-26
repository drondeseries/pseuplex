import * as plexTypes from '../../plex/types';
import { parsePlexMetadataGuid } from '../../plex/metadataidentifier';
import {
	PseuplexMetadataSource,
	PseuplexPartialMetadataIDString,
	stringifyMetadataID,
	stringifyPartialMetadataID,
	parsePartialMetadataID
} from "../../pseuplex";

export const ChildrenRelativePath = '/children';
export const SeasonRelativePath = '/season/';
export const SeasonIDComponentPortion = 'season';

export type RequestMetadataItemIDComponentParts = {
	mediaType: plexTypes.PlexMediaItemType,
	plexId: string,
	season?: number,
}

export type RequestPartialMetadataIDParts = {
	requestProviderSlug: string,
} & RequestMetadataItemIDComponentParts;

const createRequestMetadataItemIdComponent = (idParts: RequestMetadataItemIDComponentParts) => {
	return `${idParts.mediaType}:${idParts.plexId}`
		+ (idParts.season != null ? `:${SeasonIDComponentPortion}${idParts.season}` : '');
};

const parseRequestMetadataItemIdComponent = (idString: string): RequestMetadataItemIDComponentParts => {
	const idParts = idString.split(':');
	if(idParts.length < 2) {
		throw new Error(`Invalid request id component ${idString}`);
	}
	const mediaType = idParts[0] as plexTypes.PlexMediaItemType; // TODO validate media type?
	const plexId = idParts[1];
	let season: number | undefined = undefined;
	if(idParts.length > 2) {
		if(idParts.length > 3) {
			console.error(`Unknown request id component format ${JSON.stringify(idString)}`);
		}
		const childString = idParts[2];
		// parse season
		if(childString.startsWith(SeasonIDComponentPortion)) {
			const seasonString = childString.substring(SeasonIDComponentPortion.length);
			season = Number.parseInt(seasonString);
			if(Number.isNaN(season)) {
				season = undefined;
			}
		} else {
			console.error(`Unrecognized child portion ${JSON.stringify(childString)}`);
		}
	}
	return {
		mediaType,
		plexId,
		season,
	};
};

export const createRequestFullMetadataId = (idParts: RequestPartialMetadataIDParts) => {
	return stringifyMetadataID({
		source: PseuplexMetadataSource.Request,
		directory: idParts.requestProviderSlug,
		id: createRequestMetadataItemIdComponent(idParts),
	});
};

export const createRequestPartialMetadataId = (idParts: RequestPartialMetadataIDParts) => {
	return stringifyPartialMetadataID({
		directory: idParts.requestProviderSlug,
		id: createRequestMetadataItemIdComponent(idParts)
	});
};

export const createRequestItemMetadataKey = (options: {
	basePath: string,
	requestProviderSlug: string,
	mediaType: plexTypes.PlexMediaItemType,
	plexId: string,
	season?: number,
	children?: boolean
}) => {
	return `${options.basePath}/${options.requestProviderSlug}/${options.mediaType}/${options.plexId}`
		+ (options.season != null ? `${SeasonRelativePath}${options.season}` : '')
		+ (options.children ? ChildrenRelativePath : '');
}

export const parsePartialRequestMetadataId = (metadataId: PseuplexPartialMetadataIDString): RequestPartialMetadataIDParts => {
	const metadataIdParts = parsePartialMetadataID(metadataId);
	if(!metadataIdParts.directory) {
		throw new Error(`Missing request provider slug on metadata id ${metadataId}`);
	}
	const idParts = parseRequestMetadataItemIdComponent(metadataIdParts.id);
	return {
		requestProviderSlug: metadataIdParts.directory,
		...idParts,
	};
};

export type TransformRequestMetadataOptions = {
	basePath: string,
	requestProviderSlug: string,
	children?: boolean
};

export const setMetadataItemKeyToRequestKey = (metadataItem: plexTypes.PlexMetadataItem, opts: TransformRequestMetadataOptions) => {
	let itemGuid = metadataItem.guid;
	let season: number = undefined;
	if(metadataItem.type == plexTypes.PlexMediaItemType.Season) {
		itemGuid = metadataItem.parentGuid;
		season = metadataItem.index;
	}
	const guidParts = parsePlexMetadataGuid(itemGuid);
	const children = opts?.children ?? metadataItem.key.endsWith(ChildrenRelativePath);
	metadataItem.key = createRequestItemMetadataKey({
		basePath: opts.basePath,
		requestProviderSlug: opts.requestProviderSlug,
		mediaType: guidParts.type as plexTypes.PlexMediaItemType,
		plexId: guidParts.id,
		season,
		children
	});
	metadataItem.ratingKey = createRequestFullMetadataId({
		requestProviderSlug: opts.requestProviderSlug,
		mediaType: guidParts.type as plexTypes.PlexMediaItemType,
		plexId: guidParts.id,
		season,
	});
};

export const transformRequestableSeasonMetadata = (metadataItem: plexTypes.PlexMetadataItem, opts: TransformRequestMetadataOptions) => {
	setMetadataItemKeyToRequestKey(metadataItem, opts);
	metadataItem.title = `Request ${metadataItem.title}`;
};
