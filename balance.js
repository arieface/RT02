// ==================== KONFIGURASI UTAMA =====================
const CONFIG = {
    // URL Google Sheets (tanpa range parameter)
    SHEET_URL: "https://docs.google.com/spreadsheets/d/e/2PACX-1vRbLFk69seIMkTsx5xGSLyOHM4Iou1uTQMNNpTnwSoWX5Yu2JBgs71Lbd9OH2Xdgq6GKR0_OiTo9shV/pub?gid=236846195&single=true&output=csv",
    
    // ⭐ INTERVAL OPTIMAL: 30 detik
    UPDATE_INTERVAL: 30000,
    
    // Validasi
    MAX_PERCENT_CHANGE: 50,
    REQUIRED_CONSECUTIVE: 2,
    MAX_CONSECUTIVE_ERRORS: 3,
    
    // Cache settings
    CACHE_TTL: 30000,
    RETRY_DELAY: 2000,
    MAX_RETRIES: 3,
};

// ==================== VARIABEL GLOBAL ====================
let currentBalance = null;
let lastUpdateTime = null;
let isFetching = false;
let updateTimer = null;
let isInitialized = false;
let consecutiveErrors = 0;
let changeConfirmation = {
    candidate: null,
    count: 0,
    timestamp: 0
};

// ==================== CACHE SYSTEM ====================
const balanceCache = {
    value: null,
    timestamp: 0,
    
    set: function(value) {
        this.value = value;
        this.timestamp = Date.now();
    },
    
    get: function() {
        if (this.value && (Date.now() - this.timestamp) < CONFIG.CACHE_TTL) {
            return this.value;
        }
        return null;
    }
};

// ==================== UTILITY FUNCTIONS ====================

/**
 * Generate cache-busting URL (SIMPLE VERSION untuk hindari CORS)
 */
function generateCacheBustUrl() {
    // Gunakan cara sederhana tanpa banyak parameter
    const timestamp = Date.now();
    return `${CONFIG.SHEET_URL}&_=${timestamp}`;
}

/**
 * Parse dan clean nilai dari CSV
 */
function parseAndCleanValue(rawValue) {
    if (!rawValue || typeof rawValue !== 'string') return null;
    
    let cleaned = rawValue.trim();
    
    // Jika CSV memiliki header atau format khusus
    // Coba ambil hanya angka dari string
    const match = cleaned.match(/-?\d[\d.,]*/);
    if (match) {
        cleaned = match[0];
    }
    
    // Remove currency symbols
    cleaned = cleaned.replace(/Rp\s*|IDR\s*|USD\s*|€\s*|\$\s*/gi, '');
    
    // Remove all spaces
    cleaned = cleaned.replace(/\s/g, '');
    
    // Handle thousand separators
    if (cleaned.includes('.') && cleaned.includes(',')) {
        // Format: 1.234,56
        cleaned = cleaned.replace(/\./g, '');
        cleaned = cleaned.replace(',', '.');
    } else if (cleaned.includes(',')) {
        // Format: 1,234.56 atau 1234,56
        const parts = cleaned.split(',');
        if (parts.length === 2 && parts[1].length <= 2) {
            cleaned = cleaned.replace(',', '.');
        } else {
            cleaned = cleaned.replace(/,/g, '');
        }
    } else {
        // Remove dots (assume thousand separators)
        cleaned = cleaned.replace(/\./g, '');
    }
    
    // Remove any remaining non-numeric
    cleaned = cleaned.replace(/[^\d.-]/g, '');
    
    if (!cleaned || cleaned === '-' || cleaned === '.') {
        return null;
    }
    
    const numericValue = parseFloat(cleaned);
    
    if (isNaN(numericValue) || !isFinite(numericValue)) {
        return null;
    }
    
    return Math.round(numericValue * 100) / 100;
}

/**
 * Fetch dari Google Sheets dengan CORS-compliant headers
 */
async function fetchFromGoogleSheets() {
    let lastError = null;
    
    for (let attempt = 1; attempt <= CONFIG.MAX_RETRIES; attempt++) {
        try {
            console.log(`📡 [Balance] Fetch attempt ${attempt}/${CONFIG.MAX_RETRIES}`);
            
            const url = generateCacheBustUrl();
            
            // OPTION 1: Simple fetch tanpa custom headers (untuk hindari CORS preflight)
            const response = await fetch(url, {
                method: 'GET',
                mode: 'cors',
                // JANGAN gunakan cache: 'no-store' karena trigger preflight
                // JANGAN gunakan custom headers
            });
            
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }
            
            const csvText = await response.text();
            
            if (!csvText || csvText.trim().length === 0) {
                throw new Error('Empty response from Google Sheets');
            }
            
            console.log(`✅ [Balance] Fetch successful (${csvText.length} chars)`);
            return csvText;
            
        } catch (error) {
            lastError = error;
            console.warn(`⚠️ [Balance] Attempt ${attempt} failed: ${error.message}`);
            
            if (attempt < CONFIG.MAX_RETRIES) {
                const delay = CONFIG.RETRY_DELAY * attempt;
                console.log(`⏳ [Balance] Retrying in ${delay/1000}s...`);
                await new Promise(resolve => setTimeout(resolve, delay));
            }
        }
    }
    
    throw lastError || new Error('All fetch attempts failed');
}

/**
 * Extract cell A100 dari CSV data (SIMPLE VERSION)
 */
function extractCellA100(csvData) {
    try {
        // Split by lines
        const lines = csvData.split(/\r?\n/);
        
        // Cari baris ke-100 (index 99)
        if (lines.length < 100) {
            // Jika kurang dari 100 baris, ambil baris terakhir
            const lastLine = lines[lines.length - 1];
            const columns = lastLine.split(',');
            return columns[0] || '';
        }
        
        // Ambil baris ke-100
        const line100 = lines[99];
        const columns = line100.split(',');
        
        return columns[0] || '';
        
    } catch (error) {
        console.error('❌ [Balance] Error extracting A100:', error);
        throw error;
    }
}

/**
 * Validasi perubahan balance
 */
function validateBalanceChange(oldValue, newValue) {
    if (oldValue === null || newValue === null) {
        return { isValid: true, reason: 'First load or null value' };
    }
    
    const percentChange = Math.abs((newValue - oldValue) / oldValue) * 100;
    
    if (percentChange <= CONFIG.MAX_PERCENT_CHANGE) {
        return { 
            isValid: true, 
            reason: `Normal change: ${percentChange.toFixed(1)}%` 
        };
    }
    
    return { 
        isValid: false, 
        reason: `Drastic change: ${percentChange.toFixed(1)}% > ${CONFIG.MAX_PERCENT_CHANGE}%`,
        percentChange: percentChange
    };
}

/**
 * Handle perubahan yang butuh konfirmasi
 */
function handleChangeConfirmation(newValue) {
    const now = Date.now();
    const CONFIRMATION_TIMEOUT = 60000;
    
    if (now - changeConfirmation.timestamp > CONFIRMATION_TIMEOUT) {
        console.log('🔄 Reset change confirmation (timeout)');
        changeConfirmation.candidate = newValue;
        changeConfirmation.count = 1;
        changeConfirmation.timestamp = now;
        return { confirmed: false, value: null };
    }
    
    if (changeConfirmation.candidate !== null) {
        const diff = Math.abs(newValue - changeConfirmation.candidate);
        const tolerance = changeConfirmation.candidate * 0.05;
        
        if (diff <= tolerance) {
            changeConfirmation.count++;
            console.log(`🔄 Confirmation ${changeConfirmation.count}/${CONFIG.REQUIRED_CONSECUTIVE}`);
            
            if (changeConfirmation.count >= CONFIG.REQUIRED_CONSECUTIVE) {
                console.log(`✅ Change confirmed: ${newValue}`);
                const confirmedValue = newValue;
                
                changeConfirmation.candidate = null;
                changeConfirmation.count = 0;
                changeConfirmation.timestamp = 0;
                
                return { confirmed: true, value: confirmedValue };
            }
        } else {
            console.log('🔄 New candidate value, resetting confirmation');
            changeConfirmation.candidate = newValue;
            changeConfirmation.count = 1;
        }
    } else {
        changeConfirmation.candidate = newValue;
        changeConfirmation.count = 1;
        changeConfirmation.timestamp = now;
    }
    
    return { confirmed: false, value: null };
}

// ==================== MAIN BALANCE FETCH FUNCTION ====================

async function fetchBalance() {
    // Cek cache lokal dulu
    const cachedValue = balanceCache.get();
    if (cachedValue !== null) {
        console.log('💾 [Balance] Using cached value');
        return cachedValue;
    }
    
    if (isFetching) {
        console.log('⏳ [Balance] Already fetching, returning last known value');
        return currentBalance;
    }
    
    isFetching = true;
    const fetchStartTime = Date.now();
    
    try {
        console.log('🚀 [Balance] Starting balance fetch...');
        
        // 1. Fetch data
        const csvData = await fetchFromGoogleSheets();
        
        // 2. Extract cell A100
        const cellA100 = extractCellA100(csvData);
        
        // 3. Parse dan clean nilai
        const rawValue = parseAndCleanValue(cellA100);
        
        if (rawValue === null) {
            throw new Error('Failed to parse cell A100 value');
        }
        
        console.log(`🔢 [Balance] Parsed value: ${rawValue}`);
        
        // 4. Validasi perubahan
        const validation = validateBalanceChange(currentBalance, rawValue);
        
        if (validation.isValid) {
            console.log(`✅ [Balance] ${validation.reason}`);
            currentBalance = rawValue;
            consecutiveErrors = 0;
            balanceCache.set(rawValue);
        } else {
            console.warn(`⚠️ [Balance] ${validation.reason}`);
            
            const confirmation = handleChangeConfirmation(rawValue);
            
            if (confirmation.confirmed) {
                currentBalance = confirmation.value;
                consecutiveErrors = 0;
                balanceCache.set(confirmation.value);
            } else {
                console.log('⏳ [Balance] Waiting for confirmation, keeping previous value');
                if (currentBalance !== null) {
                    balanceCache.set(currentBalance);
                }
            }
        }
        
        // 5. Update timestamp
        lastUpdateTime = new Date();
        
        const fetchTime = Date.now() - fetchStartTime;
        console.log(`✅ [Balance] Fetch completed in ${fetchTime}ms`);
        
        return currentBalance;
        
    } catch (error) {
        console.error('❌ [Balance] Fetch failed:', error.message);
        
        consecutiveErrors++;
        
        if (consecutiveErrors >= CONFIG.MAX_CONSECUTIVE_ERRORS) {
            console.warn('🔄 [Balance] Too many errors, resetting state');
            consecutiveErrors = 0;
            changeConfirmation.candidate = null;
            changeConfirmation.count = 0;
        }
        
        return currentBalance;
        
    } finally {
        isFetching = false;
    }
}

// ==================== UPDATE AND EVENT SYSTEM ====================

async function updateBalance() {
    try {
        const newBalance = await fetchBalance();
        
        if (newBalance !== null) {
            const eventDetail = {
                balance: newBalance,
                formatted: formatCurrency(newBalance),
                timestamp: lastUpdateTime ? lastUpdateTime.toISOString() : new Date().toISOString(),
                raw: newBalance
            };
            
            const event = new CustomEvent('balanceUpdated', { detail: eventDetail });
            window.dispatchEvent(event);
            
            console.log(`📢 [Balance] Balance: ${eventDetail.formatted}`);
        }
        
        return newBalance;
        
    } catch (error) {
        console.error('❌ [Balance] Update failed:', error);
        
        const errorEvent = new CustomEvent('balanceError', {
            detail: {
                message: error.message,
                timestamp: new Date().toISOString()
            }
        });
        window.dispatchEvent(errorEvent);
        
        return null;
    }
}

function formatCurrency(value) {
    if (value === null || value === undefined) return 'Rp 0';
    
    return new Intl.NumberFormat('id-ID', {
        style: 'currency',
        currency: 'IDR',
        minimumFractionDigits: 0,
        maximumFractionDigits: 0
    }).format(value);
}

// ==================== SIMPLE INTERVAL MANAGEMENT ====================

function startPolling() {
    if (updateTimer) {
        clearInterval(updateTimer);
    }
    
    updateTimer = setInterval(() => {
        updateBalance();
    }, CONFIG.UPDATE_INTERVAL);
    
    console.log(`⏰ [Balance] Auto-update setiap ${CONFIG.UPDATE_INTERVAL/1000} detik`);
}

// ==================== INITIALIZATION ====================

async function initializeBalanceSystem() {
    if (isInitialized) {
        console.log('ℹ️ [Balance] Already initialized');
        return;
    }
    
    console.log('🚀 [Balance] Initializing system...');
    
    try {
        // Tunggu DOM ready
        if (document.readyState === 'loading') {
            await new Promise(resolve => {
                document.addEventListener('DOMContentLoaded', resolve);
            });
        }
        
        console.log('📦 [Balance] DOM ready, starting...');
        
        // Initial fetch
        await updateBalance();
        
        // Start polling
        startPolling();
        
        // Update saat tab aktif kembali
        document.addEventListener('visibilitychange', () => {
            if (!document.hidden) {
                console.log('👁️ [Balance] Tab aktif, refreshing...');
                updateBalance();
            }
        });
        
        // Update saat online kembali
        window.addEventListener('online', () => {
            console.log('🌐 [Balance] Online, refreshing...');
            updateBalance();
        });
        
        isInitialized = true;
        console.log('✅ [Balance] System initialized successfully');
        
        // Dispatch ready event
        window.dispatchEvent(new CustomEvent('balanceReady', {
            detail: {
                timestamp: new Date().toISOString(),
                interval: CONFIG.UPDATE_INTERVAL
            }
        }));
        
    } catch (error) {
        console.error('❌ [Balance] Initialization failed:', error);
        throw error;
    }
}

// ==================== PUBLIC API ====================

window.BalanceSystem = {
    // Status
    isReady: () => isInitialized,
    isFetching: () => isFetching,
    
    // Data - PERBAIKAN: gunakan nama fungsi yang konsisten
    getCurrentSaldo: () => currentBalance,  // ✅ untuk kompatibilitas dengan script.js
    getCurrentBalance: () => currentBalance, // ✅ alias
    getFormattedBalance: () => formatCurrency(currentBalance),
    getLastUpdateTime: () => lastUpdateTime, // ✅ untuk kompatibilitas
    
    // Actions
    refresh: async () => {
        console.log('🔧 [Balance] Manual refresh requested');
        return await updateBalance();
    },
    
    forceRefresh: async () => {
        console.log('⚡ [Balance] Force refresh');
        balanceCache.value = null;
        consecutiveErrors = 0;
        return await updateBalance();
    },
    
    // Configuration
    setUpdateInterval: (ms) => {
        if (ms >= 10000 && ms <= 300000) {
            CONFIG.UPDATE_INTERVAL = ms;
            startPolling();
            console.log(`⏰ [Balance] Update interval set to ${ms/1000}s`);
        }
    },
    
    // Debug
    debug: () => ({
        currentBalance,
        formattedBalance: formatCurrency(currentBalance),
        lastUpdate: lastUpdateTime ? lastUpdateTime.toISOString() : null,
        isFetching,
        isInitialized,
        consecutiveErrors,
        config: { ...CONFIG }
    })
};

// ==================== AUTO START ====================

// Start setelah halaman load
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        setTimeout(initializeBalanceSystem, 100);
    });
} else {
    setTimeout(initializeBalanceSystem, 100);
}