
import express from 'express';
import * as plexTypes from '../../plex/types';
import { IncomingPlexAPIRequest } from '../../plex/requesthandling';
import {
	PseuplexApp,
	PseuplexConfigBase,
	PseuplexPlugin,
	PseuplexPluginClass,
	PseuplexReadOnlyResponseFilters
} from '../../pseuplex';

type TemplateFlags = {
	templatePlugin?: {
		enabled?: boolean;
	}
};
type TemplatePerUserPluginConfig = {
	//
} & TemplateFlags;
export type TemplatePluginConfig = PseuplexConfigBase<TemplatePerUserPluginConfig> & TemplateFlags & {
	//
};

export default (class TemplatePlugin implements PseuplexPlugin {
	static slug = '<plugin_name>';
	readonly slug = TemplatePlugin.slug;
	readonly app: PseuplexApp;


	constructor(app: PseuplexApp) {
		this.app = app;
	}

	get config(): TemplatePluginConfig {
		return this.app.config;
	}

	responseFilters?: PseuplexReadOnlyResponseFilters = {
		//
	}

	defineRoutes(router: express.Express) {
		//
	}

} as PseuplexPluginClass);
