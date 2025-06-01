
import qs from 'querystring';
import { PlexAuthContext } from '../../plex/types';
import { parseHttpContentType, plexXMLToJS } from '../../plex/serialization';
import { httpError } from '../../utils';

export type PlexTVAPIRequestOptions = {
	authContext?: PlexAuthContext | null,
	verbose?: boolean,
}

export const plexTVFetch = async <TResult>(options: (PlexTVAPIRequestOptions & {
	method?: 'GET' | 'POST' | 'PUT' | 'DELETE',
	endpoint: string,
	params?: {[key: string]: any} | null,
	headers?: {[key: string]: string},
})): Promise<TResult> => {
	const method = options.method || 'GET';
	// build URL
	let url = `https://plex.tv/${options.endpoint}`;
	if(options.params != null || options.authContext != null) {
		url += '?';
		let hasQuery = false;
		if(options.params != null) {
			const paramsQs = qs.stringify(options.params);
			if(paramsQs.length > 0) {
				url += paramsQs;
				hasQuery = true;
			}
		}
		if(options.authContext != null) {
			const contextQs = qs.stringify(options.authContext);
			if(contextQs.length > 0) {
				if(hasQuery) {
					url += '&';
				}
				url += contextQs;
			}
		}
	}
	// send request
	if(options.verbose) {
		console.log(`Sending request ${method} ${url}`);
	}
	const res = await fetch(url, {
		method,
		headers: options.headers
	});
	if(!res.ok) {
		if(options.verbose) {
			console.log(`Got response ${res.status} for ${method} ${url}: ${res.statusText}`);
		}
		res.body?.cancel();
		throw httpError(res.status, res.statusText);
	}
	// parse response
	const responseText = await res.text();
	if(!responseText) {
		return undefined;
	}
	const contentType = parseHttpContentType(res.headers.get('content-type')).contentTypes[0];
	//console.log(`Response (${contentTypeInfo.contentType}):\n${responseText}`);
	if(contentType == 'application/json') {
		return JSON.parse(responseText);
	} else if(contentType == 'application/xml' || contentType == 'text/xml' || responseText.startsWith('<')) {
		return await plexXMLToJS(responseText);
	} else {
		return JSON.parse(responseText);
	}
};
