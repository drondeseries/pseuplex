import { HttpResponseError } from '../utils/error';
import { delay } from '../utils/timing';

export type RequestExecutorOptions = {
	maxRetries: number;
	defaultDelay: number;
	minimumDelay?: number;
}

export class RequestExecutor {
	options: RequestExecutorOptions;
	
	private _requestPromises = new Set<Promise<any>>();
	private _retryingRequestCount: number = 0;
	private _nextRetryTime: number | null = null;

	constructor(options?: RequestExecutorOptions) {
		this.options = options || {
			maxRetries: 3,
			defaultDelay: 5
		};
	}
	
	async do<T>(work: () => Promise<T>, abortSignal?: AbortSignal): Promise<T> {
		const delaySeconds = (this._nextRetryTime ? (this._nextRetryTime - process.uptime()) : 0);
		return await this._delayAndThenDoWork(delaySeconds, this.options.maxRetries, abortSignal, work, true);
	}
	
	private async _delayAndThenDoWork<T>(
		delaySeconds: number,
		remainingRetries: number,
		abortSignal: AbortSignal | null,
		work: () => Promise<T>,
		firstAttempt: boolean,
	) {
		abortSignal?.throwIfAborted();
		// check if request should be delayed
		if(delaySeconds > 0 || this._retryingRequestCount > 0) {
			if(delaySeconds > 0) {
				console.warn(`Waiting ${delaySeconds} seconds to send request`);
				await delay(delaySeconds * 1000, abortSignal);
			}
			abortSignal?.throwIfAborted();
			// wait until no request is being sent
			if(this._requestPromises.size > 0) {
				console.warn(`Waiting for pending requests to finish`);
				while(this._requestPromises.size > 0) {
					try {
						await Promise.allSettled(this._requestPromises);
					} catch {}
					abortSignal?.throwIfAborted();
				}
			}
		}
		// do the request
		if(remainingRetries <= 0) {
			return await this._performRequestWork(work);
		}
		try {
			return await this._performRequestWork(work);
		} catch(error) {
			if(abortSignal?.aborted) {
				throw error;
			}
			const res = (error as HttpResponseError)?.httpResponse;
			if (res && res.status == 429) {
				// Got 429, which means we need to wait before retrying
				const retryAfterSeconds = this._getRetryAfterSeconds(res);
				const nextRetryTime = process.uptime() + retryAfterSeconds;
				if(!this._nextRetryTime || nextRetryTime > this._nextRetryTime) {
					this._nextRetryTime = nextRetryTime;
				}
				if(firstAttempt) {
					// on the first attempt, we should count the retry
					this._retryingRequestCount++;
					try {
						return await this._delayAndThenDoWork(retryAfterSeconds, remainingRetries-1, abortSignal, work, false);
					} finally {
						this._retryingRequestCount--;
					}
				} else {
					// on subsequent attempts, the retry is already counted, so no need to count again
					return await this._delayAndThenDoWork(retryAfterSeconds, remainingRetries-1, abortSignal, work, false);
				}
			}
			throw error;
		}
	}

	private _performRequestWork<T>(work: () => Promise<T>): Promise<T> {
		const promise = work();
		if(promise) {
			this._requestPromises.add(promise);
			promise.finally(() => {
				this._requestPromises.delete(promise);
			});
		}
		return promise;
	}

	private _getRetryAfterSeconds(res: Response): number {
		const { options } = this;
		const retryAfter = res.headers.get('Retry-After');
		let retryAfterSeconds: number;
		if(retryAfter) {
			let retryAfterSeconds = Number.parseFloat(retryAfter);
			if(Number.isNaN(retryAfterSeconds)) {
				retryAfterSeconds = null;
				try {
					const retryAfterDate = new Date(retryAfter);
					retryAfterSeconds = (retryAfterDate.getTime() - (new Date()).getTime()) / 1000;
				} catch(error) {
					console.error(`Failed to parse Retry-After header ${retryAfter}`);
					console.error(error);
				}
			}
		}
		if(!retryAfterSeconds) {
			retryAfterSeconds = options.defaultDelay;
		}
		if(options.minimumDelay && retryAfterSeconds < options.minimumDelay) {
			retryAfterSeconds = options.minimumDelay;
		}
		return retryAfterSeconds;
	}
}


export class RequestManager {
	readonly options: RequestExecutorOptions;
	readonly executors: {[domain: string]: RequestExecutor} = {};

	constructor(options: RequestExecutorOptions) {
		this.options = options;
	}

	do<T>(domain: string, work: () => Promise<T>, abortSignal?: AbortSignal): Promise<T> {
		let executor = this.executors[domain];
		if(!executor) {
			executor = new RequestExecutor(this.options);
			this.executors[domain] = executor;
		}
		return executor.do(work, abortSignal);
	}
}
