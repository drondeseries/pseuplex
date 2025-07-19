import express from 'express';
import { HttpError, HttpResponseError } from './error';

export const asyncRequestHandler = <TRequest extends express.Request = express.Request>(
	handler: (req: TRequest, res: express.Response) => Promise<boolean>
) => {
	return async (req: TRequest, res: express.Response, next: (error?: Error) => void) => {
		let done: boolean;
		try {
			done = await handler(req,res);
		} catch(error) {
			next(error);
			return;
		}
		if(!done) {
			next();
		}
	};
};

export const expressErrorHandler = (error: Error, req: express.Request, res: express.Response, next) => {
	if(error) {
		console.error(error);
		const statusCode =
			(error as HttpError).statusCode
			|| (error as HttpResponseError).httpResponse?.status
			|| 500;
		res.status(statusCode).send(error.message);
		console.log(`Sent error ${error.message}`);
	} else {
		next();
	}
};
