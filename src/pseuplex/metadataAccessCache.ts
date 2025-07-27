import * as plexTypes from '../plex/types';
import { PseuplexMetadataProvider } from './metadata';
import { qualifyPartialMetadataID } from './metadataidentifier';
import { PseuplexMetadataItem, PseuplexRequestContext } from './types';

export type PseuplexMetadataAccessCacheOptions = {
	limitPerToken?: number;
};

export type PseuplexMetadataAccessEntry = {
	metadataId: string;
	//metadataKey: string;
};

export class PseuplexMetadataAccessCache {
	limitPerToken: number;
	
	private readonly _clientAccessLogs: {
		[token: string]: {
			[clientId: string]: {
				[plexGuid: string]: PseuplexMetadataAccessEntry[]
			}
		}
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
		this.addMetadataAccessEntry(plexGuid, {
			metadataId: fullMetadataId,
			// metadataKey,
		}, context);
	}
	
	addMetadataAccessEntry(plexGuid: string, entry: PseuplexMetadataAccessEntry, context: PseuplexRequestContext) {
		// get token and client id
		const { plexAuthContext } = context;
		const token = plexAuthContext['X-Plex-Token'];
		if(!token) {
			console.warn("tokenless auth context probably shouldn't be pushing metadata access...");
			return;
		}
		const clientId = plexAuthContext['X-Plex-Client-Identifier'] ?? '';
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
		let entryList = guidMap[plexGuid];
		if(entryList) {
			// guid mapping already existed
			// check if entry has already been added
			const existingIndex = entryList.findIndex((cmpEntry) => (
				cmpEntry.metadataId == entry.metadataId
				//&& cmpEntry.metadataKey == entry.metadataKey
			));
			if(existingIndex == -1) {
				// add entry since it hasnt been added
				entryList.push(entry);
			}
			// delete and re-add guid mapping, so it moves to the end of the keys array
			delete guidMap[plexGuid];
			guidMap[plexGuid] = entryList;
		} else {
			// guid mapping doesn't exist
			// add new entry list
			entryList = [entry];
			guidMap[plexGuid] = entryList;
		}
		// delete entries over limit
		const guidKeys = Object.keys(guidMap);
		if(guidKeys.length > this.limitPerToken) {
			const overAmount = guidKeys.length - this.limitPerToken;
			for(const guidKey of guidKeys.slice(0, overAmount)) {
				delete guidMap[guidKey];
			}
		}
	}

	getMetadataAccessEntries(plexGuid: string, context: PseuplexRequestContext): PseuplexMetadataAccessEntry[] | undefined {
		// get token and client id
		const { plexAuthContext } = context;
		const token = plexAuthContext['X-Plex-Token'];
		if(!token) {
			return undefined;
		}
		const clientId = plexAuthContext['X-Plex-Client-Identifier'] ?? '';
		// get access log for token and client id
		return this._clientAccessLogs[token]?.[clientId]?.[plexGuid];
	}
}
