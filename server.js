const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const shortid = require('shortid');
const path = require('path');
require('dotenv').config();

const Url = require('./models/Url');

const app = express();

// Middleware
app.use(cors());
app.use(express.json());

// Serve static files from React build in production
if (process.env.NODE_ENV === 'production') {
  app.use(express.static(path.join(__dirname, '../frontend/build')));
}

// Environment variables with defaults
const PORT = process.env.PORT || 5000;
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/urlshortener';
const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';

// Connect to MongoDB
mongoose.connect(MONGODB_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
})
.then(() => console.log('MongoDB connected successfully'))
.catch(err => console.error('MongoDB connection error:', err));

// Utility function to validate URL
const isValidUrl = (string) => {
  try {
    new URL(string);
    return true;
  } catch (_) {
    return false;
  }
};

// Routes

// POST /api/shorten - Create shortened URL
app.post('/api/shorten', async (req, res) => {
  try {
    const { originalUrl } = req.body;

    // Validate input
    if (!originalUrl) {
      return res.status(400).json({ error: 'URL is required' });
    }

    if (!isValidUrl(originalUrl)) {
      return res.status(400).json({ error: 'Invalid URL format' });
    }

    // Check if URL already exists
    let url = await Url.findOne({ originalUrl });
    
    if (url) {
      return res.json({
        originalUrl: url.originalUrl,
        shortUrl: `${BASE_URL}/${url.shortCode}`,
        shortCode: url.shortCode
      });
    }

    // Generate unique short code
    let shortCode;
    let isUnique = false;
    
    while (!isUnique) {
      shortCode = shortid.generate();
      const existingUrl = await Url.findOne({ shortCode });
      if (!existingUrl) {
        isUnique = true;
      }
    }

    // Create new URL entry
    url = new Url({
      originalUrl,
      shortCode
    });

    await url.save();

    res.status(201).json({
      originalUrl: url.originalUrl,
      shortUrl: `${BASE_URL}/${url.shortCode}`,
      shortCode: url.shortCode
    });

  } catch (error) {
    console.error('Error creating short URL:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /:shortcode - Redirect to original URL
app.get('/:shortCode', async (req, res) => {
  try {
    const { shortCode } = req.params;

    const url = await Url.findOne({ shortCode });

    if (!url) {
      return res.status(404).json({ error: 'Short URL not found' });
    }

    // Update click count and last accessed time
    url.clicks += 1;
    url.lastAccessed = new Date();
    await url.save();

    // Redirect to original URL
    res.redirect(url.originalUrl);

  } catch (error) {
    console.error('Error redirecting:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/admin/urls - Get all URLs with stats (Admin endpoint)
app.get('/api/admin/urls', async (req, res) => {
  try {
    const urls = await Url.find({})
      .sort({ createdAt: -1 })
      .select('originalUrl shortCode clicks createdAt lastAccessed');

    const urlsWithFullData = urls.map(url => ({
      _id: url._id,
      originalUrl: url.originalUrl,
      shortUrl: `${BASE_URL}/${url.shortCode}`,
      shortCode: url.shortCode,
      clicks: url.clicks,
      createdAt: url.createdAt,
      lastAccessed: url.lastAccessed
    }));

    res.json(urlsWithFullData);

  } catch (error) {
    console.error('Error fetching URLs:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/admin/stats - Get overall statistics
app.get('/api/admin/stats', async (req, res) => {
  try {
    const totalUrls = await Url.countDocuments({});
    const totalClicks = await Url.aggregate([
      { $group: { _id: null, total: { $sum: '$clicks' } } }
    ]);

    res.json({
      totalUrls,
      totalClicks: totalClicks[0]?.total || 0
    });

  } catch (error) {
    console.error('Error fetching stats:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

// Serve React app for any non-API routes in production
if (process.env.NODE_ENV === 'production') {
  app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, '../frontend/build/index.html'));
  });
}

// Start server
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Base URL: ${BASE_URL}`);
  console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
});
