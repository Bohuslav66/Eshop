const express = require('express');
const mongoose = require('mongoose');
const fileUpload = require('express-fileupload');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const cors = require('cors');

const app = express();
const PORT = 3000;

// Middleware
app.use(express.json());
app.use(cors());
app.use(fileUpload());

// MongoDB connection
mongoose.connect('mongodb://localhost:27017/eshop', {
  useNewUrlParser: true,
  useUnifiedTopology: true,
});

const db = mongoose.connection;
db.on('error', console.error.bind(console, 'connection error:'));
db.once('open', () => {
  console.log('Connected to MongoDB');
});

// Schemas and Models
const userSchema = new mongoose.Schema({
  username: String,
  password: String,
  currency: { type: String, enum: ['Kč', '€'], default: 'Kč' },
  isAdmin: { type: Boolean, default: false },
});

const productSchema = new mongoose.Schema({
  name: String,
  description: String,
  category: String,
  image: String,
  priceCZK: Number,
  priceEUR: Number,
  stock: Number,
});

const orderSchema = new mongoose.Schema({
  userId: mongoose.Schema.Types.ObjectId,
  products: [
    {
      productId: mongoose.Schema.Types.ObjectId,
      quantity: Number,
    },
  ],
  status: { type: String, enum: ['Pending', 'Completed', 'Cancelled'], default: 'Pending' },
});

const User = mongoose.model('User', userSchema);
const Product = mongoose.model('Product', productSchema);
const Order = mongoose.model('Order', orderSchema);

// User Registration
app.post('/register', async (req, res) => {
  const { username, password, currency } = req.body;
  const hashedPassword = await bcrypt.hash(password, 10);
  const newUser = new User({ username, password: hashedPassword, currency });
  await newUser.save();
  res.status(201).json({ message: 'User registered successfully' });
});

// User Login
app.post('/login', async (req, res) => {
  const { username, password } = req.body;
  const user = await User.findOne({ username });
  if (!user) return res.status(404).json({ message: 'User not found' });

  const validPassword = await bcrypt.compare(password, user.password);
  if (!validPassword) return res.status(401).json({ message: 'Invalid password' });

  const token = jwt.sign({ id: user._id, isAdmin: user.isAdmin }, 'secretKey', { expiresIn: '1h' });
  res.json({ token });
});

// Get Products
app.get('/products', async (req, res) => {
  const { category, search } = req.query;
  const filters = {};
  if (category) filters.category = category;
  if (search) filters.name = { $regex: search, $options: 'i' };

  const products = await Product.find(filters);
  res.json(products);
});

// Create or Update Product (Admin only)
app.post('/admin/product', async (req, res) => {
  const { id, name, description, category, priceCZK, priceEUR, stock } = req.body;
  let image = '';

  if (req.files && req.files.image) {
    const img = req.files.image;
    image = `/uploads/${img.name}`;
    await img.mv(`./public${image}`);
  }

  if (id) {
    await Product.findByIdAndUpdate(id, { name, description, category, priceCZK, priceEUR, stock, image });
    res.json({ message: 'Product updated successfully' });
  } else {
    const newProduct = new Product({ name, description, category, priceCZK, priceEUR, stock, image });
    await newProduct.save();
    res.status(201).json({ message: 'Product created successfully' });
  }
});

// Manage Orders (Admin)
app.get('/admin/orders', async (req, res) => {
  const orders = await Order.find();
  res.json(orders);
});

app.post('/admin/order-status', async (req, res) => {
  const { id, status } = req.body;
  const order = await Order.findById(id);
  if (!order) return res.status(404).json({ message: 'Order not found' });

  if (status === 'Completed') {
    for (const item of order.products) {
      const product = await Product.findById(item.productId);
      if (product) product.stock -= item.quantity;
      await product.save();
    }
  }

  order.status = status;
  await order.save();
  res.json({ message: 'Order status updated' });
});

// Start Server
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});