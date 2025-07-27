import stream from 'stream';

export type PseuplexUnconfirmedClientWebSocketInfo = {
	socket: stream.Duplex;
	proxySocket: undefined;
};

export type PseuplexClientWebSocketInfo = {
	socket: stream.Duplex;
	proxySocket: stream.Duplex;
};

export type PseuplexPossiblyConfirmedClientWebSocketInfo =
	PseuplexUnconfirmedClientWebSocketInfo
	| PseuplexClientWebSocketInfo;
