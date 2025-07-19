
export const createDebouncer = (delay: number): ((callback: () => void) => void) => {
	let timeout: NodeJS.Timeout | null = null;
	return (callback: () => void) => {
		if(timeout) {
			clearTimeout(timeout);
		}
		timeout = setTimeout(() => {
			timeout = null;
			callback();
		}, delay);
	};
};
