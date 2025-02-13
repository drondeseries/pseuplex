
import qs from 'querystring';
import { PlexAuthContext } from '../../plex/types';
import { parseHttpContentType, plexXMLToJS } from '../../plex/serialization';
import { httpError } from '../../utils';

export const plexTVFetch = async <TResult>(options: {
	method?: 'GET' | 'POST' | 'PUT' | 'DELETE',
	endpoint: string,
	params?: {[key: string]: any} | null,
	headers?: {[key: string]: string},
	authContext?: PlexAuthContext | null
}): Promise<TResult> => {
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
	const res = await fetch(url, {
		method: options.method ?? 'GET',
		headers: options.headers
	});
	if(!res.ok) {
		res.body?.cancel();
		throw httpError(res.status, res.statusText);
	}
	// parse response
	const responseText = await res.text();
	if(!responseText) {
		return undefined;
	}
	const contentTypeInfo = parseHttpContentType(res.headers.get('content-type'));
	//console.log(`Response (${contentTypeInfo.contentType}):\n${responseText}`);
	if(contentTypeInfo.contentType == 'application/json') {
		return JSON.parse(responseText);
	} else if(contentTypeInfo.contentType == 'text/xml' || contentTypeInfo.contentType == 'application/xml' || responseText.startsWith('<')) {
		return await plexXMLToJS(responseText);
	} else {
		return JSON.parse(responseText);
	}
};
