import qs from 'querystring';
import * as plexTypes from '../../plex/types';
import {
	PseuplexMetadataSource,
	PseuplexPartialMetadataIDString,
	stringifyMetadataID,
	stringifyPartialMetadataID,
	parsePartialMetadataID
} from "../../pseuplex";
import { WithOptionalPropsRecursive } from '../../utils';
import { RequestsProvider } from './provider';

export const ChildrenRelativePath = '/children';
export const SeasonRelativePath = '/season/';

export type RequestMetadataIDParts = {
	requestProviderSlug: string,
	itemGuid: string,
	season?: number
};

export const createRequestFullMetadataId = (options: RequestMetadataIDParts) => {
	return stringifyMetadataID({
		source: PseuplexMetadataSource.Requests,
		directory: options.requestProviderSlug,
		id: options.itemGuid,
		relativePath: (options.season != null ? `${SeasonRelativePath}${options.season}` : undefined),
	});
};

export const createRequestPartialMetadataId = (options: RequestMetadataIDParts) => {
	return stringifyPartialMetadataID({
		directory: options.requestProviderSlug,
		id: options.itemGuid,
		relativePath: (options.season != null ? `${SeasonRelativePath}${options.season}` : undefined),
	});
};

export const createRequestItemMetadataKey = (options: {
	pluginBasePath: string,
	requestProviderSlug: string,
	itemGuid: string,
	season?: number,
	children?: boolean
}) => {
	return `${options.pluginBasePath}/${options.requestProviderSlug}/request/${qs.escape(options.itemGuid)}`
		+ (options.season != null ? `/season/${options.season}` : '')
		+ (options.children ? ChildrenRelativePath : '');
}

export const parsePartialRequestsMetadataId = (metadataId: PseuplexPartialMetadataIDString): RequestMetadataIDParts => {
	const idParts = parsePartialMetadataID(metadataId);
	// parse season
	let season: number | undefined = undefined;
	if(idParts.relativePath.endsWith(SeasonRelativePath)) {
		let slashIndex = SeasonRelativePath.indexOf('/', SeasonRelativePath.length);
		if(slashIndex == -1) {
			slashIndex = SeasonRelativePath.length;
		}
		const seasonString = SeasonRelativePath.substring(SeasonRelativePath.length, slashIndex);
		season = Number.parseInt(seasonString);
		if(Number.isNaN(season)) {
			season = undefined;
		}
	}
	return {
		requestProviderSlug: idParts.directory,
		itemGuid: idParts.id,
		season
	};
};

export const createRequestButtonMetadataItem = (options: {
	pluginBasePath: string,
	mediaType: plexTypes.PlexMediaItemTypeNumeric,
	guid: string,
	season?: number,
	requestProvider: RequestsProvider,
	moviesLibraryId?: string | number,
	tvShowsLibraryId?: string | number
}): plexTypes.PlexMetadataItem | null => {
	// determine properties
	let requestActionTitle: string;
	let librarySectionID: string | number;
	switch(options.mediaType) {
		case plexTypes.PlexMediaItemTypeNumeric.Movie:
			requestActionTitle = "Request Movie";
			librarySectionID = options.moviesLibraryId;
			break;
		case plexTypes.PlexMediaItemTypeNumeric.Show:
			requestActionTitle = "Request Show";
			librarySectionID = options.tvShowsLibraryId;
			break;
		case plexTypes.PlexMediaItemTypeNumeric.Season:
			requestActionTitle = "Request Season";
			librarySectionID = options.tvShowsLibraryId;
			break;
		case plexTypes.PlexMediaItemTypeNumeric.Episode:
			if(options.requestProvider.canRequestEpisodes) {
				requestActionTitle = "Request Episode";
			} else {
				requestActionTitle = "Request Season";
			}
			librarySectionID = options.tvShowsLibraryId;
			break;
		default:
			// can't request type
			return;
	}
	if(librarySectionID == null) {
		return null;
	}
	// create hook metadata
	const metadataItem: WithOptionalPropsRecursive<plexTypes.PlexMetadataItem> = {
		guid: options.guid,
		key: createRequestItemMetadataKey({
			pluginBasePath: options.pluginBasePath,
			requestProviderSlug: options.requestProvider.slug,
			itemGuid: options.guid,
			season: options.season,
			children: false
		}),
		ratingKey: createRequestFullMetadataId({
			requestProviderSlug: options.requestProvider.slug,
			itemGuid: options.guid,
			season: options.season
		}),
		librarySectionTitle: requestActionTitle,
		librarySectionID,
		librarySectionKey: `/library/sections/${librarySectionID}`,
		Media: [{
			videoResolution: requestActionTitle
		}]
	};
	return metadataItem as plexTypes.PlexMetadataItem;
};

export type TransformMetadataOptions = {
	pluginBasePath: string,
	requestProviderSlug: string,
	children?: boolean
};

export const setMetadataItemKeyToRequestKey = (metadataItem: plexTypes.PlexMetadataItem, opts: TransformMetadataOptions) => {
	let itemGuid = metadataItem.guid;
	let season: number = undefined;
	if(metadataItem.type == plexTypes.PlexMediaItemType.Season) {
		itemGuid = metadataItem.parentGuid;
		season = metadataItem.index;
	}
	const children = opts?.children ?? metadataItem.key.endsWith(ChildrenRelativePath);
	metadataItem.key = createRequestItemMetadataKey({
		pluginBasePath: opts.pluginBasePath,
		requestProviderSlug: opts.requestProviderSlug,
		itemGuid,
		season,
		children
	});
};

export const transformRequestableSeasonMetadata = (metadataItem: plexTypes.PlexMetadataItem, opts: TransformMetadataOptions) => {
	setMetadataItemKeyToRequestKey(metadataItem, opts);
	metadataItem.title = `Request ${metadataItem.title}`;
};
