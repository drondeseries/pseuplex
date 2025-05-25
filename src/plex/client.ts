import qs from 'querystring';
import * as plexServerAPI from './api';
import * as plexTypes from "./types";
import { firstOrSingle } from '../utils';


export type PlexClientMethodOptions = {
	authContext?: plexTypes.PlexAuthContext
};

export class PlexClient {
	readonly serverURL: string;
	readonly authContext: plexTypes.PlexAuthContext;

	constructor(options: {
		serverURL: string,
		authContext: plexTypes.PlexAuthContext
	}) {
		this.serverURL = options.serverURL;
		this.authContext = options.authContext;
	}
	
	private _mediaProviderClient: PlexMediaProviderClient | Promise<PlexMediaProviderClient>;
	async getMediaProvider(options?: PlexClientMethodOptions): Promise<PlexMediaProviderClient> {
		if(!this._mediaProviderClient || options?.authContext) {
			const mediaProviderTask = getPlexMediaProviderClient(this.serverURL, this.authContext);
			if(options?.authContext) {
				return await mediaProviderTask;
			}
			try {
				this._mediaProviderClient = mediaProviderTask;
				this._mediaProviderClient = await mediaProviderTask;
			} catch(error) {
				this._mediaProviderClient = undefined;
				throw error;
			}
		}
		return this._mediaProviderClient;
	}

	private async _getMediaProviderMethod<TMethodName extends keyof PlexMediaProviderClient>(name: TMethodName): Promise<PlexMediaProviderClient[TMethodName]> {
		const mediaProvider = await this.getMediaProvider();
		const method = mediaProvider[name];
		if(!method) {
			throw new Error(`Cannot resolve method ${name} from ${this.serverURL}`);
		}
		return method;
	}

	async getMetadata(ids: string | string[], params?: plexTypes.PlexMetadataPageParams, options?: PlexClientMethodOptions) {
		return (await this._getMediaProviderMethod('getMetadata'))(ids, params, options);
	}

	async getMetadataChildren(id: string, params?: plexTypes.PlexMetadataChildrenPageParams, options?: PlexClientMethodOptions) {
		return (await this._getMediaProviderMethod('getMetadataChildren'))(id, params, options);
	}

	async getMatches(params?: plexTypes.PlexGetLibraryMatchesParams, options?: PlexClientMethodOptions) {
		return (await this._getMediaProviderMethod('getMatches'))(params, options);
	}
}


export const getPlexMediaProviderClient = async (serverURL: string, authContext: plexTypes.PlexAuthContext): Promise<PlexMediaProviderClient> => {
	const rootPage: plexTypes.PlexServerRootPage | plexTypes.PlexProviderRootPage = await plexServerAPI.fetch({
		serverURL,
		authContext,
		method: 'GET',
		endpoint: '/'
	});
	if('MediaProvider' in rootPage) {
		return new PlexMediaProviderClient(rootPage.MediaProvider, {
			baseURL: serverURL,
			authContext
		});
	} else if(rootPage.MediaContainer) {
		const providersPage = await plexServerAPI.getMediaProviders({
			serverURL,
			authContext
		});
		if(providersPage.MediaContainer.MediaProvider) {
			const mediaProvider = firstOrSingle(providersPage.MediaContainer.MediaProvider);
			if(mediaProvider) {
				return new PlexMediaProviderClient(mediaProvider, {
					baseURL: serverURL,
					authContext
				});
			}
		}
		throw new Error(`No media providers found for ${serverURL}`);
	}
	throw new Error(`Failed to get media providers from ${serverURL}`);
};



type PlexSubclientOptions = {
	baseURL: string;
	authContext: plexTypes.PlexAuthContext;
};

type PlexSubclientFeatureBase<TFeatureType> = {
	type: TFeatureType;
};

type PrivateFeatureMethod<TFeature extends PlexSubclientFeatureBase<any>,TArg extends Array<any>,TReturn> = (feature: TFeature, ...args: TArg) => TReturn;
type PublicFeatureMethod<TArg extends Array<any>,TReturn> = (...args: TArg) => TReturn;



abstract class PlexSubclientBase<TData,TFeatureType,TFeature extends PlexSubclientFeatureBase<TFeatureType>> {
	readonly data: TData;
	readonly baseURL: string;
	readonly authContext: plexTypes.PlexAuthContext;

	constructor(data: TData, options: PlexSubclientOptions) {
		this.data = data;
		this.baseURL = options.baseURL;
		this.authContext = options.authContext;
	}


	async fetch(options: {
		authContext?: plexTypes.PlexAuthContext,
		method?: 'GET' | 'POST' | 'PUT' | 'DELETE',
		endpoint: string,
		params?: {[key: string]: string | number | boolean | string[] | number[]} | null,
		headers?: {[key: string]: string}
	}): Promise<any> {
		return await plexServerAPI.fetch({
			...options,
			serverURL: this.baseURL,
			authContext: options.authContext ?? this.authContext
		});
	}


	protected abstract get _subclientFeatures(): (TFeature[] | undefined);

	protected _featureMethod<TArg extends Array<any>, TReturn>(
		type: TFeatureType,
		method: PrivateFeatureMethod<TFeature,TArg,TReturn>): (PublicFeatureMethod<TArg,TReturn> | undefined) {
		const feature = this._subclientFeatures?.find((f) => f.type == type);
		if(!feature) {
			return undefined;
		}
		return (...args: TArg) => {
			return method.call(this, feature, ...args);
		};
	}
}



type UniversalSearchParams = plexTypes.PlexLibrarySearchParams | plexTypes.PlexTVSearchParams | (plexTypes.PlexLibrarySearchParams & plexTypes.PlexTVSearchParams);

export class PlexMediaProviderClient extends PlexSubclientBase<
	plexTypes.PlexMediaProvider,
	plexTypes.PlexFeatureType,
	plexTypes.PlexMediaProviderFeature> {
	
	protected override get _subclientFeatures() { return this.data?.Feature; };
	
	get getMatches() { return this._featureMethod(plexTypes.PlexFeatureType.Match, this._getMatches); }
	private async _getMatches(feature: plexTypes.PlexFeature, params: plexTypes.PlexGetLibraryMatchesParams, options?: PlexClientMethodOptions): Promise<plexTypes.PlexMetadataPage> {
		return await this.fetch({
			endpoint: feature.key,
			method: 'GET',
			params: params,
			authContext: options?.authContext
		});
	}

	get search() { return this._featureMethod(plexTypes.PlexFeatureType.UniversalSearch, this._search); }
	private async _search(feature: plexTypes.PlexFeature, params: UniversalSearchParams, options?: PlexClientMethodOptions): Promise<plexTypes.PlexSearchResultsPage> {
		return await this.fetch({
			endpoint: feature.key,
			method: 'GET',
			params: params,
			authContext: options?.authContext
		});
	}

	get getMetadata() { return this._featureMethod(plexTypes.PlexFeatureType.Metadata, this._getMetadata); }
	private async _getMetadata(feature: plexTypes.PlexFeature, ids: string | string[], params?: plexTypes.PlexMetadataPageParams, options?: PlexClientMethodOptions): Promise<plexTypes.PlexMetadataPage> {
		const idString = (ids instanceof Array) ? ids.map((idVal) => qs.escape(idVal)).join(',') : qs.escape(ids);
		return await this.fetch({
			endpoint: `${feature.key}/${idString}`,
			method: 'GET',
			params: params,
			authContext: options?.authContext
		});
	}

	get getMetadataChildren() { return this._featureMethod(plexTypes.PlexFeatureType.Metadata, this._getMetadataChildren); }
	private async _getMetadataChildren(feature: plexTypes.PlexFeature, id: string, params?: plexTypes.PlexMetadataChildrenPageParams, options?: PlexClientMethodOptions): Promise<plexTypes.PlexMetadataPage> {
		return await this.fetch({
			endpoint: `${feature.key}/${qs.escape(id)}/children`,
			method: 'GET',
			params: params,
			authContext: options?.authContext
		});
	}
	
	get getSettings() { return this._featureMethod(plexTypes.PlexFeatureType.Settings, this._getSettings); }
	private _settingsClient: PlexMediaProviderSettingsClient | Promise<PlexMediaProviderSettingsClient> | undefined;
	private async _getSettings(feature: plexTypes.PlexFeature, options?: PlexClientMethodOptions) {
		if(!this._settingsClient || options?.authContext) {
			const settingsClientTask = this.fetch({
				endpoint: feature.key,
				method: 'GET',
				authContext: options.authContext
			}).then((settingsPage: plexTypes.PlexMediaProviderSettingsPage) => {
				return new PlexMediaProviderSettingsClient(settingsPage, {
					baseURL: this.baseURL,
					authContext: this.authContext
				});
			});
			if(options?.authContext) {
				return await settingsClientTask;
			}
			try {
				this._settingsClient = settingsClientTask;
				this._settingsClient = await settingsClientTask;
			} catch(error) {
				this._settingsClient = undefined;
				throw error;
			}
		}
		return this._settingsClient;
	}
}



export class PlexMediaProviderSettingsClient extends PlexSubclientBase<
	plexTypes.PlexMediaProviderSettingsPage,
	plexTypes.PlexMediaProviderSettingType,
	plexTypes.PlexMediaProviderSetting> {
	
	protected override get _subclientFeatures() { return this.data?.MediaContainer?.Setting; };

	get getSearchProviders() { return this._featureMethod(plexTypes.PlexMediaProviderSettingType.SearchProviders, this._getSearchProviders); }
	private async _getSearchProviders(setting: plexTypes.PlexMediaProviderSetting, options?: PlexClientMethodOptions): Promise<plexTypes.PlexTVSearchProvidersPage> {
		return await this.fetch({
			endpoint: setting.key,
			method: 'GET',
			authContext: options?.authContext
		});
	}
}
