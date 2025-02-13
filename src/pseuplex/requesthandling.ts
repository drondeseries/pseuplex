import qs from 'querystring';
import express from 'express';
import {
	asyncRequestHandler,
	httpError
} from '../utils';
import * as plexTypes from '../plex/types';
import {
	handlePlexAPIRequest,
	IncomingPlexAPIRequest
} from '../plex/requesthandling';
import {
	PseuplexMetadataPage
} from './types';
import {
	parseMetadataID,
	PseuplexMetadataIDParts,
	stringifyPartialMetadataID
} from './metadataidentifier';

export const parseMetadataIdsFromPathParam = (metadataIdsString: string): PseuplexMetadataIDParts[] => {
	if(!metadataIdsString) {
		return [];
	}
	return metadataIdsString.split(',').map((metadataId) => {
		if(metadataId.indexOf(':') == -1 && metadataId.indexOf('%') != -1) {
			metadataId = qs.unescape(metadataId);
		}
		return parseMetadataID(metadataId);
	});
};

export const pseuplexMetadataIdRequestMiddleware = <TResult>(handler: (
	req: IncomingPlexAPIRequest,
	res: express.Response,
	metadataId: PseuplexMetadataIDParts) => Promise<TResult>) => {
	return asyncRequestHandler(async (req: IncomingPlexAPIRequest, res): Promise<boolean> => {
		let metadataId = req.params.metadataId;
		if(!metadataId) {
			// let plex handle the empty api request
			return false;
		}
		if(metadataId.indexOf(':') == -1 && metadataId.indexOf('%') != -1) {
			metadataId = qs.unescape(metadataId);
		}
		const metadataIdParts = parseMetadataID(metadataId);
		if(!metadataIdParts.source) {
			// id is a plex ID, so no need to handle this request
			return false;
		}
		await handlePlexAPIRequest(req, res, async (req: IncomingPlexAPIRequest, res): Promise<TResult> => {
			return await handler(req, res, metadataIdParts);
		});
		return true;
	});
};

export const pseuplexMetadataIdsRequestMiddleware = <TResult>(handler: (
	req: IncomingPlexAPIRequest,
	res: express.Response,
	metadataIds: PseuplexMetadataIDParts[]) => Promise<TResult>) => {
	return asyncRequestHandler(async (req: IncomingPlexAPIRequest, res: express.Response) => {
		// parse metadata IDs
		const metadataIdsString = req.params.metadataId;
		if(!metadataIdsString) {
			throw httpError(400, "No ID provided");
		}
		const metadataIds = parseMetadataIdsFromPathParam(metadataIdsString);
		// check if any non-plex metadata IDs exist
		let anyNonPlexIds: boolean = false;
		for(const metadataId of metadataIds) {
			if(metadataId.source) {
				anyNonPlexIds = true;
				break;
			}
		}
		// if there are no non-plex providers, just continue on with proxying the request
		if(!anyNonPlexIds) {
			// continue
			return false;
		}
		// fetch from non-plex and plex providers
		await handlePlexAPIRequest(req, res, async (req: IncomingPlexAPIRequest, res): Promise<TResult> => {
			return await handler(req, res, metadataIds);
		});
		return true;
	});
};
