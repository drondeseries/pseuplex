
import qs from 'querystring';
import {
	ResultsPage,
	UsersSortType,
	User,
	MediaType,
	MediaRequestItem,
	Language,
	Movie,
	TVShow
} from './apitypes';
import { httpResponseError } from '../../../../utils/error';

const overseerrFetch = async (options: {
	serverURL: string,
	method?: 'GET' | 'POST' | 'PUT' | 'DELETE',
	endpoint: string,
	params?: { [key: string]: any } | null,
	headers?: { [key: string]: string },
	apiKey?: string | null
}) => {
	// build URL
	let url: string;
	if (options.serverURL.endsWith('/') || options.endpoint.startsWith('/')) {
		url = options.serverURL + options.endpoint;
	} else {
		url = `${options.serverURL}/${options.endpoint}`;
	}
	// build parameters
	const method = options.method ?? 'GET';
	if (method === 'GET' && options.params) {
		const paramsQs = qs.stringify(options.params);
		if (paramsQs.length > 0) {
			if (url.indexOf('?') == -1) {
				url += '?';
			} else if (!url.endsWith('?')) {
				url += '&';
			}
			url += paramsQs;
		}
	}
	const headers = {};
	let reqBody: string | undefined = undefined;
	if (options.apiKey) {
		headers['X-Api-Key'] = options.apiKey;
	}
	if (method != 'GET' && options.params) {
		headers['Content-Type'] = 'application/json';
		reqBody = JSON.stringify(options.params);
	}
	// send request
	const res = await fetch(url, {
		method,
		headers,
		body: reqBody
	});
	if (!res.ok) {
		res.body?.cancel();
		throw httpResponseError(url, res);
	}
	// parse response
	const resBody = await res.text();
	if (!resBody) {
		return undefined;
	}
	return JSON.parse(resBody);
};



export const getUsers = async (options: {
	params: {
		take?: number,
		skip?: number,
		sort?: UsersSortType
	},
	serverURL: string,
	apiKey?: string
}): Promise<ResultsPage<User>> => {
	return await overseerrFetch({
		serverURL: options.serverURL,
		method: 'GET',
		endpoint: 'api/v1/user',
		apiKey: options.apiKey,
		params: options.params
	});
};



export type CreateRequestItem = {
	mediaType: MediaType;
	mediaId?: number;
	tvdbId?: number;
	seasons?: number[];
	is4k?: boolean;
	serverId?: number;
	profileId?: number;
	rootFolder?: string;
	languageProfileId?: number;
	userId?: number;
};

export const request = async (options: {
	params: CreateRequestItem,
	serverURL: string,
	apiKey?: string
}): Promise<MediaRequestItem> => {
	return await overseerrFetch({
		serverURL: options.serverURL,
		method: 'POST',
		endpoint: 'api/v1/request',
		apiKey: options.apiKey,
		params: options.params
	});
};



export const getMovie = async (movieId: string | number, options: {
	params?: {
		language?: Language
	},
	serverURL: string,
	apiKey?: string
}): Promise<Movie> => {
	return await overseerrFetch({
		serverURL: options.serverURL,
		method: 'GET',
		endpoint: `api/v1/movie/${movieId}`,
		apiKey: options.apiKey,
		params: options.params
	});
};

export const getTV = async (tvId: string | number, options: {
	params?: {
		language?: Language
	},
	serverURL: string,
	apiKey?: string
}): Promise<TVShow> => {
	return await overseerrFetch({
		serverURL: options.serverURL,
		method: 'GET',
		endpoint: `api/v1/tv/${tvId}`,
		apiKey: options.apiKey,
		params: options.params
	});
};
