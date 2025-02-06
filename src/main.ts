
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

// create server
const pseuplex = new PseuplexApp({
	config: cfg,
	args,
	plugins: [LetterboxdPlugin]
});

// start server
pseuplex.server.on('error', (error) => {
	console.error(error);
});
pseuplex.server.listen(cfg.port, () => {
	console.log(`${constants.APP_NAME} is listening at localhost:${cfg.port}\n`);
});
