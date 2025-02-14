
import qs from 'querystring';
import * as plexTypes from '../../plex/types';
import * as plexDiscoverAPI from '../../plexdiscover';
import {
	PseuplexMetadataItem,
	PlexMediaItemMatchParams,
	PseuplexMetadataProviderBase,
	PseuplexMetadataTransformOptions,
	PseuplexPartialMetadataIDString,
} from '../../pseuplex';


export type TemplateMetadataItem = {
	id: string;
	type: 'movie' | 'tv'
	title: string;
	year: number | string;
	tvdbId: string;
};

export class TemplateMetadataProvider extends PseuplexMetadataProviderBase<TemplateMetadataItem> {
	readonly sourceSlug = '<metadata_source_name>';

	override async fetchMetadataItem(id: PseuplexPartialMetadataIDString): Promise<TemplateMetadataItem> {
		// TODO fetch raw metadata item from id
		return {
			id: 'test1212',
			type: 'movie',
			title: "Shrek",
			year: 2006,
			tvdbId: '325'
		};
	}

	override transformMetadataItem(metadataItem: TemplateMetadataItem, transformOpts: PseuplexMetadataTransformOptions): PseuplexMetadataItem {
		// TODO map raw metadata item to pseuplex metadata item
		const idString = this.idFromMetadataItem(metadataItem);
		return {
			key: `${this.basePath}/${idString}`,
			ratingKey: idString,
			title: metadataItem.title,
		} as any;
	}

	override idFromMetadataItem(metadataItem: TemplateMetadataItem): PseuplexPartialMetadataIDString {
		return `${qs.escape(metadataItem.id)}`;
	}

	override getPlexMatchParams(metadataItem: TemplateMetadataItem): PlexMediaItemMatchParams {
		let types: plexDiscoverAPI.SearchType[];
		switch(metadataItem.type) {
			case 'movie':
				types = [plexDiscoverAPI.SearchType.Movies];
				break;

			case 'tv':
				types = [plexDiscoverAPI.SearchType.TV];
				break;

			default:
				types = [plexDiscoverAPI.SearchType.Movies, plexDiscoverAPI.SearchType.TV];
		}
		return {
			title: metadataItem.title,
			year: metadataItem.year,
			types,
			guids: [
				`tvdb://${metadataItem.tvdbId}`
			]
		};
	}

	override async findMatchForPlexItem(metadataItem: plexTypes.PlexMetadataItem): Promise<TemplateMetadataItem | null> {
		// TODO find matching item from this metadata provider for a given plex item
		return null;
	}
}
