
import * as plexTypes from '../plex/types';
import {
	PseuplexHub,
	PseuplexHubContext,
	PseuplexHubPageParams
} from './hub';

export interface PseuplexSection {
	readonly id: string | number;
	readonly uuid?: string | undefined;
	readonly title: string;
	readonly path: string;
	readonly hubsPath: string;
	hidden: boolean;

	getMediaProviderDirectory(): Promise<plexTypes.PlexContentDirectory>;
	getHubsPage?(params: plexTypes.PlexHubListPageParams, context: PseuplexHubContext): Promise<plexTypes.PlexSectionHubsPage>;
}

export type PseuplexSectionOptions = {
	id: string | number;
	uuid?: string | undefined;
	title: string;
	path: string;
	hubsPath: string;
	hidden?: boolean;
};

export class PseuplexSectionBase implements PseuplexSection {
	readonly id: string | number;
	readonly uuid?: string | undefined;
	readonly title: string;
	readonly path: string;
	readonly hubsPath: string;
	hidden: boolean;

	constructor(options: PseuplexSectionOptions) {
		this.id = options.id;
		this.uuid = options.uuid;
		this.title = options.title;
		this.path = options.path;
		this.hubsPath = options.hubsPath;
		this.hidden = options.hidden ?? false;
	}

	async getMediaProviderDirectory(): Promise<plexTypes.PlexContentDirectory> {
		return {
			id: `${this.id}`,
			key: this.path,
			hubKey: this.hubsPath,
			title: this.title,
			uuid: this.uuid,
			type: plexTypes.PlexMediaItemType.Mixed,
			hidden: this.hidden ? 1 : 0,
		};
	}

	getHubs?(options: {maxCount?: number}): Promise<PseuplexHub[]>;
	async getHubsPage?(params: plexTypes.PlexHubListPageParams, context: PseuplexHubContext): Promise<plexTypes.PlexSectionHubsPage> {
		const hubs = (await this.getHubs?.({
			maxCount: params.count
		})) ?? [];
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
				librarySectionUUID: this.uuid,
				Hub: await Promise.all(hubs.map((hub) => {
					return hub.getHubListEntry(hubPageParams, context)
				}))
			}
		};
	}
}
