
import * as letterboxd from 'letterboxd-retriever';
import * as plexTypes from '../../plex/types';
import { parsePlexExternalGuids } from '../../plex/metadataidentifier';
import * as plexDiscoverAPI from '../../plexdiscover';
import {
	PseuplexMetadataItem,
	PlexMediaItemMatchParams,
	PseuplexMetadataProviderBase,
	PseuplexMetadataTransformOptions,
	PseuplexPartialMetadataIDString,
	PseuplexMetadataSource,
} from '../../pseuplex';
import * as lbTransform from './transform';

export type LetterboxdMetadataItem = letterboxd.FilmInfo;

export class LetterboxdMetadataProvider extends PseuplexMetadataProviderBase<LetterboxdMetadataItem> {
	readonly sourceSlug = PseuplexMetadataSource.Letterboxd;

	override async fetchMetadataItem(id: PseuplexPartialMetadataIDString): Promise<LetterboxdMetadataItem> {
		console.log(`Fetching letterboxd info for ${id}`);
		const getFilmOpts = lbTransform.getFilmOptsFromPartialMetadataId(id);
		const filmInfo = await letterboxd.getFilmInfo(getFilmOpts);
		return filmInfo;
	}

	override transformMetadataItem(metadataItem: LetterboxdMetadataItem, transformOpts: PseuplexMetadataTransformOptions): PseuplexMetadataItem {
		return lbTransform.filmInfoToPlexMetadata(metadataItem, transformOpts);
	}

	override idFromMetadataItem(metadataItem: LetterboxdMetadataItem): PseuplexPartialMetadataIDString {
		return lbTransform.partialMetadataIdFromFilmInfo(metadataItem);
	}

	override getPlexMatchParams(metadataItem: LetterboxdMetadataItem): PlexMediaItemMatchParams {
		return getLetterboxdPlexMediaItemMatchParams(metadataItem);
	}

	override async findMatchForPlexItem(metadataItem: plexTypes.PlexMetadataItem): Promise<LetterboxdMetadataItem | null> {
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
		let getFilmOpts: letterboxd.GetFilmOptions | undefined = undefined;
		const idMap = parsePlexExternalGuids(metadataItem.Guid);
		const tmdbId = idMap['tmdb'];
		if(tmdbId) {
			getFilmOpts = {tmdbId};
		}
		if(!getFilmOpts) {
			const imdbId = idMap['imdb'];
			if(imdbId) {
				getFilmOpts = {imdbId};
			}
		}
		// stop if no ids to match
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



export const getLetterboxdPlexMediaItemMatchParams = (filmInfo: LetterboxdMetadataItem): PlexMediaItemMatchParams | null => {
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
