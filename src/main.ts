
import https from 'https';
import * as constants from './constants';
import {
	Config,
	readConfigFile
} from './config';
import {
	CommandArguments,
	parseCmdArgs
} from './cmdargs';
import {
	SSLConfig,
	readSSLCertAndKey,
	watchSSLCertAndKeyChanges
} from './ssl';
import { PseuplexApp } from './pseuplex';
import LetterboxdPlugin from './plugins/letterboxd';
import RequestsPlugin from './plugins/requests';
import {
	calculatePlexP12Password,
	getPlexP12Path,
	readPlexPreferences
} from './plex/config';
import { PlexPreferences } from './plex/types/preferences';
import { PlexClient } from './plex/client';

let plexPrefs: PlexPreferences | undefined = undefined;
let cfg: Config;
let args: CommandArguments;
const readPlexPrefsIfNeeded = async () => {
	if(!plexPrefs) {
		plexPrefs = await readPlexPreferences({appDataPath:cfg.plex?.appDataPath});
	}
};

(async () => {
	// parse command line arguments
	args = parseCmdArgs(process.argv.slice(2));
	if(!args.configPath) {
		console.error("No config path specified");
		process.exit(1);
	}
	if(args.verbose) {
		console.log(`parsed arguments:\n${JSON.stringify(args, null, '\t')}\n`);
		process.env.DEBUG = '*';
	}

	// load config
	cfg = await readConfigFile(args.configPath);
	if (args.verbose) {
		console.log(`parsed config:\n${JSON.stringify(cfg, null, '\t')}\n`);
	}
	let plexServerURL = cfg.plex.host;
	if(!plexServerURL) {
		console.error("Missing .plex.host in config");
		process.exit(1);
	}
	if(cfg.plex.port) {
		plexServerURL += `:${cfg.plex.port}`;
	}
	if(!plexServerURL.indexOf('://')) {
		plexServerURL = 'http://'+plexServerURL;
	}

	// initialize server SSL
	const sslConfig: SSLConfig = {
		p12Path: cfg.ssl?.p12Path,
		p12Password: cfg.ssl?.p12Password,
		certPath: cfg.ssl?.certPath,
		keyPath: cfg.ssl?.keyPath
	};
	// auto-determine p12 path if needed
	if(!sslConfig.p12Path && cfg.ssl?.autoP12Path) {
		let appDataPath = cfg.plex?.appDataPath;
		if(!appDataPath) {
			// determine the path of plex's app data
			if(process.platform == 'win32') {
				// on windows, we can read plex's registry config to determine the appdata path
				await readPlexPrefsIfNeeded();
				if(plexPrefs.LocalAppDataPath) {
					appDataPath = plexPrefs.LocalAppDataPath;
				}
			}
		}
		sslConfig.p12Path = await getPlexP12Path({appDataPath});
	}
	// calculate p12 password if needed
	if(sslConfig.p12Path && !sslConfig.p12Password && cfg.ssl?.autoP12Password) {
		// get plex ProcessedMachineIdentifier
		let plexMachineId = cfg.plex.processedMachineIdentifier;
		if(!plexMachineId) {
			await readPlexPrefsIfNeeded();
			plexMachineId = plexPrefs.ProcessedMachineIdentifier;
		}
		sslConfig.p12Password = calculatePlexP12Password({ProcessedMachineIdentifier:plexMachineId});
	}
	// read SSL certificates, if any
	const sslCertData = await readSSLCertAndKey(sslConfig);

	// create server
	const pseuplex = new PseuplexApp({
		protocol: cfg.protocol,
		port: cfg.port,
		plexServerURL,
		plexAdminAuthContext: {
			'X-Plex-Token': cfg.plex.token
		},
		plexMetadataClient: new PlexClient({
			serverURL: cfg.plex.metadataHost || 'https://metadata.provider.plex.tv',
			authContext: {
				'X-Plex-Token': cfg.plex.token
			},
			verbose: args.logOutgoingRequests,
		}),
		serverOptions: {
			...sslCertData
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
		plugins: [
			LetterboxdPlugin,
			RequestsPlugin
		],
		config: cfg
	});

	// start server
	pseuplex.listen(() => {
		console.log(`${constants.APP_NAME} is listening at localhost:${pseuplex.port}\n`);
	});

	// watch for certificate changes if this is an SSL server
	if(cfg.ssl?.watchCertChanges && (pseuplex.server as https.Server).setSecureContext) {
		const watcher = watchSSLCertAndKeyChanges(sslConfig, {
			debounceDelay: (cfg.ssl?.certReloadDelay ?? 1000)
		}, (sslCertData) => {
			try {
				console.log("\nUpdating SSL certificate");
				(pseuplex.server as https.Server).setSecureContext(sslCertData);
			} catch(error) {
				console.error("\nFailed to set secure context:");
				console.error(error);
			}
		});
	}

})().catch((error) => {
	console.error(error);
	process.exit(2);
});
