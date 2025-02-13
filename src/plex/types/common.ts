
export enum PlexPluginIdentifier {
	PlexAppLibrary = 'com.plexapp.plugins.library',
	PlexTVDiscover = 'tv.plex.provider.discover'
}

export type PlexXMLBoolean = '1' | '0' | 1 | 0 | boolean;

export enum PlexSymbol {
	Star = 'star',
	Library = 'library',
	Stack = 'stack',
	Playlist = 'playlist'
}

export enum PlexLibraryAgent {
	Movie = 'tv.plex.agents.movie',
	TVSeries = 'tv.plex.agents.series'
}

export enum PlexLibraryScanner {
	Movie = 'Plex Movie',
	TVSeries = 'Plex TV Series'
}

export enum PlexMovieContentRating {
	Restricted = 'R'
}

export enum PlexTVContentRating {
	Mature = 'TV-MA'
}

export type PlexContentRating = PlexMovieContentRating | PlexTVContentRating;

export enum PlexMediaItemType {
	Movie = 'movie',
	TVShow = 'show',
	Season = 'season',
	Episode = 'episode',
	Album = 'album',
	Clip = 'clip',
	Photos = 'photos',
	Playlist = 'playlist',
	Mixed = 'mixed'
}

export enum PlexMediaItemTypeNumeric {
	Movie = 1,
	Show = 2,
	Season = 3,
	Episode = 4
}

export const PlexMediaItemTypeToNumeric = {
	[PlexMediaItemType.Movie]: PlexMediaItemTypeNumeric.Movie,
	[PlexMediaItemType.TVShow]: PlexMediaItemTypeNumeric.Show,
	[PlexMediaItemType.Season]: PlexMediaItemTypeNumeric.Season,
	[PlexMediaItemType.Episode]: PlexMediaItemTypeNumeric.Episode
};

export const PlexMediaItemNumericToType = {
	[PlexMediaItemTypeNumeric.Movie]: PlexMediaItemType.Movie,
	[PlexMediaItemTypeNumeric.Show]: PlexMediaItemType.TVShow,
	[PlexMediaItemTypeNumeric.Season]: PlexMediaItemType.Season,
	[PlexMediaItemTypeNumeric.Episode]: PlexMediaItemType.Episode
};
