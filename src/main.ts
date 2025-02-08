
import https from 'https';
import * as constants from './constants';
import { readConfigFile } from './config';
import { parseCmdArgs } from './cmdargs';
import {
	SSLConfig,
	readSSLCertAndKey,
	watchSSLCertAndKeyChanges
} from './ssl';
import { PseuplexApp } from './pseuplex';
import LetterboxdPlugin from './plugins/letterboxd';
import {
	calculatePlexP12Password,
	getPlexP12Path,
	readPlexPreferences
} from './plex/config';
import { PlexPreferences } from './plex/types/preferences';

(async () => {
	let plexPrefs: PlexPreferences;

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
	const cfg = await readConfigFile(args.configPath);
	if (args.verbose) {
		console.log(`parsed config:\n${JSON.stringify(cfg, null, '\t')}\n`);
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
	const sslConfig: SSLConfig = {
		p12Path: cfg.ssl?.p12Path,
		p12Password: cfg.ssl?.p12Password,
		certPath: cfg.ssl?.certPath,
		keyPath: cfg.ssl?.keyPath
	};
	// auto-determine p12 path if needed
	if(!sslConfig.p12Path && cfg.ssl?.autoP12Path) {
		if(!plexPrefs) {
			plexPrefs = await readPlexPreferences({appDataPath:cfg.plex?.appDataPath});
		}
		let appDataPath = cfg.plex?.appDataPath;
		if(process.platform == 'win32' && plexPrefs.LocalAppDataPath) {
			appDataPath = plexPrefs.LocalAppDataPath;
		}
		sslConfig.p12Path = await getPlexP12Path({appDataPath});
	}
	// calculate p12 password if needed
	if(sslConfig.p12Path && !sslConfig.p12Password && cfg.ssl?.autoP12Password) {
		if(!plexPrefs) {
			plexPrefs = await readPlexPreferences({appDataPath:cfg.plex?.appDataPath});
		}
		const plexMachineId = cfg.plex.processedMachineIdentifier || plexPrefs.ProcessedMachineIdentifier;
		sslConfig.p12Password = calculatePlexP12Password({ProcessedMachineIdentifier:plexMachineId});
	}
	// read SSL certificates, if any
	const sslCertData = await readSSLCertAndKey(sslConfig);

	// create server
	const pseuplex = new PseuplexApp({
		protocol: cfg.protocol,
		plexServerURL,
		plexAdminAuthContext: {
			'X-Plex-Token': cfg.plex.token
		},
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
		plugins: [LetterboxdPlugin],
		config: cfg
	});

	// start server
	pseuplex.server.listen(cfg.port, () => {
		console.log(`${constants.APP_NAME} is listening at localhost:${cfg.port}\n`);
	});

	// watch for certificate changes if this is an SSL server
	if(cfg.ssl?.watchCertChanges && (pseuplex.server as https.Server).setSecureContext) {
		const watcher = watchSSLCertAndKeyChanges(sslConfig, {debounceDelay:(cfg.ssl?.certReloadDelay ?? 1000)}, (sslCertData) => {
			try {
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
