const mongoose = require('mongoose');
const User = require('./models/User');
const Book = require('./models/Book');
const Order = require('./models/Order');

const MONGO_URI =
    process.env.MONGO_URI || process.env.MONGODB_URI || 'mongodb://localhost:27017/bookstore';

async function seed() {
  try {
    await mongoose.connect(MONGO_URI);
    console.log('✅ Connected to MongoDB');

    // Clear data
    await User.deleteMany({});
    await Book.deleteMany({});
    await Order.deleteMany({});
    console.log('🗑️ Cleared existing data');

    // Users (passwords hashed)
    const usersData = [
      {
        name: 'John Doe',
        email: 'john@example.com',
        password: '$2a$10$Onf.l420YXJ6jGuDff0bwegOq7xbdBWG5XDVeFcejuqk1EmGET6ES', // password123
        role: 'user'
      },
      {
        name: 'Admin User',
        email: 'admin@bookhaven.com',
        password: '$2a$10$4ew.FqhBkt9hKvUfyOzpcuE451MeiZKUszzbmakziltMVPxEAuZP6', // admin123
        role: 'admin'
      }
    ];
    const users = await User.insertMany(usersData);
    console.log('👥 Users seeded:', users.length);

    // Books
    const booksData = [
      {
        title: 'The Great Gatsby',
        author: 'F. Scott Fitzgerald',
        category: 'Fiction',
        price: 1079,
        description: 'A classic novel of the Jazz Age.',
        coverImage: 'https://images.unsplash.com/photo-1544947950-fa07a98d237f?w=400',
        rating: 4.5,
        stock: 50,
        isTrending: true
      },
      {
        title: '1984',
        author: 'George Orwell',
        category: 'Fiction',
        price: 1244,
        description: 'Dystopian novel.',
        coverImage: 'https://images.unsplash.com/photo-1543002588-bfa74002ed7e?w=400',
        rating: 4.8,
        stock: 35,
        isTrending: true
      },
      {
        title: 'Sapiens',
        author: 'Yuval Noah Harari',
        category: 'History',
        price: 1576,
        description: 'History of humankind.',
        coverImage: 'https://images.unsplash.com/photo-1512820790803-83ca734da794?w=400',
        rating: 4.7,
        stock: 25
      }
    ];
    const books = await Book.insertMany(booksData);
    console.log('📚 Books seeded:', books.length);

    // Orders (after users/books exist)
    const ordersData = [
      {
        userId: users[0]._id,
        items: [{
          bookId: books[0]._id,
          title: books[0].title,
          author: books[0].author,
          price: books[0].price,
          quantity: 1,
          coverImage: books[0].coverImage
        }],
        total: books[0].price,
        status: 'delivered',
        paymentStatus: 'completed'
      }
    ];
    await Order.insertMany(ordersData);
    console.log('📦 Orders seeded');

    console.log('🎉 Seed complete! Check Compass.');
    mongoose.connection.close();
  } catch (err) {
    console.error('❌ Seed error:', err);
    process.exit(1);
  }
}

seed();
