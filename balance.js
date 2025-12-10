// ==================== KONFIGURASI ====================
const SHEET_URL = "https://docs.google.com/spreadsheets/d/e/2PACX-1vRbLFk69seIMkTsx5xGSLyOHM4Iou1uTQMNNpTnwSoWX5Yu2JBgs71Lbd9OH2Xdgq6GKR0_OiTo9shV/pub?gid=236846195&range=A100:A100&single=true&output=csv";
const UPDATE_INTERVAL = 300000; // 5 menit

// ==================== VARIABEL GLOBAL ====================
let currentSaldo = null;
let lastUpdateTime = null;
let lastFetchTime = 0;
let isUpdating = false;
let updateTimer = null;

// ==================== FUNGSI UTAMA ====================

/**
 * Mengambil data langsung dari Google Sheets
 * @returns {Promise<number|null>} Nilai saldo atau null jika gagal
 */
async function fetchSaldoDirect() {
    try {
        console.log("📡 Mengambil data langsung dari Google Sheets...");
        
        const timestamp = new Date().getTime();
        const response = await fetch(`${SHEET_URL}&_=${timestamp}`, {
            cache: 'no-store',
            headers: {
                'Cache-Control': 'no-cache, no-store, must-revalidate',
                'Pragma': 'no-cache'
            }
        });
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const text = await response.text();
        console.log("✅ Data mentah diterima:", text);
        
        return processSaldoData(text);
        
    } catch (error) {
        console.error("❌ Error mengambil data:", error.message);
        return null;
    }
}

/**
 * Memproses data menjadi angka
 * @param {string} rawData - Data mentah
 * @returns {number|null} Nilai saldo
 */
function processSaldoData(rawData) {
    if (!rawData || rawData.trim() === '') {
        console.warn("⚠️ Data kosong");
        return null;
    }
    
    let cleaned = rawData.trim();
    
    // Format: Rp 1.234.567
    if (cleaned.toLowerCase().includes('rp')) {
        cleaned = cleaned.replace(/rp\s*/i, '');
    }
    
    // Hapus titik (ribuan separator)
    cleaned = cleaned.replace(/\./g, '');
    
    // Ganti koma dengan titik untuk desimal
    cleaned = cleaned.replace(',', '.');
    
    // Hapus karakter non-numerik
    cleaned = cleaned.replace(/[^\d.-]/g, '');
    
    const numericValue = parseFloat(cleaned);
    
    if (isNaN(numericValue)) {
        console.error("❌ Tidak dapat mengkonversi:", cleaned);
        return null;
    }
    
    return numericValue;
}

/**
 * Mendapatkan saldo dengan cache memory (hanya untuk sesi browser saat ini)
 * @returns {Promise<number|null>} Nilai saldo
 */
async function getSaldo() {
    const now = Date.now();
    const cacheAge = now - lastFetchTime;
    
    // Cache selama 1 menit di memory browser
    if (currentSaldo !== null && cacheAge < 60000 && !isUpdating) {
        console.log(`📊 Menggunakan cache memory (${Math.floor(cacheAge/1000)} detik lalu)`);
        return currentSaldo;
    }
    
    // Ambil data baru
    console.log("🔄 Ambil data baru dari Google Sheets...");
    const newSaldo = await fetchSaldoDirect();
    
    if (newSaldo !== null) {
        currentSaldo = newSaldo;
        lastFetchTime = now;
        lastUpdateTime = new Date().toISOString();
        
        // Kirim event update ke script.js
        dispatchSaldoUpdate(newSaldo);
    }
    
    return currentSaldo;
}

/**
 * Mengirim event ke script.js
 * @param {number} saldo - Nilai saldo
 */
function dispatchSaldoUpdate(saldo) {
    const event = new CustomEvent('saldoUpdated', {
        detail: {
            saldo: saldo,
            timestamp: lastUpdateTime,
            source: 'Google Sheets'
        }
    });
    window.dispatchEvent(event);
    console.log(`📢 Event saldoUpdated dikirim: ${saldo}`);
}

/**
 * Membuat URL data untuk script.js
 * @returns {string} URL data
 */
function getDataURL() {
    // Untuk GitHub Pages, kita selalu return URL Google Sheets langsung
    // Script.js akan fetch dari URL ini
    return SHEET_URL;
}

/**
 * Memperbarui data secara periodik
 */
async function updatePeriodically() {
    if (isUpdating) return;
    
    isUpdating = true;
    try {
        await getSaldo();
    } catch (error) {
        console.error("❌ Error update periodik:", error);
    } finally {
        isUpdating = false;
    }
}

/**
 * Inisialisasi sistem
 */
async function init() {
    console.log("🚀 Sistem Balance untuk GitHub Pages dimulai...");
    
    // Load pertama kali
    await getSaldo();
    
    // Setup auto-update
    if (updateTimer) {
        clearInterval(updateTimer);
    }
    
    updateTimer = setInterval(updatePeriodically, UPDATE_INTERVAL);
    console.log(`⏰ Auto-update diatur setiap ${UPDATE_INTERVAL / 60000} menit`);
    
    // Update saat tab aktif kembali
    document.addEventListener('visibilitychange', () => {
        if (!document.hidden) {
            console.log("👁️ Tab aktif, cek update...");
            updatePeriodically();
        }
    });
    
    // Update saat online kembali
    window.addEventListener('online', () => {
        console.log("🌐 Koneksi online, cek update...");
        updatePeriodically();
    });
    
    console.log("✅ Sistem Balance siap!");
}

// ==================== EKSPOR FUNGSI ====================
window.BalanceSystem = {
    init: init,
    refresh: updatePeriodically,
    getCurrentSaldo: () => currentSaldo,
    getLastUpdateTime: () => lastUpdateTime,
    getDataURL: getDataURL,
    
    // Debug functions
    debug: function() {
        return {
            currentSaldo: currentSaldo,
            lastUpdateTime: lastUpdateTime,
            lastFetchTime: new Date(lastFetchTime).toISOString(),
            isUpdating: isUpdating,
            cacheAge: Date.now() - lastFetchTime
        };
    },
    
    // Force refresh
    forceRefresh: function() {
        console.log("🔧 Manual refresh dipaksa");
        lastFetchTime = 0; // Reset cache
        updatePeriodically();
    }
};

// Auto-init
document.addEventListener('DOMContentLoaded', function() {
    setTimeout(init, 500);
});
