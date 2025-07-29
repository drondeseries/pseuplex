
import stream from 'stream';
import crypto from 'crypto';
import * as plexTypes from '../plex/types';
import { sendWebSocketMessage } from '../utils/stream';

export const NotificationsWebSocketEndpoint = '/:/websockets/notifications';
export const EventSourceNotificationsSocketEndpoint = '/:/eventsource/notifications';



export enum PseuplexNotificationSocketType {
	EventSource = 1,
	Notification = 2,
}

export type PseuplexClientNotificationWebSocketInfo = {
	type: PseuplexNotificationSocketType;
	socket: stream.Duplex;
	proxySocket: stream.Duplex;
};

export type NotificationDataCache = {
	[type: PseuplexNotificationSocketType | number]: string;
};

export const sendNotificationToSocket = (socketInfo: PseuplexClientNotificationWebSocketInfo, notification: plexTypes.PlexNotificationContainer, notifDataCache?: NotificationDataCache) => {
	const { type: socketType, socket } = socketInfo;
	switch(socketType) {
		case PseuplexNotificationSocketType.EventSource: {
			let dataString = notifDataCache?.[socketType];
			if(!dataString) {
				const data: plexTypes.PlexNotificationContainer = {...notification};
				const {type} = data;
				delete data.type;
				delete data.size;
				const dataKeys = Object.keys(data);
				if(dataKeys.length == 0) {
					console.warn(`No data in notification object`);
				} else {
					if(dataKeys.length > 1) {
						console.warn(`More than 1 key in the notification object: ${JSON.stringify(dataKeys)}`);
					}
					const longestKey = dataKeys.sort((a, b) => (b.length - a.length))[0];
					const notifs = notification[longestKey];
					if(notifs.length == 1) {
						notification[longestKey] = notifs[0];
					}
				}
				dataString = `event: ${type}\ndata: ${JSON.stringify(data)}`;
				if(notifDataCache) {
					notifDataCache[socketType] = dataString;
				}
			}
			sendWebSocketMessage(socket, dataString);
		} break;

		case PseuplexNotificationSocketType.Notification: {
			let dataString = notifDataCache?.[socketType];
			if(!dataString) {
				const data: plexTypes.PlexNotificationMessage = {
					NotificationContainer: notification
				};
				dataString = JSON.stringify(data);
				if(notifDataCache) {
					notifDataCache[socketType] = dataString;
				}
			}
			sendWebSocketMessage(socket, dataString);
		} break;

		default:
			console.error(`Unknown notification socket type ${socketInfo.type}`);
			break;
	}
};

export const sendNotificationToSockets = (sockets: PseuplexClientNotificationWebSocketInfo[], notification: plexTypes.PlexNotificationContainer) => {
	const notifDataCache: NotificationDataCache = {};
	for(const socket of sockets) {
		sendNotificationToSocket(socket, notification, notifDataCache);
	}
};




export const sendMediaUnavailableNotifications = (sockets: PseuplexClientNotificationWebSocketInfo[], options: {
	userID: number | string,
	metadataKey: string,
}) => {
	const uuidVal = crypto.randomUUID();
	/*sendMediaUnavailableActivityNotification(sockets, {
		uuid: uuidVal,
		eventType: plexTypes.PlexActivityEventType.Started,
		...options
	});
	sendMediaUnavailableActivityNotification(sockets, {
		uuid: uuidVal,
		eventType: plexTypes.PlexActivityEventType.Updated,
		...options
	});*/
	sendMediaUnavailableActivityNotification(sockets, {
		uuid: uuidVal,
		eventType: plexTypes.PlexActivityEventType.Ended,
		...options
	});
}

export const sendMediaUnavailableActivityNotification = (sockets: PseuplexClientNotificationWebSocketInfo[], options: {
	uuid: string,
	eventType: plexTypes.PlexActivityEventType,
	userID: number | string,
	metadataKey: string
}) => {
	const notification: plexTypes.PlexActivityNotificationContainer = {
		type: plexTypes.PlexNotificationType.Activity,
		size: 1,
		ActivityNotification: [
			{
				event: options.eventType,
				uuid: options.uuid,
				Activity: {
					uuid: options.uuid,
					type: plexTypes.PlexActivityType.LibraryRefreshItems,
					cancellable: false,
					userID: options.userID as number,
					title: "Refreshing",
					subtitle: "Checking Availability",
					progress: 100,
					Context: {
						accessible: false,
						analyzed: false,
						exists: false,
						key: options.metadataKey,
						refreshed: false
					}
				}
			}
		]
	};
	sendNotificationToSockets(sockets, notification);
};



export const sendMetadataRefreshTimelineNotifications = (sockets: PseuplexClientNotificationWebSocketInfo[], items: {
	itemID: string,
	sectionID: string,
	type: plexTypes.PlexMediaItemTypeNumeric,
	updatedAt: number,
}[]) => {
	sendMetadataRefreshTimelineEntryNotification(sockets, items.map((item) => {
		return {
			state: plexTypes.PlexTimelineEntryNotificationState.StartedRefresh,
			metadataState: plexTypes.PlexTimelineEntryNotificationMetadataState.Queued,
			title: `Refreshing ${item.itemID}`,
			...item,
		};
	}));

	sendMetadataRefreshTimelineEntryNotification(sockets, items.map((item) => {
		return {
			state: plexTypes.PlexTimelineEntryNotificationState.FinishedRefresh,
			title: `Done refreshing ${item.itemID}`,
			...item,
		};
	}));
};

export const sendMetadataRefreshTimelineEntryNotification = (sockets: PseuplexClientNotificationWebSocketInfo[], items: {
	itemID: string,
	type: plexTypes.PlexMediaItemTypeNumeric,
	sectionID?: string,
	state: plexTypes.PlexTimelineEntryNotificationState,
	metadataState?: plexTypes.PlexTimelineEntryNotificationMetadataState,
	title: string,
	updatedAt: number,
}[]) => {
	const notification: plexTypes.PlexTimelineEntryNotificationContainer = {
		type: plexTypes.PlexNotificationType.Timeline,
		size: items.length,
		TimelineEntry: items.map((item) => {
			return {
				identifier: plexTypes.PlexPluginIdentifier.PlexAppLibrary,
				...item,
			};
		})
	};
	sendNotificationToSockets(sockets, notification);
};
