
import * as letterboxd from 'letterboxd-retriever';
import * as plexTypes from '../../plex/types';
import * as plexDiscoverAPI from '../../plexdiscover';
import {
	PseuplexMetadataItem,
	PlexMediaItemMatchParams,
	PseuplexMetadataProviderBase,
	PseuplexMetadataProviderOptions,
	PseuplexMetadataTransformOptions,
	PseuplexHubProvider,
	PseuplexPartialMetadataIDString,
	PseuplexMetadataSource
} from '../../pseuplex';
import * as lbTransform from './transform';


export type LetterboxdMetadataItem = letterboxd.FilmInfo;
export type LetterboxdMetadataProviderOptions = PseuplexMetadataProviderOptions & {
	similarItemsHubProvider: PseuplexHubProvider;
};


export class LetterboxdMetadataProvider extends PseuplexMetadataProviderBase<LetterboxdMetadataItem> {
	sourceSlug = PseuplexMetadataSource.Letterboxd;
	similarItemsHubProvider: PseuplexHubProvider;

	constructor(options: LetterboxdMetadataProviderOptions) {
		super(options);
		this.similarItemsHubProvider = options.similarItemsHubProvider;
	}

	override async fetchMetadataItem(id: PseuplexPartialMetadataIDString): Promise<LetterboxdMetadataItem> {
		console.log(`Fetching letterboxd info for ${id}`);
		const getFilmOpts = lbTransform.getFilmOptsFromPartialMetadataId(id);
		const filmInfo = await letterboxd.getFilmInfo(getFilmOpts);
		return filmInfo;
	}

	override transformMetadataItem(metadataItem: LetterboxdMetadataItem, transformOpts: PseuplexMetadataTransformOptions): PseuplexMetadataItem {
		return lbTransform.filmInfoToPlexMetadata(metadataItem, transformOpts);
	}

	override idFromMetadataItem(metadataItem: letterboxd.FilmInfo): string {
		return lbTransform.partialMetadataIdFromFilmInfo(metadataItem);
	}

	override getPlexMatchParams(metadataItem: LetterboxdMetadataItem): PlexMediaItemMatchParams {
		return getLetterboxdPlexMediaItemMatchParams(metadataItem);
	}

	override async findMatchForPlexItem(metadataItem: plexTypes.PlexMetadataItem): Promise<letterboxd.FilmInfo | null> {
		const plexGuid = metadataItem.guid;
		if(plexGuid) {
			// get the slug from the guid if it exists in the cache
			const id = await this.plexGuidToIDCache.get(plexGuid);
			if(id) {
				return this.fetchMetadataItem(id);
			} else if(id === null) {
				return null;
			}
		}
		// match against guids
		if(!metadataItem.Guid || metadataItem.Guid.length == 0) {
			return null;
		}
		let getFilmOpts: letterboxd.GetFilmOptions | undefined = undefined;
		// match against tmdb ID
		const tmdbGuid = metadataItem.Guid.find((guid) => guid.id.startsWith('tmdb://'));
		if(tmdbGuid) {
			const tmdbId = tmdbGuid.id.substring(7);
			getFilmOpts = {tmdbId};
		}
		// match against imdb ID
		if(!getFilmOpts) {
			const imdbGuid = metadataItem.Guid.find((guid) => guid.id.startsWith('imdb://'));
			if(imdbGuid) {
				const imdbId = imdbGuid.id.substring(7);
				getFilmOpts = {imdbId};
			}
		}
		// stop if no matches
		if(!getFilmOpts) {
			return null;
		}
		// get metadata
		console.log(`Fetching letterboxd film from ${JSON.stringify(getFilmOpts)}`);
		const filmInfoTask = letterboxd.getFilmInfo(getFilmOpts)
			.catch((error: letterboxd.LetterboxdError) => {
				if(error.statusCode == 404 || error.message.search(/[nN]ot [fF]ound/) != -1) {
					return null;
				}
				throw error;
			});
		if(plexGuid) {
			this.plexGuidToIDCache.setSync(plexGuid, filmInfoTask.then((filmInfo) => {
				return this.idFromMetadataItem(filmInfo);
			}));
		}
		return await filmInfoTask;
	}
}



export const getLetterboxdPlexMediaItemMatchParams = (filmInfo: letterboxd.FilmInfo): PlexMediaItemMatchParams | null => {
	let types: plexDiscoverAPI.SearchType[];
	const tmdbInfo = filmInfo.pageData.tmdb;
	if(tmdbInfo && tmdbInfo.type) {
		if(tmdbInfo.type == 'movie') {
			types = [plexDiscoverAPI.SearchType.Movies];
		} else if(tmdbInfo.type == 'tv') {
			types = [plexDiscoverAPI.SearchType.TV];
		}
	}
	const guids = lbTransform.filmInfoGuids(filmInfo);
	if(guids.length == 0) {
		return null;
	}
	if(!types) {
		types = [plexDiscoverAPI.SearchType.Movies,plexDiscoverAPI.SearchType.TV];
	}
	return {
		title: filmInfo.pageData.name,
		year: filmInfo.pageData.year,
		types: types,
		guids: guids
	};
};
