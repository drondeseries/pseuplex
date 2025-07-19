
export type URLLogStringArgs = {
	logFullURLs?: boolean
};

export const urlLogString = (args: URLLogStringArgs, urlString: string) => {
	if(args.logFullURLs) {
		return urlString;
	}
	const queryIndex = urlString.indexOf('?');
	if(queryIndex != -1) {
		return urlString.substring(0, queryIndex);
	}
	return urlString;
};
