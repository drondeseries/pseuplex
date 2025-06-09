import { PseuplexConfigBase } from '../../../../pseuplex/configbase';

type OverseerPerUserPluginConfig = {
	//
};
export type OverseerrRequestsPluginConfig = PseuplexConfigBase<OverseerPerUserPluginConfig> & {
	overseerr: {
		host: string;
		apiKey: string;
	}
};
