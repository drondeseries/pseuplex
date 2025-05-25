
export class IDMappings {
	private _keysToIds: {[key: string]: number} = {};
	private _idsToKeys: {[id: number]: string} = {};
	private _nextID: number;
	private _increment: number;

	constructor(nextID: number, increment: number) {
		this._nextID = nextID;
		this._increment = increment;
	}

	static create() {
		return new IDMappings(Number.MAX_SAFE_INTEGER-1, -1);
	}

	private generateID(): number {
		const id = this._nextID;
		this._nextID += this._increment;
		if(this._nextID == Number.MAX_SAFE_INTEGER) {
			this._nextID = Number.MIN_SAFE_INTEGER + 1;
		} else if(this._nextID == Number.MIN_SAFE_INTEGER) {
			this._nextID == Number.MAX_SAFE_INTEGER - 1;
		}
		// TODO loop to ensure ID is not being used
		return id;
	}

	getIDForKey(key: string): number {
		let id = this._keysToIds[key];
		if(id != null) {
			return id;
		}
		id = this.generateID();
		this._keysToIds[key] = id;
		this._idsToKeys[id] = key;
		return id;
	}

	getKeyForID(id: number | string): string | null {
		return this._idsToKeys[id] ?? null;
	}
}
