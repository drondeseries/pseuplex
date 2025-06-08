import express from 'express';
import * as plexTypes from '../plex/types';
import type { PseuplexRequestContext } from './types';
import type {
	PseuplexHub,
	PseuplexHubPageParams
} from './hub';

export interface PseuplexSection {
	readonly id: string | number;
	readonly uuid?: string | undefined;
	readonly type: plexTypes.PlexMediaItemType;
	readonly title: string;
	readonly path: string;
	readonly hubsPath: string;

	getMediaProviderDirectory(context: PseuplexRequestContext): Promise<plexTypes.PlexContentDirectory>;
	getLibrarySectionsEntry(context: PseuplexRequestContext): Promise<plexTypes.PlexLibrarySection>;
	getHubsPage(params: plexTypes.PlexHubListPageParams, context: PseuplexRequestContext): Promise<plexTypes.PlexSectionHubsPage>;
}

export type PseuplexSectionOptions = {
	allowSync?: boolean;
	id: string | number;
	type?: plexTypes.PlexMediaItemType;
	uuid?: string | undefined;
	title: string;
	path: string;
	hubsPath: string;
	hidden?: boolean;
};

export class PseuplexSectionBase implements PseuplexSection {
	readonly id: string | number;
	readonly uuid?: string | undefined;
	readonly type: plexTypes.PlexMediaItemType;
	readonly title: string;
	readonly path: string;
	readonly hubsPath: string;
	allowSync: boolean;

	constructor(options: PseuplexSectionOptions) {
		this.id = options.id;
		this.uuid = options.uuid;
		this.type = options.type ?? plexTypes.PlexMediaItemType.Mixed;
		this.title = options.title;
		this.path = options.path;
		this.hubsPath = options.hubsPath;
		this.allowSync = options.allowSync ?? false;
	}

	async getMediaProviderDirectory(context: PseuplexRequestContext): Promise<plexTypes.PlexContentDirectory> {
		return {
			id: `${this.id}`,
			key: this.path,
			hubKey: this.hubsPath,
			title: this.title,
			uuid: this.uuid,
			type: this.type,
			refreshing: false,
		};
	}

	async getLibrarySectionsEntry(context: PseuplexRequestContext): Promise<plexTypes.PlexLibrarySection> {
		return {
			allowSync: this.allowSync,
			key: `${this.id}`,
			uuid: this.uuid!,
			type: this.type,
			title: this.title,
			refreshing: false,
			filters: true,
			content: true,
			directory: true,
		};
	}

	getHubs?(params: plexTypes.PlexHubListPageParams, context: PseuplexRequestContext): Promise<PseuplexHub[]>;
	async getHubsPage(params: plexTypes.PlexHubListPageParams, context: PseuplexRequestContext): Promise<plexTypes.PlexSectionHubsPage> {
		const hubs = (await this.getHubs?.(params, context)) ?? [];
		const hubPageParams: PseuplexHubPageParams = {
			count: params.count,
			includeMeta: params.includeMeta,
			excludeFields: params.excludeFields
		};
		return {
			MediaContainer: {
				size: hubs.length,
				allowSync: false,
				librarySectionID: this.id,
				librarySectionTitle: this.title,
				librarySectionUUID: this.uuid!,
				Hub: await Promise.all(hubs.map((hub) => {
					return hub.getHubListEntry(hubPageParams, context)
				}))
			}
		};
	}
}
