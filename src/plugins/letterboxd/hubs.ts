
import * as letterboxd from 'letterboxd-retriever';
import * as plexTypes from '../../plex/types';
import {
	PseuplexFeedHub,
	PseuplexHubContext,
	PseuplexMetadataTransformOptions,
	PseuplexPartialMetadataIDString,
	qualifyPartialMetadataID
} from '../../pseuplex';
import * as lbtransform from './transform';
import { LetterboxdMetadataProvider } from './metadata';
import { LetterboxdActivityFeedHub } from './activityfeedhub';


export const createUserFollowingFeedHub = (letterboxdUsername: string, options: {
	hubPath: string,
	style: plexTypes.PlexHubStyle,
	promoted: boolean,
	uniqueItemsOnly: boolean,
	metadataTransformOptions?: PseuplexMetadataTransformOptions,
	letterboxdMetadataProvider: LetterboxdMetadataProvider,
	matchToPlexServerMetadata?: boolean,
}): LetterboxdActivityFeedHub => {
	return new LetterboxdActivityFeedHub({
		hubPath: options.hubPath,
		title: `Friends Activity on Letterboxd (${letterboxdUsername})`,
		type: plexTypes.PlexMediaItemType.Movie,
		hubIdentifier: `custom.letterboxd.activity.friends.${letterboxdUsername}`,
		context: 'hub.custom.letterboxd.activity.friends',
		defaultItemCount: 16,
		style: options.style,
		promoted: options.promoted,
		uniqueItemsOnly: options.uniqueItemsOnly,
		metadataTransformOptions: options.metadataTransformOptions ?? {
			metadataBasePath: options.letterboxdMetadataProvider.basePath,
			qualifiedMetadataId: false
		},
		letterboxdMetadataProvider: options.letterboxdMetadataProvider,
		matchToPlexServerMetadata: options.matchToPlexServerMetadata,
	}, async (pageToken) => {
		console.log(`Fetching user following feed for ${letterboxdUsername}`);
		return await letterboxd.getUserFollowingFeed(letterboxdUsername, {
			after: pageToken?.token ?? undefined,
			csrf: pageToken?.csrf ?? undefined
		});
	});
};


export const createSimilarItemsHub = async (metadataId: PseuplexPartialMetadataIDString, options: {
	relativePath: string,
	title: string,
	style: plexTypes.PlexHubStyle,
	promoted: boolean,
	metadataTransformOptions?: PseuplexMetadataTransformOptions,
	letterboxdMetadataProvider: LetterboxdMetadataProvider,
	defaultCount?: number
}) => {
	const metadataTransformOpts: PseuplexMetadataTransformOptions = options.metadataTransformOptions ?? {
		metadataBasePath: options.letterboxdMetadataProvider.basePath,
		qualifiedMetadataId: false
	};
	const filmOpts = lbtransform.getFilmOptsFromPartialMetadataId(metadataId);
	const metadataIdInPath = metadataTransformOpts.qualifiedMetadataId
		? qualifyPartialMetadataID(metadataId, options.letterboxdMetadataProvider.sourceSlug)
		: metadataId;
	const hubPath = `${metadataTransformOpts.metadataBasePath}/${metadataIdInPath}/${options.relativePath}`;
	return new class extends PseuplexFeedHub<letterboxd.Film,void,string> {
		override get metadataBasePath() {
			return metadataTransformOpts.metadataBasePath;
		}

		override parseItemTokenParam(itemToken: string): void {
			// similar list items dont have tokens
			return undefined;
		}

		override compareItemTokens(itemToken1: void, itemToken2: void): number {
			// Since we only load this list once (listStartFetchInterval = 'never'),
			//  we will always assume "reloads" of the list come before the old version
			return -1;
		}

		override async fetchPage(pageToken: string | null) {
			console.log(`Fetching letterboxd similar items hub for ${metadataId}`);
			const page = await letterboxd.getSimilar(filmOpts);
			return {
				items: page.items.map((film) => {
					return {
						id: film.href,
						token: undefined,
						item: film
					};
				}),
				hasMore: false,
				totalItemCount: page.items?.length ?? 0,
				nextPageToken: null
			};
		}

		override async transformItem(item: letterboxd.Film, context: PseuplexHubContext): Promise<plexTypes.PlexMetadataItem> {
			return await lbtransform.transformLetterboxdFilmHubEntry(item, context, options.letterboxdMetadataProvider, metadataTransformOpts);
		}
	}({
		hubPath: hubPath,
		title: options.title,
		type: plexTypes.PlexMediaItemType.Movie,
		style: options.style,
		hubIdentifier: `${plexTypes.PlexMovieHubIdentifierType.Similar}.letterboxd`,
		context: `hub.${plexTypes.PlexMovieHubIdentifierType.Similar}.letterboxd`,
		promoted: options.promoted,
		defaultItemCount: options.defaultCount ?? 12,
		uniqueItemsOnly: true,
		listStartFetchInterval: 'never'
	});
};
