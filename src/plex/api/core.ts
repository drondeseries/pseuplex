
import qs from 'querystring';
import { PlexAuthContext } from '../types';
import { parseHttpContentType, plexXMLToJS } from '../serialization';
import { Logger } from '../../logging';
import { httpResponseError } from '../../utils/error';

export type PlexAPIRequestOptions = {
	serverURL: string,
	authContext?: PlexAuthContext | null,
	logger?: Logger,
};

export type PlexServerFetchOptions = PlexAPIRequestOptions & {
	method?: 'GET' | 'POST' | 'PUT' | 'DELETE',
	endpoint: string,
	params?: {[key: string]: string | number | boolean | string[] | number[]} | null,
	headers?: {[key: string]: string},
};

export const plexServerFetch = async <TResult>(options: PlexServerFetchOptions): Promise<TResult> => {
	const method = options.method || 'GET';
	// build URL
	let serverURL = options.serverURL;
	if(serverURL.indexOf('://') == -1) {
		serverURL = 'https://'+serverURL;
	}
	let url: string;
	if(serverURL.endsWith('/') || options.endpoint.startsWith('/')) {
		url = serverURL + options.endpoint;
	} else {
		url = `${serverURL}/${options.endpoint}`;
	}
	// process params
	let params = options.params;
	if(params) {
		const serializedParams: {[key: string]: any} = {};
		for(const paramName in params) {
			const paramVal = params[paramName];
			if(typeof paramVal == 'boolean') {
				serializedParams[paramName] = paramVal ? 1 : 0;
			} else if(paramVal instanceof Array) {
				serializedParams[paramName] = paramVal.join(',');
			} else if(paramVal !== undefined) {
				serializedParams[paramName] = paramVal;
			}
		}
		params = serializedParams;
	}
	// add parameters
	if(params || options.authContext) {
		url += '?';
		let hasQuery = false;
		if(params) {
			const paramsQs = qs.stringify(params);
			if(paramsQs.length > 0) {
				url += paramsQs;
				hasQuery = true;
			}
		}
		if(options.authContext) {
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
	const reqOpts: RequestInit = {
		method,
		headers: {
			'Accept': 'application/json',
			...options.headers
		}
	};
	options.logger?.logOutgoingRequest(url, reqOpts);
	const res = await fetch(url, reqOpts);
	await options.logger?.logOutgoingRequestResponse(res, reqOpts);
	if(!res.ok) {
		res.body?.cancel();
		throw httpResponseError(url, res);
	}
	// parse response
	const responseText = await res.text();
	if(!responseText) {
		return undefined!;
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
