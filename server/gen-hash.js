const bcrypt = require('bcryptjs');

// Generate hashes for the passwords
const password123 = bcrypt.hashSync('password123', 10);
const admin123 = bcrypt.hashSync('admin123', 10);

console.log('password123 hash:', password123);
console.log('admin123 hash:', admin123);
