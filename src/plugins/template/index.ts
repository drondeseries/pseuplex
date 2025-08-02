
import express from 'express';
import * as plexTypes from '../../plex/types';
import { IncomingPlexAPIRequest } from '../../plex/requesthandling';
import {
	PseuplexApp,
	PseuplexPlugin,
	PseuplexPluginClass,
	PseuplexReadOnlyResponseFilters
} from '../../pseuplex';
import { TemplatePluginConfig } from './config';
import { TemplatePluginDef } from './plugindef';

export default (class TemplatePlugin implements TemplatePluginDef, PseuplexPlugin {
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
