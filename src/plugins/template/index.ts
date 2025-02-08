
import express from 'express';
import {
	PseuplexApp,
	PseuplexConfigBase,
	PseuplexPlugin,
	PseuplexPluginClass,
	PseuplexReadOnlyResponseFilters
} from '../../pseuplex';

type TemplateFlags = {
	requestsEnabled?: boolean;
};
type TemplatePerUserConfig = {
	letterboxdUsername?: string;
} & TemplateFlags;
export type TemplatePluginConfig = (PseuplexConfigBase<TemplatePerUserConfig> & TemplateFlags);

export default (class TemplatePlugin implements PseuplexPlugin {
	static slug = '<template>';
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
