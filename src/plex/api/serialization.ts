import * as plexTypes from "../types";

export const booleanQueryParam = (param: plexTypes.PlexXMLBoolean | undefined): (1 | 0 | undefined) => {
	if(param == null) {
		return undefined;
	}
	return (param == 1) ? 1 : 0;
};

export const removeFileParamsFromMetadataParams = (params: plexTypes.PlexMetadataPageParams) => {
	if(!params) {
		return params;
	}
	const newParams = {...params};
	for(const key in [
		'checkFiles',
		'asyncCheckFiles',
		'refreshAnalysis',
		'asyncRefreshAnalysis',
		'refreshLocalMediaAgent',
		'asyncRefreshLocalMediaAgent',
		'asyncAugmentMetadata'
	]) {
		delete newParams[key];
	}
}
