
import * as letterboxd from 'letterboxd-retriever';
import * as plexTypes from '../../plex/types';
import {
	PseuplexMetadataTransformOptions,
	PseuplexPartialMetadataIDString,
	qualifyPartialMetadataID,
	PseuplexHubSectionInfo,
} from '../../pseuplex';
import * as lbtransform from './transform';
import { LetterboxdMetadataProvider } from './metadata';
import { LetterboxdActivityFeedHub } from './activityfeedhub';
import { LetterboxdFilmsHub } from './filmshub';


export const createUserFollowingFeedHub = (letterboxdUsername: string, options: {
	hubPath: string,
	style: plexTypes.PlexHubStyle,
	promoted: boolean,
	uniqueItemsOnly: boolean,
	metadataTransformOptions?: PseuplexMetadataTransformOptions,
	letterboxdMetadataProvider: LetterboxdMetadataProvider,
	section?: PseuplexHubSectionInfo,
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
		section: options.section,
		matchToPlexServerMetadata: options.matchToPlexServerMetadata,
	}, async (pageToken) => {
		console.log(`Fetching user following feed for ${letterboxdUsername} (pageToken=${JSON.stringify(pageToken)})`);
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
	return new LetterboxdFilmsHub({
		hubPath: hubPath,
		title: options.title,
		type: plexTypes.PlexMediaItemType.Movie,
		style: options.style,
		hubIdentifier: `${plexTypes.PlexMovieHubIdentifierType.Similar}.letterboxd`,
		context: `hub.${plexTypes.PlexMovieHubIdentifierType.Similar}.letterboxd`,
		promoted: options.promoted,
		defaultItemCount: options.defaultCount ?? 12,
		uniqueItemsOnly: true,
		listStartFetchInterval: 'never',
		letterboxdMetadataProvider: options.letterboxdMetadataProvider,
		metadataTransformOptions: metadataTransformOpts,
	}, async (pageHref: string | null) => {
		let opts: letterboxd.GetSimilarFilmsOptions;
		if(pageHref) {
			opts = {href:pageHref};
		} else {
			opts = filmOpts;
		}
		console.log(`Fetching letterboxd similar items hub for ${metadataId}`);
		return await letterboxd.getSimilarFilms(opts);
	});
};
