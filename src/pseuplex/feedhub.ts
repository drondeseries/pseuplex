
import {
	ListFetchInterval,
	LoadableList
} from '../fetching/LoadableList';
import {
	LoadableListFetchedChunk,
	LoadableListChunk
} from '../fetching/LoadableListFragment';
import * as plexTypes from '../plex/types';
import * as plexServerAPI from '../plex/api';
import {
	addQueryArgumentToURLPath,
	forArrayOrSingle
} from '../utils';
import {
	PseuplexHub,
	PseuplexHubContext,
	PseuplexHubPage,
	PseuplexHubPageParams
} from './hub';
import { PseuplexSection } from './section';

export type PseuplexFeedHubOptions = {
	title: string;
	type: plexTypes.PlexMediaItemType;
	hubPath: string;
	hubIdentifier: plexTypes.PlexHubIdentifier;
	context: plexTypes.PlexHubContext;
	style: plexTypes.PlexHubStyle;
	promoted?: boolean;
	defaultItemCount: number;
	uniqueItemsOnly: boolean;
	loadAheadCount?: number;
	listStartFetchInterval?: ListFetchInterval;
	section?: PseuplexSection;
	matchToPlexServerMetadata?: boolean;
};

const DEFAULT_LOAD_AHEAD_COUNT = 1;

export abstract class PseuplexFeedHub<
	TItem,
	TItemToken extends (string | number | void),
	TPageToken,
	TOptions extends PseuplexFeedHubOptions = PseuplexFeedHubOptions
	> extends PseuplexHub {
	_options: TOptions;
	_itemList: LoadableList<TItem,TItemToken,TPageToken>;

	get section() {
		return this._options.section;
	}
	
	constructor(options: TOptions) {
		super();
		this._options = options;
		this._itemList = new LoadableList<TItem,TItemToken,TPageToken>({
			loader: (pageToken) => {
				return this.fetchPage(pageToken);
			},
			tokenComparer: (itemToken1, itemToken2) => {
				return this.compareItemTokens(itemToken1, itemToken2);
			}
		});
		if(options.listStartFetchInterval != null) {
			this._itemList.listStartFetchInterval = options.listStartFetchInterval;
		}
	}
	
	abstract parseItemTokenParam(itemToken: string): TItemToken | null;
	abstract fetchPage(pageToken: TPageToken | null): Promise<LoadableListFetchedChunk<TItem,TItemToken,TPageToken>>;
	abstract compareItemTokens(itemToken1: TItemToken, itemToken2: TItemToken): number;
	abstract transformItem(item: TItem, context: PseuplexHubContext): (plexTypes.PlexMetadataItem | Promise<plexTypes.PlexMetadataItem>);
	
	override async get(params: PseuplexHubPageParams, context: PseuplexHubContext): Promise<PseuplexHubPage> {
		const opts = this._options;
		const loadAheadCount = opts.loadAheadCount ?? DEFAULT_LOAD_AHEAD_COUNT;
		let chunk: LoadableListChunk<TItem,TItemToken>;
		let start: number;
		let { listStartToken } = params;
		let listStartItemToken: TItemToken | null | undefined = undefined;
		if(listStartToken != null || (params.start != null && params.start > 0)) {
			if(listStartToken != null) {
				listStartItemToken = this.parseItemTokenParam(listStartToken);
			}
			start = params.start ?? 0;
			const itemCount = params.count ?? opts.defaultItemCount;
			chunk = await this._itemList.getOrFetchItems(listStartItemToken, start, itemCount, {
				unique: opts.uniqueItemsOnly,
				loadAheadCount
			});
		} else {
			start = 0;
			const itemCount = params.count ?? opts.defaultItemCount;
			chunk = await this._itemList.getOrFetchStartItems(itemCount, {
				unique: opts.uniqueItemsOnly,
				loadAheadCount
			});
			listStartItemToken = chunk.items[0]?.token;
		}
		let key = opts.hubPath;
		if(listStartItemToken != null) {
			key = addQueryArgumentToURLPath(opts.hubPath, `listStartToken=${listStartItemToken}`);
		}
		// transform items
		let items = await Promise.all(chunk.items.map(async (itemNode) => {
			return await this.transformItem(itemNode.item, context);
		}));
		// match to plex server items if needed
		if(opts.matchToPlexServerMetadata) {
			const guids = items.flatMap((item) => (item.guid ? [item.guid] : []));
			if(guids.length > 0) {
				try {
					const plexServerItems = (await plexServerAPI.getLibraryMetadata(guids, {
						serverURL: context.plexServerURL,
						authContext: context.plexAuthContext
					}))?.MediaContainer.Metadata;
					const plexServerItemsMap: {[guid: string]: plexTypes.PlexMetadataItem} = {};
					forArrayOrSingle(plexServerItems, (item) => {
						if(item.guid) {
							plexServerItemsMap[item.guid] = item;
						}
					});
					items = items.map((item) => {
						if(item.guid) {
							const plexServerItem = plexServerItemsMap[item.guid];
							if(plexServerItem) {
								return plexServerItem;
							}
						}
						return item;
					});
				} catch(error) {
					console.error(error);
				}
			}
		}
		// return hub
		return {
			hub: {
				key: key,
				title: opts.title,
				type: opts.type,
				hubIdentifier: `${opts.hubIdentifier}${(params.contentDirectoryID != null && !(params.contentDirectoryID instanceof Array)) ? `.${params.contentDirectoryID}` : ''}`,
				context: opts.context,
				style: opts.style,
				promoted: opts.promoted
			},
			items,
			offset: start,
			more: chunk.hasMore,
			totalItemCount: chunk.totalItemCount
		};
	}
}
