const http = require('http');

// First login to get token
const loginData = JSON.stringify({
    email: 'john@example.com',
    password: 'password123'
});

const loginOptions = {
    hostname: 'localhost',
    port: 3001,
    path: '/api/auth/login',
    method: 'POST',
    headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(loginData)
    }
};

const loginReq = http.request(loginOptions, (res) => {
    let data = '';
    res.on('data', (chunk) => { data += chunk; });
    res.on('end', () => {
        const loginResult = JSON.parse(data);
        console.log('Login Status:', res.statusCode);
        
        if (loginResult.token) {
            // Now create an order
            const orderData = JSON.stringify({
                items: [
                    { _id: '1', title: 'Test Book', price: 500, quantity: 2 }
                ],
                total: 1000
            });
            
            const orderOptions = {
                hostname: 'localhost',
                port: 3001,
                path: '/api/orders',
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Content-Length': Buffer.byteLength(orderData),
                    'Authorization': `Bearer ${loginResult.token}`
                }
            };
            
            const orderReq = http.request(orderOptions, (orderRes) => {
                let orderDataStr = '';
                orderRes.on('data', (chunk) => { orderDataStr += chunk; });
                orderRes.on('end', () => {
                    console.log('Order Status:', orderRes.statusCode);
                    console.log('Order Response:', orderDataStr);
                });
            });
            
            orderReq.write(orderData);
            orderReq.end();
        }
    });
});

loginReq.write(loginData);
loginReq.end();
