import { McpAgent } from "agents/mcp";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { CMPClient, getStateName } from "./cmp_client.js";

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
			CMP_APP_KEY?: string;
			CMP_APP_SECRET?: string;
			CMP_ENDPOINT?: string;
		};
		
		// Validate that environment variables are available
		if (!env.CMP_APP_KEY || !env.CMP_APP_SECRET || !env.CMP_ENDPOINT) {
			console.error('Missing required CMP environment variables:', {
				CMP_APP_KEY: !!env.CMP_APP_KEY,
				CMP_APP_SECRET: !!env.CMP_APP_SECRET,
				CMP_ENDPOINT: !!env.CMP_ENDPOINT
			});
			throw new Error('Missing required CMP API environment variables. Please set CMP_APP_KEY, CMP_APP_SECRET, and CMP_ENDPOINT in your Cloudflare Workers environment.');
		}

		// Initialize CMP client with configuration from environment variables
		this.cmpClient = new CMPClient(
			env.CMP_APP_KEY,
			env.CMP_APP_SECRET,
			env.CMP_ENDPOINT
		);

		// Query SIM list tool
		this.server.tool(
			"query_sim_list",
			{
				pageNum: z.number().optional().describe("页码，默认1"),
				pageSize: z.number().optional().describe("每页记录数，默认10，最大1000"),
				enterpriseDataPlan: z.string().optional().describe("企业资费计划名称"),
				expirationTimeStart: z.string().optional().describe("起始到期时间，格式：yyyy-MM-dd"),
				expirationTimeEnd: z.string().optional().describe("截止到期时间，格式：yyyy-MM-dd"),
				iccidStart: z.string().optional().describe("ICCID起始号码"),
				iccidEnd: z.string().optional().describe("ICCID截止号码"),
				label: z.string().optional().describe("标签"),
				simState: z.number().optional().describe("卡状态 (2:预激活 3:测试 4:沉默 5:待机 6:激活 7:停机 8:暂停 10:预注销 11:注销)"),
				simType: z.string().optional().describe("卡类型"),
			},
			async (params) => {
				try {
					const response = await this.cmpClient.querySimList(params);
					
					if (response.code === 200) {
						const data = response.data;
						const simList = data.list || [];
						
						let result = `📊 SIM卡查询结果\n`;
						result += `├─ 当前页码: ${data.current}\n`;
						result += `├─ 每页数量: ${data.size}\n`;
						result += `├─ 总页数: ${data.pages}\n`;
						result += `├─ 总记录数: ${data.total}\n\n`;
						
						if (simList.length > 0) {
							result += `🔍 找到 ${simList.length} 张SIM卡:\n`;
							simList.forEach((sim: any, index: number) => {
								result += `\n${index + 1}. 📱 ICCID: ${sim.iccid || 'N/A'}\n`;
								result += `   ├─ IMSI: ${sim.imsi || 'N/A'}\n`;
								result += `   ├─ MSISDN: ${sim.msisdn || 'N/A'}\n`;
								result += `   ├─ 状态: ${getStateName(sim.simState || 0)}\n`;
								result += `   ├─ 卡类型: ${sim.simType || 'N/A'}\n`;
								result += `   ├─ 企业: ${sim.enterprise || 'N/A'}\n`;
								result += `   ├─ 资费计划: ${sim.enterpriseDataPlan || 'N/A'}\n`;
								result += `   ├─ 激活时间: ${sim.activationTime || 'N/A'}\n`;
								result += `   ├─ 到期时间: ${sim.expirationTime || 'N/A'}\n`;
								result += `   └─ 标签: ${sim.label || '无'}\n`;
							});
						} else {
							result += "❌ 没有找到符合条件的SIM卡";
						}
						
						return { content: [{ type: "text", text: result }] };
					} else {
						return {
							content: [
								{
									type: "text",
									text: `❌ 查询失败: ${response.msg || 'Unknown error'}`
								}
							]
						};
					}
				} catch (error) {
					return {
						content: [
							{
								type: "text",
								text: `❌ 查询SIM列表失败: ${error instanceof Error ? error.message : 'Unknown error'}`
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
				iccid: z.string().describe("SIM卡的ICCID号码"),
			},
			async ({ iccid }) => {
				try {
					const response = await this.cmpClient.querySimDetail(iccid);
					
					if (response.code === 200) {
						const sim = response.data;
						
						let result = `📱 SIM卡详细信息\n`;
						result += `├─ SIM ID: ${sim.simId || 'N/A'}\n`;
						result += `├─ ICCID: ${sim.iccid || 'N/A'}\n`;
						result += `├─ MSISDN: ${sim.msisdn || 'N/A'}\n`;
						result += `├─ IMEI: ${sim.imei || 'N/A'}\n`;
						result += `├─ IMSI: ${sim.imsi || 'N/A'}\n`;
						result += `├─ 归属企业: ${sim.enterprise || 'N/A'}\n`;
						result += `├─ 标签: ${sim.label || '无'}\n`;
						result += `├─ 状态: ${getStateName(sim.simState || 0)}\n`;
						result += `├─ 状态变更原因: ${sim.simStateChangeReason || 'N/A'}\n`;
						result += `├─ 所在国家/地区: ${sim.countryRegion || 'N/A'}\n`;
						result += `├─ 运营商网络: ${sim.operatorNetwork || 'N/A'}\n`;
						result += `├─ 企业资费计划: ${sim.enterpriseDataPlan || 'N/A'}\n`;
						result += `├─ 网络制式: ${sim.networkType || 'N/A'}\n`;
						result += `├─ 卡类型: ${sim.simType || 'N/A'}\n`;
						result += `├─ APN: ${sim.apn || 'N/A'}\n`;
						result += `├─ RAT: ${sim.rat || 'N/A'}\n`;
						result += `├─ 开卡时间: ${sim.initialTime || 'N/A'}\n`;
						result += `├─ 激活时间: ${sim.activationTime || 'N/A'}\n`;
						result += `├─ 到期时间: ${sim.expirationTime || 'N/A'}\n`;
						result += `├─ 上次会话时间: ${sim.lastSessionTime || 'N/A'}\n`;
						
						// 格式化数据用量
						const dataUsage = sim.usedDataOfCurrentPeriod || 0;
						const usage = typeof dataUsage === 'string' ? parseInt(dataUsage) || 0 : dataUsage;
						const formattedUsage = this.cmpClient.formatDataUsage(usage);
						result += `└─ 当前周期数据用量: ${formattedUsage}\n`;
						
						return { content: [{ type: "text", text: result }] };
					} else {
						return {
							content: [
								{
									type: "text",
									text: `❌ 查询失败: ${response.msg || 'Unknown error'}`
								}
							]
						};
					}
				} catch (error) {
					return {
						content: [
							{
								type: "text",
								text: `❌ 查询SIM详情失败: ${error instanceof Error ? error.message : 'Unknown error'}`
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
