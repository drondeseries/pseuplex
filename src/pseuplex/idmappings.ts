
export class IDMappings {
	private _privateToPublicIds: {[key: string]: number} = {};
	private _publicToPrivateIds: {[id: number]: string} = {};
	private _nextPrivateID: number;
	private _increment: number;

	constructor(nextID: number, increment: number) {
		this._nextPrivateID = nextID;
		this._increment = increment;
	}

	static create() {
		return new IDMappings(Number.MAX_SAFE_INTEGER-1, -1);
	}

	private generatePrivateID(): number {
		const id = this._nextPrivateID;
		this._nextPrivateID += this._increment;
		if(this._nextPrivateID == Number.MAX_SAFE_INTEGER) {
			this._nextPrivateID = Number.MIN_SAFE_INTEGER + 1;
		} else if(this._nextPrivateID == Number.MIN_SAFE_INTEGER) {
			this._nextPrivateID == Number.MAX_SAFE_INTEGER - 1;
		}
		// TODO loop to ensure ID is not being used
		return id;
	}

	getPublicIDFromPrivateID(privateId: string): number {
		let id = this._privateToPublicIds[privateId];
		if(id != null) {
			return id;
		}
		id = this.generatePrivateID();
		this._privateToPublicIds[privateId] = id;
		this._publicToPrivateIds[id] = privateId;
		return id;
	}

	getPrivateIDFromPublicID(id: number | string): string | null {
		return this._publicToPrivateIds[id] ?? null;
	}
}
