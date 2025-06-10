
import * as letterboxd from 'letterboxd-retriever';
import * as plexTypes from '../../plex/types';
import {
	PseuplexMetadataTransformOptions,
	PseuplexPartialMetadataIDString,
	qualifyPartialMetadataID,
	PseuplexHubSectionInfo,
	PseuplexFeedHubLoggingOptions,
} from '../../pseuplex';
import * as lbtransform from './transform';
import { LetterboxdMetadataProvider } from './metadata';
import { LetterboxdActivityFeedHub } from './activityfeedhub';
import { LetterboxdFilmsHub } from './filmshub';
import { ListFetchInterval } from '../../fetching/LoadableList';
import { LetterboxdFilmListHub } from './filmlisthub';


export const createUserFollowingFeedHub = (letterboxdUsername: string, options: {
	hubPath: string,
	style: plexTypes.PlexHubStyle,
	promoted: boolean,
	uniqueItemsOnly: boolean,
	metadataTransformOptions?: PseuplexMetadataTransformOptions,
	letterboxdMetadataProvider: LetterboxdMetadataProvider,
	section?: PseuplexHubSectionInfo,
	matchToPlexServerMetadata?: boolean,
	loggingOptions?: PseuplexFeedHubLoggingOptions,
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
		loggingOptions: options.loggingOptions,
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
	defaultCount?: number,
	section?: PseuplexHubSectionInfo,
	matchToPlexServerMetadata?: boolean,
	loggingOptions?: PseuplexFeedHubLoggingOptions,
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
		section: options.section,
		matchToPlexServerMetadata: options.matchToPlexServerMetadata,
		loggingOptions: options.loggingOptions,
	}, async (pageHref: string | null) => {
		let opts: letterboxd.GetSimilarFilmsOptions;
		if(pageHref) {
			opts = {href:pageHref};
		} else {
			opts = filmOpts;
		}
		console.log(`Fetching letterboxd similar items hub for ${metadataId} (pageToken=${JSON.stringify(pageHref)})`);
		return await letterboxd.getSimilarFilms(opts);
	});
};


export const createListHub = async (listId: lbtransform.PseuplexLetterboxdListID, options: {
	path: string,
	style: plexTypes.PlexHubStyle,
	promoted: boolean,
	metadataTransformOptions?: PseuplexMetadataTransformOptions,
	letterboxdMetadataProvider: LetterboxdMetadataProvider,
	defaultCount?: number,
	listStartFetchInterval?: ListFetchInterval,
	section?: PseuplexHubSectionInfo,
	matchToPlexServerMetadata?: boolean,
	loggingOptions?: PseuplexFeedHubLoggingOptions,
}) => {
	const metadataTransformOpts: PseuplexMetadataTransformOptions = options.metadataTransformOptions ?? {
		metadataBasePath: options.letterboxdMetadataProvider.basePath,
		qualifiedMetadataId: false
	};
	const listOpts = lbtransform.getFilmListOptsFromPartialListId(listId);
	return new LetterboxdFilmListHub({
		hubPath: options.path,
		title: `${listOpts.userSlug}'s ${listOpts.listSlug} List`,
		type: plexTypes.PlexMediaItemType.Movie,
		style: options.style,
		hubIdentifier: `${plexTypes.PlexGeneralHubIdentifierType.CustomCollection}.letterboxd`,
		context: `hub.${plexTypes.PlexGeneralHubIdentifierType.CustomCollection}.letterboxd`,
		promoted: options.promoted,
		defaultItemCount: options.defaultCount ?? 12,
		uniqueItemsOnly: false,
		listStartFetchInterval: options.listStartFetchInterval,
		letterboxdMetadataProvider: options.letterboxdMetadataProvider,
		metadataTransformOptions: metadataTransformOpts,
		section: options.section,
		matchToPlexServerMetadata: options.matchToPlexServerMetadata,
		loggingOptions: options.loggingOptions,
	}, async (pageHref: string | null) => {
		let opts: letterboxd.GetFilmListOptions;
		if(pageHref) {
			opts = {href:pageHref};
		} else {
			opts = listOpts;
		}
		console.log(`Fetching letterboxd list ${listId} (pageToken=${JSON.stringify(pageHref)})`);
		return await letterboxd.getFilmList(opts);
	});
};
