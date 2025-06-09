
import { PseuplexConfigBase } from '../../pseuplex/configbase';

type TemplateFlags = {
	templatePlugin?: {
		enabled?: boolean;
	}
};
type TemplatePerUserPluginConfig = {
	//
} & TemplateFlags;
export type TemplatePluginConfig = PseuplexConfigBase<TemplatePerUserPluginConfig> & TemplateFlags & {
	//
};
