// Direct API test without MCP wrapper
import crypto from 'crypto';

class TestCMPClient {
    constructor(appKey, appSecret, endpoint) {
        this.appKey = appKey;
        this.appSecret = appSecret;
        this.endpoint = endpoint.replace(/\/$/, "");
    }

    async generateSignature(timestamp, requestBody = "") {
        const signContent = this.appKey + timestamp.toString() + requestBody;
        const signature = crypto.createHmac('sha256', this.appSecret)
            .update(signContent)
            .digest('hex');
        return signature;
    }

    async getHeaders(requestBody = "") {
        const timestamp = Math.floor(Date.now() / 1000);
        const signature = await this.generateSignature(timestamp, requestBody);
        
        return {
            "Content-Type": "application/json",
            "APP-Key": this.appKey,
            "Signature": signature,
            "Timestamp": timestamp.toString(),
        };
    }

    async testEndpoint(path, data) {
        const baseUrl = this.endpoint.endsWith('/') ? this.endpoint.slice(0, -1) : this.endpoint;
        const urlPath = path.startsWith('/') ? path.slice(1) : path;
        const url = `${baseUrl}/${urlPath}`;
        
        const requestBody = JSON.stringify(data);
        const headers = await this.getHeaders(requestBody);

        console.log(`🔍 Making POST request to: ${url}`);
        console.log(`📊 Request body: ${requestBody}`);
        console.log(`🔑 Headers: ${JSON.stringify(headers)}`);

        try {
            const response = await fetch(url, {
                method: 'POST',
                headers,
                body: requestBody,
            });

            console.log(`📡 Response status: ${response.status} ${response.statusText}`);

            const responseText = await response.text();
            console.log(`📋 Response body: ${responseText}`);

            if (!response.ok) {
                return { error: `HTTP ${response.status}: ${response.statusText}`, body: responseText };
            }

            try {
                const result = JSON.parse(responseText);
                return { success: true, data: result };
            } catch (e) {
                return { error: "Invalid JSON response", body: responseText };
            }
        } catch (error) {
            return { error: error.message };
        }
    }
}

// Test with environment variables that should be available
const CMP_API_KEY = process.env.CMP_API_KEY || "your_api_key_here";
const CMP_API_SECRET = process.env.CMP_API_SECRET || "your_api_secret_here";
const CMP_API_ENDPOINT = "https://cmp.acceleronix.io/gateway/openapi";

const client = new TestCMPClient(CMP_API_KEY, CMP_API_SECRET, CMP_API_ENDPOINT);

const runTests = async () => {
    console.log("=".repeat(60));
    console.log("🚀 Starting API Endpoint Comparison Tests");
    console.log("=".repeat(60));

    const tests = [
        {
            name: "SIM List (Known Working)",
            endpoint: "/sim/page",
            data: { pageNum: 1, pageSize: 5 }
        },
        {
            name: "SIM Detail (Known Working)",
            endpoint: "/sim/detail", 
            data: { iccid: "8932042000002328543" }
        },
        {
            name: "SIM Usage (New API)",
            endpoint: "/sim/queryMonthData",
            data: { iccid: "8932042000002328543", month: "202310" }
        }
    ];

    for (const test of tests) {
        console.log(`\n📋 Test: ${test.name}`);
        console.log(`📍 Endpoint: ${test.endpoint}`);
        console.log(`📊 Payload: ${JSON.stringify(test.data)}`);
        console.log("-".repeat(50));
        
        const result = await client.testEndpoint(test.endpoint, test.data);
        
        if (result.success) {
            console.log(`✅ Success! Response:`, JSON.stringify(result.data, null, 2));
        } else {
            console.log(`❌ Failed:`, result.error);
            if (result.body) {
                console.log(`📄 Response body:`, result.body);
            }
        }
        
        console.log("=".repeat(60));
    }
};

runTests().catch(console.error);