
import qs from 'querystring';
import { httpError } from '../../../../utils';

const overseerrFetch = async (options: {
	serverURL: string,
	method?: 'GET' | 'POST' | 'PUT' | 'DELETE',
	endpoint: string,
	params?: {[key: string]: any} | null,
	headers?: {[key: string]: string},
	apiKey?: string | null
}) => {
	// build URL
	let url: string;
	if(options.serverURL.endsWith('/') || options.endpoint.startsWith('/')) {
		url = options.serverURL + options.endpoint;
	} else {
		url = `${options.serverURL}/${options.endpoint}`;
	}
	// build parameters
	const method = options.method ?? 'GET';
	if(method === 'GET') {
		const paramsQs = qs.stringify(options.params);
		if(paramsQs.length > 0) {
			if(url.indexOf('?') == -1) {
				url += '?';
			} else if(!url.endsWith('?')) {
				url += '&';
			}
			url += paramsQs;
		}
	}
	const headers = {};
	let reqBody: string | undefined = undefined;
	if(options.apiKey) {
		headers['X-Api-Key'] = options.apiKey;
	}
	if(method != 'GET' && options.params) {
		headers['Content-Type'] = 'application/json';
		reqBody = JSON.stringify(options.params);
	}
	// send request
	const res = await fetch(url, {
		method,
		headers,
		body: reqBody
	});
	if(!res.ok) {
		res.body?.cancel();
		throw httpError(res.status, res.statusText);
	}
	// parse response
	const resBody = await res.text();
	if(!resBody) {
		return undefined;
	}
	return JSON.parse(resBody);
};



export enum MediaType {
	Movie = 'movie',
	TV = 'tv'
};

export enum MediaStatus {
	Unknown = 1,
	Pending = 2,
	Processing = 3,
	PartiallyAvailable = 4,
	Available = 5
};

export type User = {
	id: number;
	email: string; // "hey@itsme.com"
	username: string;
	plexToken?: string;
	plexUsername: string;
	userType: number;
	permissions: number;
	avatar: string;
	createdAt: string; // "2020-09-02T05:02:23.000Z"
	updatedAt: string; // "2020-09-02T05:02:23.000Z"
	requestCount: number;
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

export enum RequestStatus {
	PendingApproval = 1,
	Approved = 2,
	Declined = 3
};

export type RequestItem = {
	id: number;
	status: RequestStatus;
	media: {
		id: number;
		tmdbId?: number;
		tvdbId?: number;
		status: MediaStatus;
		requests: string[];
		createdAt: string; // "2020-09-12T10:00:27.000Z"
		updatedAt: string; // "2020-09-12T10:00:27.000Z"
	},
	createdAt: string; // "2020-09-12T10:00:27.000Z"
	updatedAt: string; // "2020-09-12T10:00:27.000Z"
	requestedBy: User;
	modifiedBy: User;
	is4k: boolean;
	serverId: number;
	profileId: number;
	rootFolder: string;
};

export const request = async (options: {
	serverURL: string,
	params: CreateRequestItem,
	apiKey?: string
}) => {
	return await overseerrFetch({
		serverURL: options.serverURL,
		method: 'POST',
		endpoint: 'api/v1/request',
		apiKey: options.apiKey,
		params: options.params
	});
};
