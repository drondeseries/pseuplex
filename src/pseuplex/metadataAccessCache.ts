import * as plexTypes from '../plex/types';
import { PseuplexMetadataProvider } from './metadata';
import { qualifyPartialMetadataID } from './metadataidentifier';
import { PseuplexMetadataItem, PseuplexRequestContext } from './types';

export type PseuplexMetadataAccessCacheOptions = {
	limitPerToken?: number;
};

const TokenAndClientIdDivider = '|';
type TokenAndClientIdString = `${string}${typeof TokenAndClientIdDivider}${string}`;

type TokenAndClientId = {
	token: string;
	clientId: string;
};

export class PseuplexMetadataAccessCache {
	limitPerToken: number;
	
	private readonly _clientAccessLogs: {
		[token: string]: {
			[clientId: string]: {
				[plexGuid: string]: Set<string>
			}
		}
	} = {};

	private readonly _plexGuidAccessors: {
		[plexGuid: string]: Set<TokenAndClientIdString>;
	} = {};

	constructor(options?: PseuplexMetadataAccessCacheOptions) {
		this.limitPerToken = options?.limitPerToken ?? 20;
	}

	cachePluginMetadataAccessIfNeeded(metadataProvider: PseuplexMetadataProvider, metadataId: string, metadataKey: string, metadatas: PseuplexMetadataItem | PseuplexMetadataItem[] | undefined, context: PseuplexRequestContext) {
		if(!metadatas) {
			return;
		}
		let metadataItem: PseuplexMetadataItem;
		if(metadatas instanceof Array) {
			if(metadatas.length == 1) {
				metadataItem = metadatas[0];
			}
		} else {
			metadataItem = metadatas;
		}
		const plexGuid = metadataItem?.guid;
		if(!plexGuid) {
			return;
		}
		const fullMetadataId = qualifyPartialMetadataID(metadataId, metadataProvider.sourceSlug);
		this.addMetadataAccessEntry(plexGuid, fullMetadataId, context);
	}
	
	addMetadataAccessEntry(plexGuid: string, metadataId: string, context: PseuplexRequestContext) {
		// get token and client id
		const { plexAuthContext } = context;
		const token = plexAuthContext['X-Plex-Token'];
		if(!token) {
			console.warn("tokenless auth context probably shouldn't be pushing metadata access...");
			return;
		}
		const clientId = plexAuthContext['X-Plex-Client-Identifier'] ?? '';
		const tokenAndClientIdString: TokenAndClientIdString = `${token}${TokenAndClientIdDivider}${clientId ?? ''}`;
		// get guid mapping for token and client id
		let clientMap = this._clientAccessLogs[token];
		if(!clientMap) {
			clientMap = {};
			this._clientAccessLogs[token] = clientMap;
		}
		let guidMap = clientMap[clientId];
		if(!guidMap) {
			guidMap = {};
			clientMap[clientId] = guidMap;
		}
		// get access entry list to modify
		let entries = guidMap[plexGuid];
		if(entries) {
			entries.add(metadataId);
			// delete and re-add guid mapping, so it moves to the end of the keys array
			delete guidMap[plexGuid];
			guidMap[plexGuid] = entries;
		} else {
			// guid mapping doesn't exist
			// add new entry list
			entries = new Set([metadataId]);
			guidMap[plexGuid] = entries;
		}
		// add to accessors
		let guidAccessors = this._plexGuidAccessors[plexGuid];
		if(!guidAccessors) {
			guidAccessors = new Set();
			this._plexGuidAccessors[plexGuid] = guidAccessors;
		}
		guidAccessors.add(tokenAndClientIdString);
		// delete entries over limit
		const guidKeys = Object.keys(guidMap);
		if(guidKeys.length > this.limitPerToken) {
			const overAmount = guidKeys.length - this.limitPerToken;
			for(const guidKey of guidKeys.slice(0, overAmount)) {
				// remove guid mapping and delete from accessors map
				const otherGuidAccessors = this._plexGuidAccessors[guidKey];
				delete guidMap[guidKey];
				if(otherGuidAccessors) {
					otherGuidAccessors.delete(tokenAndClientIdString);
					if(otherGuidAccessors.size == 0) {
						delete this._plexGuidAccessors[guidKey];
					}
				}
			}
		}
	}

	getMetadataIdsForGuidAndClient(plexGuid: string, token: string, clientId: string): Set<string> | undefined {
		return this._clientAccessLogs[token]?.[clientId]?.[plexGuid];
	}

	getMetadataAccessorsForGuid(plexGuid: string): TokenAndClientId[] | undefined {
		const accessorStrings = this._plexGuidAccessors[plexGuid];
		if(!accessorStrings) {
			return undefined;
		}
		const accessors: TokenAndClientId[] = [];
		for(const accessorString of accessorStrings) {
			const divIndex = accessorString.indexOf(TokenAndClientIdDivider);
			if(divIndex == -1) {
				console.error(`Malformed accessorString ${accessorString}`);
				continue;
			}
			const token = accessorString.substring(0, divIndex);
			const clientId = accessorString.substring(divIndex+1);
			accessors.push({
				token,
				clientId
			});
		}
		return accessors;
	}

	getMetadataIdsForGuid(plexGuid: string): Set<string> | undefined {
		const accessors = this.getMetadataAccessorsForGuid(plexGuid);
		if(!accessors || accessors.length == 0) {
			return undefined;
		}
		const metadataIds = new Set<string>();
		for(const {token, clientId} of accessors) {
			const accessorIds = this._clientAccessLogs[token]?.[clientId]?.[plexGuid];
			for(const id of accessorIds) {
				metadataIds.add(id);
			}
		}
		return metadataIds;
	}
}
