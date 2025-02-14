import {
	parsePartialMetadataID,
	PseuplexMetadataSource,
	PseuplexPartialMetadataIDString,
	stringifyMetadataID,
	stringifyPartialMetadataID
} from "../../pseuplex";

export type RequestMetadataIDParts = {
	providerSlug: string,
	itemGuid: string,
	season?: number
};
const seasonRelativePath = '/season/';

export const createFullRequestsMetadataId = (options: RequestMetadataIDParts) => {
	return stringifyMetadataID({
		source: PseuplexMetadataSource.Requests,
		directory: options.providerSlug,
		id: options.itemGuid,
		relativePath: (options.season != null ? `${seasonRelativePath}${options.season}` : undefined),
	});
};

export const createPartialRequestsMetadataId = (options: RequestMetadataIDParts) => {
	return stringifyPartialMetadataID({
		directory: options.providerSlug,
		id: options.itemGuid,
		relativePath: (options.season != null ? `${seasonRelativePath}${options.season}` : undefined),
	});
};

export const parsePartialRequestsMetadataId = (metadataId: PseuplexPartialMetadataIDString): RequestMetadataIDParts => {
	const idParts = parsePartialMetadataID(metadataId);
	// parse season
	let season: number | undefined = undefined;
	if(idParts.relativePath.endsWith(seasonRelativePath)) {
		let slashIndex = seasonRelativePath.indexOf('/', seasonRelativePath.length);
		if(slashIndex == -1) {
			slashIndex = seasonRelativePath.length;
		}
		const seasonString = seasonRelativePath.substring(seasonRelativePath.length, slashIndex);
		season = Number.parseInt(seasonString);
		if(Number.isNaN(season)) {
			season = undefined;
		}
	}
	return {
		providerSlug: idParts.directory,
		itemGuid: idParts.id,
		season
	};
};
