import stream from 'stream';

export type PseuplexPossiblyConfirmedClientWebSocketInfo = {
	endpoint: string;
	socket: stream.Duplex;
	proxySocket?: stream.Duplex;
};

export type PseuplexUnconfirmedClientWebSocketInfo = PseuplexPossiblyConfirmedClientWebSocketInfo & {
	proxySocket: undefined;
};

export type PseuplexClientWebSocketInfo = PseuplexPossiblyConfirmedClientWebSocketInfo & {
	proxySocket: stream.Duplex;
};



export enum PseuplexNotificationSocketType {
	EventSource = 1,
	Notification = 2,
}

export const PseuplexNotificationSocketTypeToName: {[key: number]: string} = {};
for(const key of Object.keys(PseuplexNotificationSocketType)) {
	const val = PseuplexNotificationSocketType[key];
	PseuplexNotificationSocketTypeToName[val] = key;
}

export type PseuplexClientNotificationWebSocketInfo = {
	plexToken: string;
	type: PseuplexNotificationSocketType;
	socket: stream.Duplex;
	proxySocket: stream.Duplex;
};
