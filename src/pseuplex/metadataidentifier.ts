
import qs from 'querystring';

export type PseuplexMetadataIDParts = {
	isURL?: boolean;
	source?: string;
	directory?: string;
	id: string;
	relativePath?: string;
};

export type PseuplexMetadataIDString =
	`${string}`
	| `${string}:${string}`
	| `${string}:${string}:${string}`
	| `${string}:${string}:${string}:${string}`
	| `${string}://${string}`
	| `${string}://${string}/${string}${string}`;

export const parseMetadataID = (idString: PseuplexMetadataIDString): PseuplexMetadataIDParts => {
	// find metadata source / protocol
	let delimiterIndex = idString.indexOf(':');
	if(delimiterIndex === -1) {
		// just an ID string
		return {
			id: qs.unescape(idString)
		};
	}
	const source = idString.substring(0, delimiterIndex);
	// check if link is a url
	let startIndex: number;
	let delimiter: string;
	let isURL: boolean;
	if(idString[delimiterIndex+1] == '/' && idString[delimiterIndex+2] == '/') {
		// ID is ://
		startIndex = delimiterIndex+3;
		delimiter = '/';
		isURL = true;
	} else {
		// ID is source:directory:ID or source:ID
		startIndex = delimiterIndex+1;
		delimiter = ':';
		isURL = false;
	}
	// parse directory
	delimiterIndex = idString.indexOf(delimiter, startIndex);
	if(delimiterIndex == -1) {
		// format was source:ID or source://ID
		const remainingString = idString.substring(startIndex);
		let id: string;
		let relativePath: string | undefined;
		if(isURL) {
			// format was source://ID
			delimiterIndex = remainingString.search(/(\/|\?|\#)/);
			if(delimiterIndex != -1) {
				// format was source://ID?relativepath
				id = remainingString.substring(0, delimiterIndex);
				relativePath = remainingString.substring(delimiterIndex); // "?key=value"
			} else {
				// format was source://ID
				id = remainingString;
				relativePath = undefined;
			}
		} else {
			// format was source:ID
			id = remainingString;
			relativePath = undefined;
		}
		return {
			isURL,
			source: source,
			id: qs.unescape(id),
			relativePath
		};
	}
	// format was source:directory:ID or source://directory/ID
	let directory = idString.substring(startIndex, delimiterIndex);
	directory = qs.unescape(directory);
	// parse id and relative path
	startIndex = delimiterIndex+1;
	const remainingStr = idString.substring(startIndex);
	delimiterIndex = isURL ? remainingStr.search(/(\/|\?|\#)/) : remainingStr.indexOf(delimiter);
	let id: string;
	let relativePath: string | undefined;
	if(delimiterIndex != -1) {
		// format was source:directory:ID:relativepath or source://directory/ID/relativepath
		id = remainingStr.substring(0, delimiterIndex);
		let relPathStartIndex = delimiterIndex;
		if(!isURL) {
			relPathStartIndex++;
		}
		relativePath = remainingStr.substring(relPathStartIndex);
	} else {
		// format was source:directory:ID or source://directory/ID
		id = remainingStr;
		relativePath = undefined;
	}
	return {
		isURL,
		source: source,
		directory: directory,
		id: qs.unescape(id),
		relativePath: (relativePath != null) ?
			(isURL ? relativePath : qs.unescape(relativePath))
			: undefined
	};
};

export const stringifyMetadataID = (idParts: PseuplexMetadataIDParts): PseuplexMetadataIDString => {
	let idString: string;
	if(idParts.isURL) {
		if(idParts.directory == null && idParts.relativePath == null) {
			idString = `${idParts.source}://${qs.escape(idParts.id)}`;
		} else {
			idString = `${idParts.source}://${qs.escape(idParts.directory ?? '')}/${qs.escape(idParts.id)}`;
		}
	} else {
		if(idParts.source == null) {
			return idParts.id;
		} else {
			if(idParts.directory == null && idParts.relativePath == null) {
				idString = `${idParts.source}:${qs.escape(idParts.id)}`;
			} else {
				idString = `${idParts.source}:${qs.escape(idParts.directory ?? '')}:${qs.escape(idParts.id)}`;
			}
		}
	}
	if(idParts.relativePath != null) {
		if(idParts.isURL) {
			idString += idParts.relativePath;
		} else {
			idString += `:${qs.escape(idParts.relativePath)}`;
		}
	}
	return idString;
};

export type PseuplexPartialMetadataIDParts = {
	directory?: string;
	id: string;
	relativePath?: string;
};

export type PseuplexPartialMetadataIDString =
	`${string}`
	| `${string}:${string}`
	| `${string}:${string}:${string}`;

export const parsePartialMetadataID = (metadataId: PseuplexPartialMetadataIDString): PseuplexPartialMetadataIDParts => {
	let colonIndex = metadataId.indexOf(':');
	if(colonIndex == -1) {
		return {id:metadataId};
	}
	let prefixEndIndex = colonIndex;
	colonIndex = metadataId.indexOf(':', prefixEndIndex+1);
	if(colonIndex == -1) {
		return {
			directory: qs.unescape(metadataId.substring(0, prefixEndIndex)),
			id: qs.unescape(metadataId.substring(prefixEndIndex+1))
		};
	}
	return {
		directory: qs.unescape(metadataId.substring(0, prefixEndIndex)),
		id: qs.unescape(metadataId.substring(prefixEndIndex+1, colonIndex)),
		relativePath: qs.unescape(metadataId.substring(colonIndex+1))
	};
};

export const stringifyPartialMetadataID = (idParts: PseuplexPartialMetadataIDParts): PseuplexPartialMetadataIDString => {
	if(idParts.relativePath == null) {
		if(idParts.directory == null) {
			return idParts.id;
		} else {
			return `${qs.escape(idParts.directory)}:${qs.escape(idParts.id)}`;
		}
	}
	return `${qs.escape(idParts.directory)}:${qs.escape(idParts.id)}:${qs.escape(idParts.relativePath)}`;
};

export const qualifyPartialMetadataID = (metadataId: PseuplexPartialMetadataIDString, source: string) => {
	return `${source}:${metadataId}`;
};
