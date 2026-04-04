const http = require('http');

console.log('Testing API endpoints...');

// Test health endpoint
const options = {
    hostname: 'localhost',
    port: 3001,
    path: '/api/health',
    method: 'GET'
};

const req = http.request(options, (res) => {
    let data = '';
    res.on('data', (chunk) => {
        data += chunk;
    });
    res.on('end', () => {
        console.log('Health check:', data);
    });
});

req.on('error', (e) => {
    console.error('Problem with request: ' + e.message);
});

req.end();
