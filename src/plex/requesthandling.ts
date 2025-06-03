
import express from 'express';
import {
	HttpError,
	httpError,
	parseQueryParams
} from '../utils';
import * as plexTypes from './types';
import { serializeResponseContent } from './serialization';
import {
	PlexServerAccountInfo,
	PlexServerAccountsStore
} from './accounts';
import { urlLogString } from '../logging';

export const handlePlexAPIRequest = async <TResult>(req: express.Request, res: express.Response, handler: (req: express.Request, res: express.Response) => Promise<TResult>, options?: PlexAPIRequestHandlerOptions): Promise<void> => {
	let serializedRes: {contentType:string, data:string};
	try {
		const result = await handler(req,res);
		serializedRes = serializeResponseContent(req, res, result);
	} catch(error) {
		console.error(error);
		let statusCode = (error as HttpError).statusCode;
		if(!statusCode) {
			statusCode = 500;
		}
		// log response
		if(options?.logResponses) {
			console.log(`\nUser response ${statusCode} for ${req.method} ${urlLogString(options, req.originalUrl)}`);
			// no response body
		}
		// send response
		res.status(statusCode);
		if(req.headers.origin) {
			res.header('access-control-allow-origin', req.headers.origin);
		}
		res.send(); // TODO use error message format
		return;
	}
	// log response
	if(options?.logResponses) {
		console.log(`\nUser response 200 for ${req.method} ${urlLogString(options, req.originalUrl)}`);
		if(options?.logResponseBody) {
			console.log(serializedRes.data);
		}
	}
	// send response
	res.status(200);
	if(req.headers.origin) {
		res.header('access-control-allow-origin', req.headers.origin);
	}
	res.contentType(serializedRes.contentType)
	res.send(serializedRes.data);
};

export type PlexAPIRequestHandlerOptions = {
	logResponses?: boolean;
	logResponseBody?: boolean;
	logFullURLs?: boolean;
};
export type PlexAPIRequestHandler<TResult> = (req: express.Request, res: express.Response) => Promise<TResult>;
export type PlexAPIRequestHandlerMiddleware<TResult> = (handler: PlexAPIRequestHandler<TResult>, options?: PlexAPIRequestHandlerOptions) => ((req: express.Request, res: express.Response) => Promise<void>);
export const plexAPIRequestHandler = <TResult>(handler: PlexAPIRequestHandler<TResult>, options?: PlexAPIRequestHandlerOptions) => {
	return async (req, res) => {
		await handlePlexAPIRequest(req, res, handler, options);
	};
};

export type IncomingPlexAPIRequest = express.Request & {
	plex: {
		authContext: plexTypes.PlexAuthContext;
		userInfo: PlexServerAccountInfo;
		requestParams: {[key: string]: any}
	}
};

export const createPlexAuthenticationMiddleware = (accountsStore: PlexServerAccountsStore) => {
	return async (req: express.Request, res: express.Response, next: (error?: Error) => void) => {
		try {
			const authContext = plexTypes.parseAuthContextFromRequest(req);
			const userToken = authContext?.['X-Plex-Token'];
			const userInfo = userToken ? await accountsStore.getTokenUserInfoOrNull(userToken) : null;
			if(!userInfo) {
				throw httpError(401, "Not Authorized");
			}
			const plexReq = req as IncomingPlexAPIRequest;
			plexReq.plex = {
				authContext,
				userInfo,
				requestParams: parseQueryParams(req, (key) => !(key in authContext))
			};
		} catch(error) {
			next(error);
			return;
		}
		next();
	};
};

