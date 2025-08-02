
import fs from 'fs';
import { SSLConfig } from './utils/ssl';
import { IPv4NormalizeModeKey } from './utils/ip';
import { PseuplexConfigBase } from './pseuplex/configbase';
import { PseuplexServerProtocol } from './pseuplex/types/server';
import { LetterboxdPluginConfig } from './plugins/letterboxd/config';
import { RequestsPluginConfig } from './plugins/requests/config';
import { OverseerrRequestsPluginConfig } from './plugins/requests/providers/overseerr/config';
import { LoggingOptions } from './logging';

export type Config = {
	protocol?: PseuplexServerProtocol,
	port: number;
	ipv4ForwardingMode?: IPv4NormalizeModeKey;
	forwardMetadataRefreshToPluginMetadata?: boolean;
	plex: {
		host?: string;
		port?: number;
		token: string;
		processedMachineIdentifier?: string;
		appDataPath?: string;
		metadataHost?: string;
		notificationSocketRetryInterval?: number;
	},
	ssl?: SSLConfig & {
		autoP12Path?: boolean;
		autoP12Password?: boolean;
		watchCertChanges?: boolean;
		certReloadDelay?: number;
	},
	logging?: LoggingOptions;
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
