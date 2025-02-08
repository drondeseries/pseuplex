
import http from 'http';
import express from 'express';
import * as plexTypes from '../plex/types';
import { IncomingPlexAPIRequest } from '../plex/requesthandling';
import { PseuplexMetadataPage } from './types';
import { PseuplexHubProvider } from './hub';
import { PseuplexMetadataProvider } from './metadata';
import { PseuplexMetadataIDParts } from './metadataidentifier';


export type PseuplexResponseFilterContext = {
	userReq: IncomingPlexAPIRequest;
	userRes: express.Response;
	proxyRes?: http.IncomingMessage;
	params?: { [key: string]: any };
	previousFilterPromises?: Promise<void>[];
};

export type PseuplexResponseFilter<TResponseData, TContext extends PseuplexResponseFilterContext = PseuplexResponseFilterContext> = (resData: TResponseData, context: TContext) => void | Promise<void>;
export type PseuplexResponseFilters = {
	hubs?: PseuplexResponseFilter<plexTypes.PlexLibraryHubsPage>;
	promotedHubs?: PseuplexResponseFilter<plexTypes.PlexLibraryHubsPage>;
	metadata?: PseuplexResponseFilter<PseuplexMetadataPage>;
	metadataRelatedHubs?: PseuplexResponseFilter<plexTypes.PlexHubsPage, (PseuplexResponseFilterContext & {
		metadataIds: PseuplexMetadataIDParts[]
	})>;
	findGuidInLibrary?: PseuplexResponseFilter<plexTypes.PlexMetadataPage, PseuplexResponseFilterContext>;

	metadataFromProvider?: PseuplexResponseFilter<PseuplexMetadataPage, (PseuplexResponseFilterContext & {
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
};


export interface PseuplexPlugin {
	readonly metadata?: PseuplexMetadataProvider;
	readonly hubs?: { [hubName: string]: PseuplexHubProvider };
	readonly responseFilters?: PseuplexReadOnlyResponseFilters;

	defineRoutes?: (router: express.Express) => void;
	resolvePlayQueueURI?: (uri: plexTypes.PlexPlayQueueURIParts, options: PseuplexPlayQueueURIResolverOptions) => Promise<string | false>;
};
