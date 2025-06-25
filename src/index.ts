import { McpAgent } from "agents/mcp";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { CMPClient, getStateName, SIMUsageQuery, DataUsageDetail, ESimBatchQuery, SimBatchVO, EuiccPageQuery, EuiccPageDto, getProfileStatusName, getProfileTypeName } from "./cmp_client.js";

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

		// Query SIM list tool
		this.server.tool(
			"query_sim_list",
			{
				pageNum: z.number().optional().describe("Page number, default 1"),
				pageSize: z.number().optional().describe("Records per page, default 10, max 1000"),
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
					const response = await this.cmpClient.querySimList(params);
					
					if (response.code === 200) {
						const data = response.data;
						const simList = data.list || [];
						
						let result = `📊 SIM Query Results\n`;
						result += `├─ Current Page: ${data.current}\n`;
						result += `├─ Page Size: ${data.size}\n`;
						result += `├─ Total Pages: ${data.pages}\n`;
						result += `├─ Total Records: ${data.total}\n\n`;
						
						if (simList.length > 0) {
							result += `🔍 Found ${simList.length} SIM cards:\n`;
							simList.forEach((sim: any, index: number) => {
								result += `\n${index + 1}. 📱 ICCID: ${sim.iccid || 'N/A'}\n`;
								result += `   ├─ IMSI: ${sim.imsi || 'N/A'}\n`;
								result += `   ├─ MSISDN: ${sim.msisdn || 'N/A'}\n`;
								result += `   ├─ Status: ${getStateName(sim.simState || 0)}\n`;
								result += `   ├─ Card Type: ${sim.simType || 'N/A'}\n`;
								result += `   ├─ Enterprise: ${sim.enterprise || 'N/A'}\n`;
								result += `   ├─ Data Plan: ${sim.enterpriseDataPlan || 'N/A'}\n`;
								result += `   ├─ Activation Time: ${sim.activationTime || 'N/A'}\n`;
								result += `   ├─ Expiration Time: ${sim.expirationTime || 'N/A'}\n`;
								result += `   └─ Label: ${sim.label || 'None'}\n`;
							});
						} else {
							result += "❌ No SIM cards found matching the criteria";
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

		// Test all three API endpoints for comparison
		this.server.tool(
			"compare_api_endpoints",
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
						name: "eSIM Batch Query (New API)",
						test: async () => {
							console.log("🧪 Testing /openapi/esim/querySimBatch");
							return await this.cmpClient.post("/openapi/esim/querySimBatch", { 
								iccids: [testIccid, "8932042000002328544"] 
							});
						}
					},
					{
						name: "eUICC List Query (New API)",
						test: async () => {
							console.log("🧪 Testing /openapi/esim/euicc/page");
							return await this.cmpClient.post("/openapi/esim/euicc/page", { 
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

		// Query eSIM batch tool
		this.server.tool(
			"query_esim_batch",
			{
				iccids: z.array(z.string()).describe("Array of ICCID numbers to query (max 100)"),
			},
			async ({ iccids }) => {
				try {
					const response = await this.cmpClient.queryESimBatch({ iccids });
					
					// More flexible response checking for eSIM API
					if (response.code === 200 || (response.data && Array.isArray(response.data))) {
						const esimData = response.data;
						
						let result = `📡 eSIM Batch Query Results\n`;
						result += `├─ Request ID: ${response.reqId || 'N/A'}\n`;
						result += `├─ Total Queried: ${iccids.length}\n`;
						result += `├─ Total Results: ${esimData.length}\n\n`;
						
						if (esimData && esimData.length > 0) {
							// Categorize results
							const successful = esimData.filter((sim: SimBatchVO) => sim.status === 0);
							const failed = esimData.filter((sim: SimBatchVO) => sim.status === 1);
							
							result += `📊 Summary:\n`;
							result += `├─ ✅ Successful: ${successful.length}\n`;
							result += `├─ ❌ Failed: ${failed.length}\n\n`;
							
							// Show successful results
							if (successful.length > 0) {
								result += `🔍 Successful eSIM Results:\n`;
								successful.forEach((sim: SimBatchVO, index: number) => {
									result += `\n${index + 1}. 📱 ICCID: ${sim.iccid || 'N/A'}\n`;
									result += `   ├─ eID: ${sim.eid || 'N/A'}\n`;
									result += `   ├─ IMSI: ${sim.imsi || 'N/A'}\n`;
									result += `   ├─ IMEI: ${sim.imei || 'N/A'}\n`;
									result += `   ├─ MSISDN: ${sim.msisdn || 'N/A'}\n`;
									result += `   └─ Status: Success\n`;
								});
							}
							
							// Show failed results
							if (failed.length > 0) {
								result += `\n❌ Failed eSIM Queries:\n`;
								failed.forEach((sim: SimBatchVO, index: number) => {
									result += `\n${index + 1}. 📱 ICCID: ${sim.iccid || 'N/A'}\n`;
									result += `   ├─ Status: Failed\n`;
									result += `   └─ Error Code: ${sim.message || 'Unknown'}\n`;
								});
							}
						} else {
							result += "❌ No eSIM data returned from the API";
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
								text: `❌ Failed to query eSIM batch: ${error instanceof Error ? error.message : 'Unknown error'}`
							}
						]
					};
				}
			}
		);

		// Query eUICC list tool
		this.server.tool(
			"query_euicc_list",
			{
				pageNum: z.number().optional().describe("Page number, default 1"),
				pageSize: z.number().optional().describe("Records per page, default 10, max 1000"),
				childEnterpriseId: z.number().optional().describe("Child enterprise ID to filter"),
				iccid: z.string().optional().describe("ICCID filter"),
				profileStatus: z.number().optional().describe("Profile status filter (1:Not downloaded, 2:Downloading, 3:Downloaded, 4:Enabling, 5:Enabled, 6:Disabling, 7:Disabled, 8:Deleting, 9:Deleted)"),
			},
			async (params) => {
				try {
					const response = await this.cmpClient.queryEuiccPage(params);
					
					// Flexible response checking
					if (response.code === 200 || (response.data && typeof response.data === 'object')) {
						const data = response.data;
						const euiccList = data.list || [];
						
						let result = `📡 eUICC List Results\n`;
						result += `├─ Request ID: ${response.reqId || 'N/A'}\n`;
						result += `├─ Current Page: ${data.current}\n`;
						result += `├─ Page Size: ${data.size}\n`;
						result += `├─ Total Pages: ${data.pages}\n`;
						result += `├─ Total Records: ${data.total}\n\n`;
						
						if (euiccList.length > 0) {
							result += `🔍 Found ${euiccList.length} eUICC devices:\n`;
							
							euiccList.forEach((euicc: EuiccPageDto, index: number) => {
								result += `\n${index + 1}. 📱 eUICC Device\n`;
								result += `   ├─ eID: ${euicc.eid || 'N/A'}\n`;
								result += `   ├─ ICCID: ${euicc.iccid || 'N/A'}\n`;
								result += `   ├─ IMEI: ${euicc.imei || 'N/A'}\n`;
								result += `   ├─ Enterprise: ${euicc.enterpriseName || 'N/A'}\n`;
								result += `   ├─ Profile Number: ${euicc.profileNum || 'N/A'}\n`;
								result += `   ├─ Profile Status: ${getProfileStatusName(euicc.profileStatus || 0)}\n`;
								result += `   ├─ Profile Type: ${getProfileTypeName(euicc.profileType || '0')}\n`;
								result += `   └─ Last Operation: ${euicc.lastOperateTime || 'N/A'}\n`;
							});
						} else {
							result += "❌ No eUICC devices found matching the criteria";
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
								text: `❌ Failed to query eUICC list: ${error instanceof Error ? error.message : 'Unknown error'}`
							}
						]
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
