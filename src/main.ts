
import fs from 'fs';
import * as constants from './constants';
import { readConfigFile } from './config';
import { parseCmdArgs } from './cmdargs';
import { PseuplexApp } from './pseuplex';
import LetterboxdPlugin from './plugins/letterboxd';

// parse command line arguments
const args = parseCmdArgs(process.argv.slice(2));
if(!args.configPath) {
	console.error("No config path specified");
	process.exit(1);
}
if(args.verbose) {
	console.log(`parsed arguments:\n${JSON.stringify(args, null, '\t')}\n`);
}

// load config
const cfg = readConfigFile(args.configPath);
if (args.verbose) {
	console.log(`parsed config:\n${JSON.stringify(cfg, null, '\t')}\n`);
}
if (!cfg.ssl?.keyPath) {
	console.error("No ssl key path specified in config");
	process.exit(1);
}
if (!cfg.ssl?.certPath) {
	console.error("No ssl cert path specified in config");
	process.exit(1);
}
let plexServerURL = cfg.plex.serverURL;
if(!plexServerURL) {
	if(!cfg.plex.host) {
		console.error("Missing .plex.serverURL in config");
		process.exit(1);
	} else if(!cfg.plex.port) {
		console.error("Missing .plex.port in config");
		process.exit(1);
	}
	plexServerURL = cfg.plex.host.indexOf('://') != -1 ? `${cfg.plex.host}:${cfg.plex.port}` : `http://${cfg.plex.host}:${cfg.plex.port}`;
}

// create server
const pseuplex = new PseuplexApp({
	protocol: cfg.protocol,
	plexServerURL,
	plexAdminAuthContext: {
		'X-Plex-Token': cfg.plex.token
	},
	serverOptions: {
		key: cfg.ssl.keyPath ? fs.readFileSync(cfg.ssl.keyPath) : undefined,
		cert: cfg.ssl.certPath ? fs.readFileSync(cfg.ssl.certPath) : undefined
	},
	loggingOptions: {
		logUserRequests: args.logUserRequests,
		logProxyRequests: args.logProxyRequests,
		logProxyResponses: args.logProxyResponses,
		logProxyResponseBody: args.logProxyResponseBody,
		logUserResponses: args.logUserResponses,
		logUserResponseBody: args.logUserResponseBody,
		logFullURLs: args.logFullURLs
	},
	plugins: [LetterboxdPlugin],
	config: cfg
});

// start server
pseuplex.server.listen(cfg.port, () => {
	console.log(`${constants.APP_NAME} is listening at localhost:${cfg.port}\n`);
});
