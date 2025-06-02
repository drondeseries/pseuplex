
import http from 'http';
import express from 'express';
import * as plexTypes from '../plex/types';
import { IncomingPlexAPIRequest } from '../plex/requesthandling';
import { PlexServerAccountInfo } from '../plex/accounts';
import { PseuplexMetadataPage } from './types';
import { PseuplexHubProvider } from './hub';
import { PseuplexMetadataProvider } from './metadata';
import { PseuplexMetadataIDParts, PseuplexPartialMetadataIDParts } from './metadataidentifier';
import { PseuplexSection } from './section';


export type PseuplexResponseFilterContext = {
	userReq: IncomingPlexAPIRequest;
	userRes: express.Response;
	proxyRes?: http.IncomingMessage;
	previousFilterPromises?: Promise<void>[];
};

export type PseuplexResponseFilter<TResponseData, TContext extends PseuplexResponseFilterContext = PseuplexResponseFilterContext> = (resData: TResponseData, context: TContext) => void | Promise<void>;
export type PseuplexResponseFilters = {
	mediaProviders?: PseuplexResponseFilter<plexTypes.PlexServerMediaProvidersPage>;
	hubs?: PseuplexResponseFilter<plexTypes.PlexLibraryHubsPage>;
	promotedHubs?: PseuplexResponseFilter<plexTypes.PlexLibraryHubsPage>;
	metadata?: PseuplexResponseFilter<PseuplexMetadataPage>;
	metadataRelatedHubs?: PseuplexResponseFilter<plexTypes.PlexHubsPage, (PseuplexResponseFilterContext & {
		metadataId: PseuplexMetadataIDParts
	})>;
	findGuidInLibrary?: PseuplexResponseFilter<plexTypes.PlexMetadataPage, PseuplexResponseFilterContext>;

	metadataFromProvider?: PseuplexResponseFilter<PseuplexMetadataPage, (PseuplexResponseFilterContext & {
		metadataProvider: PseuplexMetadataProvider
	})>;
	metadataRelatedHubsFromProvider?: PseuplexResponseFilter<plexTypes.PlexHubsPage, (PseuplexResponseFilterContext & {
		metadataId: PseuplexPartialMetadataIDParts,
		metadataProvider: PseuplexMetadataProvider
	})>;
};
export type PseuplexResponseFilterName = keyof PseuplexResponseFilters;
export type PseuplexReadOnlyResponseFilters = {
	readonly [filterName in PseuplexResponseFilterName]?: PseuplexResponseFilters[filterName];
};

export type PseuplexPlayQueueURIResolverOptions = {
	plexMachineIdentifier: string;
	plexServerURL: string;
	plexAuthContext: plexTypes.PlexAuthContext;
	plexUserInfo: PlexServerAccountInfo;
};


export interface PseuplexPlugin {
	readonly sections?: PseuplexSection[];
	readonly metadataProviders?: PseuplexMetadataProvider[];
	readonly hubs?: { readonly [hubName: string]: PseuplexHubProvider };
	readonly responseFilters?: PseuplexReadOnlyResponseFilters;

	defineRoutes?: (router: express.Express) => void;
	resolvePlayQueueURI?: (uri: plexTypes.PlexPlayQueueURIParts, options: PseuplexPlayQueueURIResolverOptions) => Promise<string | false>;
};
