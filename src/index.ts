import { McpAgent } from "agents/mcp";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { CMPClient, getStateName, SIMUsageQuery, DataUsageDetail, EuiccPageQuery, EuiccPageDto, getProfileStatusName, getProfileTypeName } from "./cmp_client.js";

// Define our MCP agent with tools
export class MyMCP extends McpAgent {
	server = new McpServer({
		name: "CMP SIM Management Server",
		version: "1.0.0",
	});

	private cmpClient!: CMPClient;

	async init() {
		// Get environment variables from the Durable Object's env
		const env = this.env as unknown as Env & {
			CMP_API_KEY?: string;
			CMP_API_SECRET?: string;
			CMP_API_ENDPOINT?: string;
		};
		
		// Get environment variables
		const CMP_API_KEY = env.CMP_API_KEY;
		const CMP_API_SECRET = env.CMP_API_SECRET;
		const CMP_API_ENDPOINT = env.CMP_API_ENDPOINT || "https://cmp.acceleronix.io/gateway/openapi";
		
		// Validate required environment variables
		if (!CMP_API_KEY || !CMP_API_SECRET) {
			throw new Error('Missing required environment variables: CMP_API_KEY and CMP_API_SECRET must be set in Cloudflare Workers.');
		}

		console.log('✅ Environment variables loaded successfully');
		console.log('🔗 CMP Endpoint:', CMP_API_ENDPOINT);

		// Initialize CMP client with environment variables
		this.cmpClient = new CMPClient(
			CMP_API_KEY,
			CMP_API_SECRET,
			CMP_API_ENDPOINT
		);

		// Query SIM list tool with cursor-based pagination
		this.server.tool(
			"query_sim_list",
			{
				cursor: z.string().optional().describe("Pagination cursor for continuing from previous request"),
				pageSize: z.number().optional().describe("Records per page, default 10, max 50 (reduced for token efficiency)"),
				format: z.enum(["compact", "detailed"]).optional().describe("Response format: 'compact' (default, saves tokens) or 'detailed'"),
				enterpriseDataPlan: z.string().optional().describe("Enterprise data plan name"),
				expirationTimeStart: z.string().optional().describe("Start expiration date, format: yyyy-MM-dd"),
				expirationTimeEnd: z.string().optional().describe("End expiration date, format: yyyy-MM-dd"),
				iccidStart: z.string().optional().describe("ICCID start number"),
				iccidEnd: z.string().optional().describe("ICCID end number"),
				label: z.string().optional().describe("Label"),
				simState: z.number().optional().describe("SIM state (2:Pre-activation 3:Test 4:Silent 5:Standby 6:Active 7:Shutdown 8:Pause 10:Pre-logout 11:Logout)"),
				simType: z.string().optional().describe("SIM card type"),
			},
			async (params) => {
				try {
					// Parse cursor to get page number and other state
					let pageNum = 1;
					let cursorData: any = {};
					
					if (params.cursor) {
						cursorData = CMPClient.parseCursor(params.cursor);
						pageNum = cursorData.pageNum || 1;
					}
					
					// Limit page size for token efficiency
					const pageSize = Math.min(params.pageSize || 10, 50);
					const format = params.format || "compact";
					
					const queryParams = {
						pageNum,
						pageSize,
						...params
					};
					delete queryParams.cursor;
					delete queryParams.format;
					
					const response = await this.cmpClient.querySimList(queryParams);
					
					if (response.code === 200) {
						const data = response.data;
						const simList = data.list || [];
						
						// Generate next cursor if there are more pages
						let nextCursor: string | undefined;
						if (data.current < data.pages) {
							const nextCursorData = {
								pageNum: data.current + 1,
								...cursorData
							};
							nextCursor = CMPClient.createCursor(nextCursorData);
						}
						
						let result: string;
						
						if (format === "compact") {
							// Compact format to save tokens
							result = `📊 SIM List (Page ${data.current}/${data.pages}, Total: ${data.total})\n`;
							if (simList.length > 0) {
								result += simList.map((sim: any, idx: number) => 
									`${idx + 1}. ${sim.iccid} | ${getStateName(sim.simState)} | ${sim.enterpriseDataPlan || 'N/A'}`
								).join('\n');
								if (nextCursor) {
									result += `\n\n🔄 More data available. Use cursor: ${nextCursor.slice(0, 20)}...`;
								}
							} else {
								result += "No SIM cards found";
							}
						} else {
							// Detailed format (original format)
							result = `📊 SIM Query Results\n`;
							result += `├─ Current Page: ${data.current}\n`;
							result += `├─ Total Pages: ${data.pages}\n`;
							result += `├─ Total Records: ${data.total}\n\n`;
							
							if (simList.length > 0) {
								result += `🔍 Found ${simList.length} SIM cards:\n`;
								simList.forEach((sim: any, index: number) => {
									result += `\n${index + 1}. 📱 ICCID: ${sim.iccid || 'N/A'}\n`;
									result += `   ├─ Status: ${getStateName(sim.simState || 0)}\n`;
									result += `   ├─ Enterprise: ${sim.enterprise || 'N/A'}\n`;
									result += `   └─ Data Plan: ${sim.enterpriseDataPlan || 'N/A'}\n`;
								});
							}
							if (nextCursor) {
								result += `\n\n🔄 Next cursor: ${nextCursor}`;
							}
						}
						
						const response_content: any = { 
							content: [{ type: "text", text: result }]
						};
						
						// Add nextCursor to response if available (MCP standard)
						if (nextCursor) {
							response_content.nextCursor = nextCursor;
						}
						
						return response_content;
					} else {
						return {
							content: [
								{
									type: "text",
									text: `❌ Query failed: ${response.msg || 'Unknown error'}`
								}
							]
						};
					}
				} catch (error) {
					return {
						content: [
							{
								type: "text",
								text: `❌ Failed to query SIM list: ${error instanceof Error ? error.message : 'Unknown error'}`
							}
						]
					};
				}
			}
		);

		// Query SIM detail tool
		this.server.tool(
			"query_sim_detail",
			{
				iccid: z.string().describe("SIM card ICCID number"),
			},
			async ({ iccid }) => {
				try {
					const response = await this.cmpClient.querySimDetail(iccid);
					
					if (response.code === 200) {
						const sim = response.data;
						
						let result = `📱 SIM Card Details\n`;
						result += `├─ SIM ID: ${sim.simId || 'N/A'}\n`;
						result += `├─ ICCID: ${sim.iccid || 'N/A'}\n`;
						result += `├─ MSISDN: ${sim.msisdn || 'N/A'}\n`;
						result += `├─ IMEI: ${sim.imei || 'N/A'}\n`;
						result += `├─ IMSI: ${sim.imsi || 'N/A'}\n`;
						result += `├─ Enterprise: ${sim.enterprise || 'N/A'}\n`;
						result += `├─ Label: ${sim.label || 'None'}\n`;
						result += `├─ Status: ${getStateName(sim.simState || 0)}\n`;
						result += `├─ State Change Reason: ${sim.simStateChangeReason || 'N/A'}\n`;
						result += `├─ Country/Region: ${sim.countryRegion || 'N/A'}\n`;
						result += `├─ Operator Network: ${sim.operatorNetwork || 'N/A'}\n`;
						result += `├─ Enterprise Data Plan: ${sim.enterpriseDataPlan || 'N/A'}\n`;
						result += `├─ Network Type: ${sim.networkType || 'N/A'}\n`;
						result += `├─ Card Type: ${sim.simType || 'N/A'}\n`;
						result += `├─ APN: ${sim.apn || 'N/A'}\n`;
						result += `├─ RAT: ${sim.rat || 'N/A'}\n`;
						result += `├─ Initial Time: ${sim.initialTime || 'N/A'}\n`;
						result += `├─ Activation Time: ${sim.activationTime || 'N/A'}\n`;
						result += `├─ Expiration Time: ${sim.expirationTime || 'N/A'}\n`;
						result += `├─ Last Session Time: ${sim.lastSessionTime || 'N/A'}\n`;
						
						// Format data usage
						const dataUsage = sim.usedDataOfCurrentPeriod || 0;
						const usage = typeof dataUsage === 'string' ? parseInt(dataUsage) || 0 : dataUsage;
						const formattedUsage = this.cmpClient.formatDataUsage(usage);
						result += `└─ Current Period Data Usage: ${formattedUsage}\n`;
						
						return { content: [{ type: "text", text: result }] };
					} else {
						return {
							content: [
								{
									type: "text",
									text: `❌ Query failed: ${response.msg || 'Unknown error'}`
								}
							]
						};
					}
				} catch (error) {
					return {
						content: [
							{
								type: "text",
								text: `❌ Failed to query SIM details: ${error instanceof Error ? error.message : 'Unknown error'}`
							}
						]
					};
				}
			}
		);

		// Test all three API endpoints for comparison (development tool)
		this.server.tool(
			"_dev_compare_api_endpoints",
			{
				testIccid: z.string().optional().describe("ICCID to test with (default: 8932042000002328543)"),
			},
			async ({ testIccid = "8932042000002328543" }) => {
				const tests = [
					{
						name: "SIM List (Known Working)",
						test: async () => {
							console.log("🧪 Testing /sim/page");
							return await this.cmpClient.post("/sim/page", { pageNum: 1, pageSize: 5 });
						}
					},
					{
						name: "SIM Detail (Known Working)",
						test: async () => {
							console.log("🧪 Testing /sim/detail");
							return await this.cmpClient.post("/sim/detail", { iccid: testIccid });
						}
					},
					{
						name: "SIM Usage (New API)",
						test: async () => {
							console.log("🧪 Testing /sim/queryMonthData");
							return await this.cmpClient.post("/sim/queryMonthData", { 
								iccid: testIccid, 
								month: "202310" 
							});
						}
					},
					{
						name: "eUICC List Query (New API)",
						test: async () => {
							console.log("🧪 Testing /esim/euicc/page");
							return await this.cmpClient.post("/esim/euicc/page", { 
								pageNum: 1, 
								pageSize: 5 
							});
						}
					}
				];

				let result = `🔬 API Endpoint Comparison Test\n`;
				result += `📋 Test ICCID: ${testIccid}\n`;
				result += `🕐 Test Time: ${new Date().toISOString()}\n\n`;

				for (let i = 0; i < tests.length; i++) {
					const test = tests[i];
					result += `${i + 1}. ${test.name}\n`;
					result += `${'─'.repeat(40)}\n`;
					
					try {
						const response = await test.test();
						result += `✅ Status: ${response.code}\n`;
						result += `📊 Message: ${response.msg || 'Success'}\n`;
						
						if (response.code === 200 && response.data) {
							if (typeof response.data === 'object') {
								const dataKeys = Object.keys(response.data);
								result += `📋 Data Keys: ${dataKeys.join(', ')}\n`;
								if (response.data.list) {
									result += `📝 Records: ${response.data.list.length} items\n`;
								}
							}
						}
					} catch (error) {
						result += `❌ Error: ${error instanceof Error ? error.message : 'Unknown error'}\n`;
					}
					
					result += `\n`;
				}

				return { content: [{ type: "text", text: result }] };
			}
		);

		// Query SIM usage details tool
		this.server.tool(
			"query_sim_usage",
			{
				iccid: z.string().describe("SIM card ICCID number"),
				month: z.string().describe("Query month in yyyyMM format (e.g., 202301)"),
			},
			async ({ iccid, month }) => {
				try {
					const response = await this.cmpClient.querySimMonthData({ iccid, month });
					
					// More flexible response checking
					if (response.code === 200 || (response.data && typeof response.data === 'object')) {
						const usage = response.data;
						
						let result = `📊 SIM Usage Details\n`;
						result += `├─ ICCID: ${usage.iccid}\n`;
						result += `├─ Month: ${usage.month}\n`;
						result += `├─ Total Data Allowance: ${usage.totalDataAllowance} MB\n`;
						result += `├─ Total Data Usage: ${usage.totalDataUsage} MB\n`;
						result += `├─ Remaining Data: ${usage.remainingData} MB\n`;
						result += `├─ Outside Region Usage: ${usage.outsideRegionDataUsage} MB\n\n`;
						
						if (usage.dataUsageDetails && usage.dataUsageDetails.length > 0) {
							result += `📋 Usage Details:\n`;
							usage.dataUsageDetails.forEach((detail: DataUsageDetail, index: number) => {
								const typeMap = {
									1: "Activation Period Plan",
									2: "Test Period Plan", 
									3: "Data Package"
								};
								const typeName = typeMap[detail.type as keyof typeof typeMap] || `Type ${detail.type}`;
								
								result += `\n${index + 1}. 📦 ${detail.orderName}\n`;
								result += `   ├─ Type: ${typeName}\n`;
								result += `   ├─ Allowance: ${detail.dataAllowance} MB\n`;
								result += `   ├─ Used: ${detail.dataUsage} MB\n`;
								result += `   └─ Outside Region: ${detail.outsideRegionDataUsage} MB\n`;
							});
						} else {
							result += "❌ No detailed usage data available";
						}
						
						return { content: [{ type: "text", text: result }] };
					} else {
						return {
							content: [
								{
									type: "text",
									text: `❌ Query failed: ${response.msg || 'Unknown error'}`
								}
							]
						};
					}
				} catch (error) {
					return {
						content: [
							{
								type: "text",
								text: `❌ Failed to query SIM usage: ${error instanceof Error ? error.message : 'Unknown error'}`
							}
						]
					};
				}
			}
		);


		// Query eUICC list tool with cursor-based pagination
		this.server.tool(
			"query_euicc_list",
			{
				cursor: z.string().optional().describe("Pagination cursor for continuing from previous request"),
				pageSize: z.number().optional().describe("Records per page, default 10, max 50 (reduced for token efficiency)"),
				format: z.enum(["compact", "detailed"]).optional().describe("Response format: 'compact' (default, saves tokens) or 'detailed'"),
				childEnterpriseId: z.number().optional().describe("Child enterprise ID to filter"),
				iccid: z.string().optional().describe("ICCID filter"),
				profileStatus: z.number().optional().describe("Profile status filter (1:Not downloaded, 2:Downloading, 3:Downloaded, 4:Enabling, 5:Enabled, 6:Disabling, 7:Disabled, 8:Deleting, 9:Deleted)"),
			},
			async (params) => {
				try {
					// Parse cursor to get page number and other state
					let pageNum = 1;
					let cursorData: any = {};
					
					if (params.cursor) {
						cursorData = CMPClient.parseCursor(params.cursor);
						pageNum = cursorData.pageNum || 1;
					}
					
					// Limit page size for token efficiency
					const pageSize = Math.min(params.pageSize || 10, 50);
					const format = params.format || "compact";
					
					const queryParams = {
						pageNum,
						pageSize,
						...params
					};
					delete queryParams.cursor;
					delete queryParams.format;
					
					const response = await this.cmpClient.queryEuiccPage(queryParams);
					
					// Flexible response checking
					if (response.code === 200 || (response.data && typeof response.data === 'object')) {
						const data = response.data;
						const euiccList = data.list || [];
						
						// Generate next cursor if there are more pages
						let nextCursor: string | undefined;
						if (data.current < data.pages) {
							const nextCursorData = {
								pageNum: data.current + 1,
								...cursorData
							};
							nextCursor = CMPClient.createCursor(nextCursorData);
						}
						
						let result: string;
						
						if (format === "compact") {
							// Compact format to save tokens
							result = `📡 eUICC List (Page ${data.current}/${data.pages}, Total: ${data.total})\n`;
							if (euiccList.length > 0) {
								result += euiccList.map((euicc: EuiccPageDto, idx: number) => 
									`${idx + 1}. ${euicc.iccid} | ${getProfileStatusName(euicc.profileStatus || 0)} | ${euicc.enterpriseName || 'N/A'}`
								).join('\n');
								if (nextCursor) {
									result += `\n\n🔄 More data available. Use cursor: ${nextCursor.slice(0, 20)}...`;
								}
							} else {
								result += "No eUICC devices found";
							}
						} else {
							// Detailed format (original format but simplified)
							result = `📡 eUICC List Results\n`;
							result += `├─ Current Page: ${data.current}\n`;
							result += `├─ Total Pages: ${data.pages}\n`;
							result += `├─ Total Records: ${data.total}\n\n`;
							
							if (euiccList.length > 0) {
								result += `🔍 Found ${euiccList.length} eUICC devices:\n`;
								euiccList.forEach((euicc: EuiccPageDto, index: number) => {
									result += `\n${index + 1}. 📱 ${euicc.iccid}\n`;
									result += `   ├─ Status: ${getProfileStatusName(euicc.profileStatus || 0)}\n`;
									result += `   └─ Enterprise: ${euicc.enterpriseName || 'N/A'}\n`;
								});
							}
							if (nextCursor) {
								result += `\n\n🔄 Next cursor: ${nextCursor}`;
							}
						}
						
						const response_content: any = { 
							content: [{ type: "text", text: result }]
						};
						
						// Add nextCursor to response if available (MCP standard)
						if (nextCursor) {
							response_content.nextCursor = nextCursor;
						}
						
						return response_content;
					} else {
						return {
							content: [
								{
									type: "text",
									text: `❌ Query failed: ${response.msg || 'Unknown error'}`
								}
							]
						};
					}
				} catch (error) {
					return {
						content: [
							{
								type: "text",
								text: `❌ Failed to query eUICC list: ${error instanceof Error ? error.message : 'Unknown error'}`
							}
						]
					};
				}
			}
		);

		// Filter eUICC by profile status (legacy - use query_euicc_list with profileStatus instead)
		this.server.tool(
			"_legacy_filter_euicc_by_status",
			{
				profileStatus: z.number().min(1).max(9).describe("Profile status to filter (1:Not downloaded, 2:Downloading, 3:Downloaded, 4:Enabling, 5:Enabled, 6:Disabling, 7:Disabled, 8:Deleting, 9:Deleted)"),
				pageSize: z.number().optional().describe("Number of results to return, default 20"),
			},
			async ({ profileStatus, pageSize = 20 }) => {
				try {
					const response = await this.cmpClient.queryEuiccPage({ 
						profileStatus, 
						pageSize: Math.min(pageSize, 100) 
					});
					
					if (response.code === 200 && response.data) {
						const data = response.data;
						const euiccList = data.list || [];
						const statusName = getProfileStatusName(profileStatus);
						
						let result = `🔍 eUICC Devices with Status: ${statusName}\n`;
						result += `├─ Total Found: ${data.total}\n`;
						result += `├─ Showing: ${euiccList.length} devices\n\n`;
						
						if (euiccList.length > 0) {
							euiccList.forEach((euicc: EuiccPageDto, index: number) => {
								result += `${index + 1}. 📱 ${euicc.enterpriseName || 'Unknown Enterprise'}\n`;
								result += `   ├─ eID: ${euicc.eid || 'N/A'}\n`;
								result += `   ├─ ICCID: ${euicc.iccid || 'N/A'}\n`;
								result += `   ├─ Profile Type: ${getProfileTypeName(euicc.profileType || '0')}\n`;
								result += `   └─ Last Update: ${euicc.lastOperateTime || 'N/A'}\n\n`;
							});
						} else {
							result += `❌ No eUICC devices found with status "${statusName}"`;
						}
						
						return { content: [{ type: "text", text: result }] };
					} else {
						return {
							content: [{ type: "text", text: `❌ Query failed: ${response.msg || 'Unknown error'}` }]
						};
					}
				} catch (error) {
					return {
						content: [{ type: "text", text: `❌ Failed to filter eUICC by status: ${error instanceof Error ? error.message : 'Unknown error'}` }]
					};
				}
			}
		);

		// Search eUICC by eID or ICCID (legacy - use query_euicc_list with iccid instead)
		this.server.tool(
			"_legacy_search_euicc",
			{
				searchTerm: z.string().describe("Search term (eID or ICCID to search for)"),
				searchType: z.enum(["auto", "eid", "iccid"]).optional().describe("Search type: auto (detect), eid, or iccid. Default: auto"),
			},
			async ({ searchTerm, searchType = "auto" }) => {
				try {
					// Auto-detect search type if not specified
					let actualSearchType = searchType;
					if (searchType === "auto") {
						// eID is typically longer (32 chars), ICCID is usually 19-20 chars
						actualSearchType = searchTerm.length > 25 ? "eid" : "iccid";
					}
					
					const queryParams: EuiccPageQuery = { pageSize: 50 };
					if (actualSearchType === "iccid") {
						queryParams.iccid = searchTerm;
					}
					// Note: API doesn't seem to support eID search directly, so we'll search all and filter
					
					const response = await this.cmpClient.queryEuiccPage(queryParams);
					
					if (response.code === 200 && response.data) {
						let euiccList = response.data.list || [];
						
						// If searching by eID, filter results
						if (actualSearchType === "eid") {
							euiccList = euiccList.filter((euicc: EuiccPageDto) => 
								euicc.eid && euicc.eid.toLowerCase().includes(searchTerm.toLowerCase())
							);
						}
						
						let result = `🔍 eUICC Search Results\n`;
						result += `├─ Search Term: ${searchTerm}\n`;
						result += `├─ Search Type: ${actualSearchType.toUpperCase()}\n`;
						result += `├─ Results Found: ${euiccList.length}\n\n`;
						
						if (euiccList.length > 0) {
							euiccList.forEach((euicc: EuiccPageDto, index: number) => {
								result += `${index + 1}. 📱 eUICC Match\n`;
								result += `   ├─ eID: ${euicc.eid || 'N/A'}\n`;
								result += `   ├─ ICCID: ${euicc.iccid || 'N/A'}\n`;
								result += `   ├─ IMEI: ${euicc.imei || 'N/A'}\n`;
								result += `   ├─ Enterprise: ${euicc.enterpriseName || 'N/A'}\n`;
								result += `   ├─ Status: ${getProfileStatusName(euicc.profileStatus || 0)}\n`;
								result += `   ├─ Type: ${getProfileTypeName(euicc.profileType || '0')}\n`;
								result += `   └─ Last Update: ${euicc.lastOperateTime || 'N/A'}\n\n`;
							});
						} else {
							result += `❌ No eUICC devices found matching "${searchTerm}"`;
						}
						
						return { content: [{ type: "text", text: result }] };
					} else {
						return {
							content: [{ type: "text", text: `❌ Search failed: ${response.msg || 'Unknown error'}` }]
						};
					}
				} catch (error) {
					return {
						content: [{ type: "text", text: `❌ Failed to search eUICC: ${error instanceof Error ? error.message : 'Unknown error'}` }]
					};
				}
			}
		);

		// Get eUICC profile statistics
		this.server.tool(
			"euicc_profile_stats",
			{
				maxResults: z.number().optional().describe("Maximum number of records to analyze, default 100, max 200"),
				format: z.enum(["compact", "detailed"]).optional().describe("Response format: 'compact' (default, saves tokens) or 'detailed'"),
			},
			async ({ maxResults = 100, format = "compact" }) => {
				try {
					const response = await this.cmpClient.queryEuiccPage({ 
						pageSize: Math.min(maxResults, 200) 
					});
					
					if (response.code === 200 && response.data) {
						const euiccList = response.data.list || [];
						
						// Calculate statistics
						const statusCounts: Record<number, number> = {};
						const typeCounts: Record<string, number> = {};
						const enterpriseCounts: Record<string, number> = {};
						
						euiccList.forEach((euicc: EuiccPageDto) => {
							// Status statistics
							const status = euicc.profileStatus || 0;
							statusCounts[status] = (statusCounts[status] || 0) + 1;
							
							// Type statistics
							const type = euicc.profileType || '0';
							typeCounts[type] = (typeCounts[type] || 0) + 1;
							
							// Enterprise statistics
							const enterprise = euicc.enterpriseName || 'Unknown';
							enterpriseCounts[enterprise] = (enterpriseCounts[enterprise] || 0) + 1;
						});
						
						let result: string;
						
						if (format === "compact") {
							// Compact format to save tokens
							result = `📊 eUICC Stats (${euiccList.length}/${response.data.total})\n`;
							
							// Top status (most common)
							const topStatus = Object.entries(statusCounts)
								.sort((a, b) => b[1] - a[1])[0];
							if (topStatus) {
								const [status, count] = topStatus;
								result += `Top Status: ${getProfileStatusName(parseInt(status))} (${count})\n`;
							}
							
							// Top enterprise
							const topEnterprise = Object.entries(enterpriseCounts)
								.sort((a, b) => b[1] - a[1])[0];
							if (topEnterprise) {
								const [enterprise, count] = topEnterprise;
								result += `Top Enterprise: ${enterprise} (${count})`;
							}
						} else {
							// Detailed format
							result = `📊 eUICC Profile Statistics\n`;
							result += `├─ Total Analyzed: ${euiccList.length} devices\n`;
							result += `├─ Total in System: ${response.data.total}\n\n`;
							
							// Profile Status Distribution
							result += `📋 Status Distribution:\n`;
							Object.entries(statusCounts)
								.sort((a, b) => b[1] - a[1])
								.slice(0, 3) // Limit to top 3
								.forEach(([status, count]) => {
									const statusName = getProfileStatusName(parseInt(status));
									const percentage = ((count / euiccList.length) * 100).toFixed(1);
									result += `├─ ${statusName}: ${count} (${percentage}%)\n`;
								});
							
							result += `\n🏢 Top Enterprises:\n`;
							Object.entries(enterpriseCounts)
								.sort((a, b) => b[1] - a[1])
								.slice(0, 3) // Limit to top 3
								.forEach(([enterprise, count]) => {
									const percentage = ((count / euiccList.length) * 100).toFixed(1);
									result += `├─ ${enterprise}: ${count} (${percentage}%)\n`;
								});
						}
						
						return { content: [{ type: "text", text: result }] };
					} else {
						return {
							content: [{ type: "text", text: `❌ Statistics query failed: ${response.msg || 'Unknown error'}` }]
						};
					}
				} catch (error) {
					return {
						content: [{ type: "text", text: `❌ Failed to get eUICC statistics: ${error instanceof Error ? error.message : 'Unknown error'}` }]
					};
				}
			}
		);
	}
}

export default {
	fetch(request: Request, env: Env, ctx: ExecutionContext) {
		const url = new URL(request.url);

		if (url.pathname === "/sse" || url.pathname === "/sse/message") {
			return MyMCP.serveSSE("/sse").fetch(request, env, ctx);
		}

		if (url.pathname === "/mcp") {
			return MyMCP.serve("/mcp").fetch(request, env, ctx);
		}

		return new Response("Not found", { status: 404 });
	},
};
