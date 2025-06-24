export enum SIMState {
	PRE_ACTIVATION = 2,
	TEST = 3,
	SILENT = 4,
	STANDBY = 5,
	ACTIVE = 6,
	SHUTDOWN = 7,
	PAUSE = 8,
	PRE_LOGOUT = 10,
	LOGOUT = 11,
}

export function getStateName(stateCode: number): string {
	const stateMap: Record<number, string> = {
		2: "预激活",
		3: "测试",
		4: "沉默",
		5: "待机",
		6: "激活",
		7: "停机",
		8: "暂停",
		10: "预注销",
		11: "注销",
	};
	return stateMap[stateCode] || `未知状态(${stateCode})`;
}

export interface SIMListQuery {
	pageNum?: number;
	pageSize?: number;
	enterpriseDataPlan?: string;
	expirationTimeStart?: string;
	expirationTimeEnd?: string;
	iccidStart?: string;
	iccidEnd?: string;
	label?: string;
	simState?: number;
	simType?: string;
}

export interface APIResponse<T = any> {
	code: number;
	msg?: string;
	reqId?: string;
	data: T;
}

export class CMPClient {
	private appKey: string;
	private appSecret: string;
	private endpoint: string;

	constructor(appKey: string, appSecret: string, endpoint: string) {
		this.appKey = appKey;
		this.appSecret = appSecret;
		this.endpoint = endpoint.replace(/\/$/, "");
	}

	private async generateSignature(timestamp: number, requestBody = ""): Promise<string> {
		const signContent = this.appKey + timestamp.toString() + requestBody;
		const encoder = new TextEncoder();
		const keyData = encoder.encode(this.appSecret);
		const messageData = encoder.encode(signContent);
		
		const cryptoKey = await crypto.subtle.importKey(
			"raw",
			keyData,
			{ name: "HMAC", hash: "SHA-256" },
			false,
			["sign"]
		);
		
		const signature = await crypto.subtle.sign("HMAC", cryptoKey, messageData);
		return Array.from(new Uint8Array(signature))
			.map(b => b.toString(16).padStart(2, "0"))
			.join("");
	}

	private async getHeaders(requestBody = ""): Promise<Record<string, string>> {
		const timestamp = Math.floor(Date.now() / 1000);
		const signature = await this.generateSignature(timestamp, requestBody);
		
		return {
			"Content-Type": "application/json",
			"APP-Key": this.appKey,
			"Signature": signature,
			"Timestamp": timestamp.toString(),
		};
	}

	private async makeRequest<T = any>(
		method: string,
		resourcePath: string,
		data?: any,
		params?: Record<string, any>
	): Promise<APIResponse<T>> {
		// Fix URL construction - ensure resourcePath is appended correctly
		const baseUrl = this.endpoint.endsWith('/') ? this.endpoint.slice(0, -1) : this.endpoint;
		const path = resourcePath.startsWith('/') ? resourcePath.slice(1) : resourcePath;
		const url = new URL(`${baseUrl}/${path}`);
		
		if (params) {
			for (const [key, value] of Object.entries(params)) {
				if (value !== undefined && value !== null) {
					url.searchParams.append(key, String(value));
				}
			}
		}

		const requestBody = data ? JSON.stringify(data) : "";
		const headers = await this.getHeaders(requestBody);

		// Debug logging
		console.log(`🔍 Making ${method} request to: ${url.toString()}`);
		console.log(`📊 Request body: ${requestBody}`);
		console.log(`🔑 Headers: ${JSON.stringify(headers)}`);

		try {
			const response = await fetch(url.toString(), {
				method,
				headers,
				body: requestBody || undefined,
			});

			console.log(`📡 Response status: ${response.status} ${response.statusText}`);

			if (!response.ok) {
				const responseText = await response.text();
				console.log(`❌ Response body: ${responseText}`);
				throw new Error(`HTTP Error: ${response.status} ${response.statusText}`);
			}

			const result: APIResponse<T> = await response.json();

			if (result.code !== 200) {
				throw new Error(`API Error [${result.code}]: ${result.msg || "Unknown error"}`);
			}

			return result;
		} catch (error) {
			if (error instanceof Error) {
				throw new Error(`Request failed: ${error.message}`);
			}
			throw new Error("Request failed: Unknown error");
		}
	}

	async get<T = any>(resourcePath: string, params?: Record<string, any>): Promise<APIResponse<T>> {
		return this.makeRequest<T>("GET", resourcePath, undefined, params);
	}

	async post<T = any>(resourcePath: string, data?: any): Promise<APIResponse<T>> {
		return this.makeRequest<T>("POST", resourcePath, data);
	}

	async put<T = any>(resourcePath: string, data?: any): Promise<APIResponse<T>> {
		return this.makeRequest<T>("PUT", resourcePath, data);
	}

	async delete<T = any>(resourcePath: string, data?: any): Promise<APIResponse<T>> {
		return this.makeRequest<T>("DELETE", resourcePath, data);
	}

	async querySimList(options: SIMListQuery = {}): Promise<APIResponse> {
		const {
			pageNum = 1,
			pageSize = 10,
			enterpriseDataPlan,
			expirationTimeStart,
			expirationTimeEnd,
			iccidStart,
			iccidEnd,
			label,
			simState,
			simType,
		} = options;

		const data: Record<string, any> = {
			pageNum,
			pageSize: Math.min(pageSize, 1000),
		};

		if (enterpriseDataPlan) data.enterpriseDataPlan = enterpriseDataPlan;
		if (expirationTimeStart) data.expirationTimeStart = expirationTimeStart;
		if (expirationTimeEnd) data.expirationTimeEnd = expirationTimeEnd;
		if (iccidStart) data.iccidStart = iccidStart;
		if (iccidEnd) data.iccidEnd = iccidEnd;
		if (label) data.label = label;
		if (simState !== undefined) data.simState = simState;
		if (simType) data.simType = simType;

		return this.post("/sim/page", data);
	}

	async querySimDetail(iccid: string): Promise<APIResponse> {
		if (!iccid || !iccid.trim()) {
			throw new Error("ICCID不能为空");
		}

		return this.post("/sim/detail", { iccid: iccid.trim() });
	}

	formatDataUsage(bytesValue: number): string {
		if (bytesValue === 0) return "0 B";

		const units = ["B", "KB", "MB", "GB", "TB"];
		let size = bytesValue;
		let unitIndex = 0;

		while (size >= 1024 && unitIndex < units.length - 1) {
			size /= 1024;
			unitIndex++;
		}

		if (unitIndex === 0) {
			return `${Math.round(size)} ${units[unitIndex]}`;
		}
		return `${size.toFixed(2)} ${units[unitIndex]}`;
	}
}