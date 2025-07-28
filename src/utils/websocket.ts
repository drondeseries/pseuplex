import {
	CloseEvent,
	ErrorEvent,
	MessageEvent,
} from 'undici-types/websocket';

export type WebSocketEventMap = {
	close: CloseEvent
	error: ErrorEvent
	message: MessageEvent
	open: Event
};

export type WebSocketEventEmitterMap = {
	[evt in keyof WebSocketEventMap]: WebSocketEventMap[evt][];
};
