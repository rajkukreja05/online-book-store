# Online Book Store - E-Commerce Website Specification

## Project Overview
- **Project Name**: Online Book Store
- **Type**: Full-stack E-Commerce Web Application
- **Core Functionality**: Book catalog browsing, user authentication, shopping cart, order management
- **Target Users**: Customers looking to buy books online, Admin for managing the store

## Architecture Mapping

### Frontend (HTML, CSS, JS)
- **index.html**: Home page with featured books
- **catalog.html**: Complete book catalog
- **book-details.html**: Individual book details
- **cart.html**: Shopping cart
- **login.html**: User login
- **signup.html**: User registration
- **profile.html**: User profile and order history
- **admin.html**: Admin dashboard

### Backend (Node.js/Express)
- **server.js**: Main Express server
- **routes/api.js**: REST API endpoints
- **middleware/auth.js**: JWT authentication middleware
- **config/db.js**: MongoDB connection

### Database (MongoDB)
- **models/User.js**: User schema
- **models/Book.js**: Book schema
- **models/Order.js**: Order schema
- **models/Cart.js**: Cart schema

## UI/UX Specification

### Color Palette
- **Primary**: #1a1a2e (Deep Navy)
- **Secondary**: #16213e (Dark Blue)
- **Accent**: #e94560 (Coral Red)
- **Background**: #0f0f23 (Dark Background)
- **Text Primary**: #eaeaea (Light Gray)
- **Text Secondary**: #a0a0a0 (Medium Gray)
- **Success**: #00d9a5 (Teal Green)
- **Card Background**: #1f1f3a (Dark Card)

### Typography
- **Headings**: 'Playfair Display', serif
- **Body**: 'Source Sans Pro', sans-serif
- **Logo/Brand**: 'Cinzel', serif

### Layout Structure
- Responsive design (mobile-first)
- Fixed navigation bar
- Hero section with featured books
- Grid-based book catalog
- Floating cart button

### Components
- Book cards with hover effects
- Search bar with autocomplete
- Filter sidebar (category, price, rating)
- Toast notifications
- Modal dialogs
- Loading spinners
- Form validation

## Functionality Specification

### User Features
1. **Browse Books**: View all books, filter by category, search
2. **Book Details**: View detailed book information
3. **User Registration**: Sign up with email/password
4. **User Login**: Login with JWT authentication
5. **Shopping Cart**: Add/remove books, update quantities
6. **Checkout**: Place orders (simulated)
7. **Order History**: View past orders

### Admin Features
1. **Dashboard**: Overview of store statistics
2. **Manage Books**: Add, edit, delete books
3. **Manage Orders**: View and update order status

### API Endpoints
- `POST /api/auth/register` - User registration
- `POST /api/auth/login` - User login
- `GET /api/books` - Get all books
- `GET /api/books/:id` - Get book details
- `POST /api/cart` - Add to cart
- `GET /api/cart` - Get cart items
- `POST /api/orders` - Place order
- `GET /api/orders` - Get user orders
- `GET /api/admin/stats` - Admin statistics

## Acceptance Criteria

### Visual Checkpoints
- [ ] Dark theme with coral accents applied
- [ ] Playfair Display font for headings
- [ ] Book cards display with hover effects
- [ ] Responsive on mobile, tablet, desktop
- [ ] Smooth animations and transitions
- [ ] Admin dashboard accessible only to admin users

### Functional Checkpoints
- [ ] User can register and login
- [ ] JWT token stored and used for auth
- [ ] Books display from database
- [ ] Cart functionality works
- [ ] Orders can be placed
- [ ] Admin can manage books and orders
