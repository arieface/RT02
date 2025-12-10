// File: /api/saldo.js

const GOOGLE_SHEETS_URL = "https://docs.google.com/spreadsheets/d/e/2PACX-1vRbLFk69seIMkTsx5xGSLyOHM4Iou1uTQMNNpTnwSoWX5Yu2JBgs71Lbd9OH2Xdgq6GKR0_OiTo9shV/pub?gid=236846195&range=A100:A100&single=true&output=csv";

// Cache configuration
let cachedData = null;
let lastFetchTime = 0;
const CACHE_DURATION = 30000; // 30 detik

export default async function handler(req, res) {
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  // Handle preflight request
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // Only allow GET method
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const now = Date.now();
    
    // Jika data dalam cache dan masih fresh
    if (cachedData && (now - lastFetchTime) < CACHE_DURATION) {
      console.log('📦 Menggunakan data cached');
      return res.status(200).json({
        success: true,
        data: cachedData,
        cached: true,
        timestamp: new Date().toISOString()
      });
    }

    // Fetch dari Google Sheets
    console.log('📡 Fetching data dari Google Sheets...');
    const response = await fetch(`${GOOGLE_SHEETS_URL}&_=${now}`, {
      headers: {
        'Cache-Control': 'no-cache'
      }
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const text = await response.text();
    
    // Process data
    const processedData = processSaldoData(text);
    
    // Update cache
    cachedData = processedData;
    lastFetchTime = now;

    return res.status(200).json({
      success: true,
      data: processedData,
      cached: false,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('❌ Error fetching data:', error);
    
    // Jika error tapi ada cache, gunakan cache
    if (cachedData) {
      return res.status(200).json({
        success: true,
        data: cachedData,
        cached: true,
        error: 'Menggunakan data cached karena error',
        timestamp: new Date().toISOString()
      });
    }
    
    return res.status(500).json({
      success: false,
      error: 'Failed to fetch data',
      timestamp: new Date().toISOString()
    });
  }
}

function processSaldoData(rawData) {
  let cleaned = rawData.trim();
  
  if (!cleaned) {
    throw new Error('Data kosong');
  }
  
  // Hapus Rp jika ada
  cleaned = cleaned.replace(/Rp\s*/i, '');
  // Hapus semua titik (pemisah ribuan)
  cleaned = cleaned.replace(/\./g, '');
  // Ganti koma dengan titik untuk desimal
  cleaned = cleaned.replace(',', '.');
  
  // Konversi ke number
  const numericValue = parseFloat(cleaned);
  
  if (isNaN(numericValue)) {
    throw new Error('Tidak dapat mengkonversi ke angka');
  }
  
  // Format ke Rupiah
  const formatted = new Intl.NumberFormat('id-ID', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0
  }).format(numericValue);
  
  return {
    raw: rawData,
    numeric: numericValue,
    formatted: formatted
  };
}
