
import fs from 'fs';
import { SSLConfig } from './ssl';
import { PseuplexConfigBase } from './pseuplex/configbase';
import { PseuplexServerProtocol } from './pseuplex/types/server';
import { LetterboxdPluginConfig } from './plugins/letterboxd';
import { RequestsPluginConfig } from './plugins/requests';
import { OverseerrRequestsPluginConfig } from './plugins/requests/providers/overseerr';

export type Config = {
	protocol: PseuplexServerProtocol,
	port: number;
	plex: {
		host?: string;
		port?: number;
		token: string;
		processedMachineIdentifier?: string;
		appDataPath?: string;
	},
	ssl?: SSLConfig & {
		autoP12Path?: boolean;
		autoP12Password?: boolean;
		watchCertChanges?: boolean;
		certReloadDelay?: number;
	},
} & PseuplexConfigBase<{}>
	& LetterboxdPluginConfig
	& RequestsPluginConfig
	& OverseerrRequestsPluginConfig;

export const readConfigFile = async (path: string): Promise<Config> => {
	const data = await fs.promises.readFile(path, 'utf8');
	const cfg: Config = JSON.parse(data);
	if(!cfg || typeof cfg !== 'object') {
		throw new Error("Invalid config file");
	}
	if(!cfg.perUser) {
		cfg.perUser = {};
	}
	return cfg;
};
