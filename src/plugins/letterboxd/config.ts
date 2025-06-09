import { PseuplexConfigBase } from '../../pseuplex/configbase';

type LetterboxdFlags = {
	letterboxd?: {
		similarItemsEnabled?: boolean;
		friendsActivityHubEnabled?: boolean;
		friendsReviewsEnabled?: boolean;
	},
};
type LetterboxdPerUserPluginConfig = {
	letterboxd?: {
		username?: string;
	},
} & LetterboxdFlags;
export type LetterboxdPluginConfig = (PseuplexConfigBase<LetterboxdPerUserPluginConfig> & LetterboxdFlags);
