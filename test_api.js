// Simple test script to compare the three API endpoints
const testEndpoints = async () => {
    const baseUrl = 'https://cmp-mcp-server.zlinoliver.workers.dev/mcp';
    
    // Test data for each endpoint
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
        console.log(`\n🧪 Testing: ${test.name}`);
        console.log(`📍 Endpoint: ${test.endpoint}`);
        console.log(`📊 Data: ${JSON.stringify(test.data)}`);
        
        try {
            const response = await fetch(baseUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Accept': 'application/json, text/event-stream',
                    'Mcp-Session-Id': 'test-session-' + Date.now()
                },
                body: JSON.stringify({
                    jsonrpc: "2.0",
                    id: 1,
                    method: "tools/call",
                    params: {
                        name: "test_api",
                        arguments: {
                            endpoint: test.endpoint,
                            data: JSON.stringify(test.data)
                        }
                    }
                })
            });
            
            const result = await response.text();
            console.log(`✅ Response: ${result}`);
            
        } catch (error) {
            console.log(`❌ Error: ${error.message}`);
        }
        
        console.log('─'.repeat(50));
    }
};

testEndpoints();