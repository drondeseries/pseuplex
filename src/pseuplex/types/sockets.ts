import stream from 'stream';

type PseuplexClientWebSocketInfoBase = {
	endpoint: string;
	socket: stream.Duplex;
}

export type PseuplexUnconfirmedClientWebSocketInfo = PseuplexClientWebSocketInfoBase & {
	proxySocket: undefined;
};

export type PseuplexClientWebSocketInfo = PseuplexClientWebSocketInfoBase & {
	proxySocket: stream.Duplex;
};

export type PseuplexPossiblyConfirmedClientWebSocketInfo =
	PseuplexUnconfirmedClientWebSocketInfo
	| PseuplexClientWebSocketInfo;
