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
		2: "Pre-activation",
		3: "Test",
		4: "Silent",
		5: "Standby",
		6: "Active",
		7: "Shutdown",
		8: "Pause",
		10: "Pre-logout",
		11: "Logout",
	};
	return stateMap[stateCode] || `Unknown status (${stateCode})`;
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

export interface SIMUsageQuery {
	iccid: string;
	month: string; // yyyyMM format
}

export interface DataUsageDetail {
	dataAllowance: string; // Total data allowance in MB
	dataUsage: string; // Used data in MB
	orderName: string; // Order name
	outsideRegionDataUsage: string; // Outside region data usage in MB
	type: number; // 1: Activation period plan, 2: Test period plan, 3: Data package
}

export interface SIMUsageResponse {
	dataUsageDetails: DataUsageDetail[];
	iccid: string;
	month: string; // yyyyMM format
	outsideRegionDataUsage: string; // Outside region data usage in MB
	remainingData: string; // Remaining data in MB
	totalDataAllowance: string; // Total data allowance in MB
	totalDataUsage: string; // Total used data in MB
}

export interface ESimBatchQuery {
	iccids: string[]; // ICCID list, max 100 items
}

export interface SimBatchVO {
	eid: string; // eID
	iccid: string; // ICCID
	imei: string; // IMEI
	imsi: string; // IMSI
	message: number; // Error code
	msisdn: string; // MSISDN
	status: number; // Status: 0 = Query success; 1 = Query failed
}

export interface ESimBatchResponse {
	code: number;
	data: SimBatchVO[];
	msg: string;
	reqId: string;
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
			console.log(`📋 Response data: ${JSON.stringify(result)}`);

			// Handle different response formats
			if (result.code === undefined) {
				// Some APIs might return data directly without wrapper
				if (typeof result === 'object' && result !== null) {
					console.log(`⚠️ API returned data without standard wrapper, treating as success`);
					return {
						code: 200,
						msg: "OK",
						data: result as T
					} as APIResponse<T>;
				} else {
					throw new Error(`API Error: Invalid response format - ${JSON.stringify(result)}`);
				}
			}

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
			throw new Error("ICCID cannot be empty");
		}

		return this.post("/sim/detail", { iccid: iccid.trim() });
	}

	async querySimMonthData(options: SIMUsageQuery): Promise<APIResponse<SIMUsageResponse>> {
		const { iccid, month } = options;
		
		if (!iccid || !iccid.trim()) {
			throw new Error("ICCID cannot be empty");
		}
		
		if (!month || !month.trim()) {
			throw new Error("Month cannot be empty");
		}
		
		// Validate month format (yyyyMM)
		if (!/^\d{6}$/.test(month.trim())) {
			throw new Error("Month format must be yyyyMM (e.g., 202301)");
		}

		return this.post("/sim/queryMonthData", { 
			iccid: iccid.trim(), 
			month: month.trim() 
		});
	}

	async queryESimBatch(options: ESimBatchQuery): Promise<APIResponse<ESimBatchResponse>> {
		const { iccids } = options;
		
		if (!iccids || !Array.isArray(iccids) || iccids.length === 0) {
			throw new Error("ICCID list cannot be empty");
		}
		
		if (iccids.length > 100) {
			throw new Error("Maximum 100 ICCIDs are supported per batch query");
		}
		
		// Validate and clean ICCIDs
		const cleanedIccids = iccids
			.map(iccid => iccid?.trim())
			.filter(iccid => iccid && iccid.length > 0);
		
		if (cleanedIccids.length === 0) {
			throw new Error("No valid ICCIDs provided");
		}
		
		if (cleanedIccids.length !== iccids.length) {
			console.log(`⚠️ Filtered out ${iccids.length - cleanedIccids.length} empty/invalid ICCIDs`);
		}

		return this.post("/openapi/esim/querySimBatch", { 
			iccids: cleanedIccids 
		});
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