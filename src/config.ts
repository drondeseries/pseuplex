
import fs from 'fs';
import { PseuplexConfigBase } from './pseuplex/configbase';
import { PseuplexServerProtocol } from './pseuplex/types/server';
import { LetterboxdPluginConfig } from './plugins/letterboxd';

export type Config = {
	protocol: PseuplexServerProtocol,
	port: number;
	plex: {
		serverURL: string;
		host?: string;
		port?: number;
		token: string;
	},
	ssl: {
		keyPath: string,
		certPath: string
	},
} & PseuplexConfigBase<{}> & LetterboxdPluginConfig;

export const readConfigFile = (path: string): Config => {
	const data = fs.readFileSync(path, 'utf8');
	const cfg: Config = JSON.parse(data);
	if(!cfg || typeof cfg !== 'object') {
		throw new Error("Invalid config file");
	}
	if(!cfg.perUser) {
		cfg.perUser = {};
	}
	return cfg;
};
