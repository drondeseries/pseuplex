
import { PlexMetadataItem } from './Metadata';

export enum PlexLibrarySearchType {
	Movies = 'movies',
	TV = 'tv',
	Music = 'music',
	People = 'people'
}

export type PlexLibrarySearchResult = {
	score: number; // value between 0 and 1
	Metadata: PlexMetadataItem
};

export type PlexLibrarySearchResultsPage = {
	MediaContainer: {
		size: number;
		SearchResult: PlexLibrarySearchResult[];
	}
};
