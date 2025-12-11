// ==================== KONFIGURASI =====================
const SHEET_URL = "https://docs.google.com/spreadsheets/d/e/2PACX-1vRbLFk69seIMkTsx5xGSLyOHM4Iou1uTQMNNpTnwSoWX5Yu2JBgs71Lbd9OH2Xdgq6GKR0_OiTo9shV/pub?gid=236846195&range=A100:A100&single=true&output=csv";
const UPDATE_INTERVAL = 300000; // 5 menit

// ==================== VARIABEL GLOBAL ====================
let currentSaldo = null;
let lastUpdateTime = null;
let isUpdating = false;
let updateTimer = null;
let isInitialized = false;

// ==================== FUNGSI UTAMA ====================

async function fetchAndProcessSaldo() {
    try {
        console.log("📡 [Balance] Mengambil dari Google Sheets...");
        
        // Cache busting yang lebih kuat
        const timestamp = new Date().getTime();
        const randomParam = Math.random().toString(36).substring(7);
        const response = await fetch(`${SHEET_URL}&_=${timestamp}&rand=${randomParam}`, {
            cache: 'no-store',
            headers: { 
                'Cache-Control': 'no-cache, no-store, must-revalidate',
                'Pragma': 'no-cache',
                'Expires': '0'
            }
        });
        
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        
        const text = await response.text().then(t => t.trim());
        console.log("📄 [Balance] Data mentah:", text);
        
        if (!text || text === '') {
            console.warn("⚠️ [Balance] Data kosong");
            return null;
        }
        
        // PROSES DATA dengan berbagai format
        let cleaned = text;
        
        // 1. Hapus "Rp" jika ada
        cleaned = cleaned.replace(/Rp\s*/gi, '');
        
        // 2. Hapus titik (ribuan separator)
        cleaned = cleaned.replace(/\./g, '');
        
        // 3. Ganti koma dengan titik untuk desimal
        cleaned = cleaned.replace(/,/g, '.');
        
        // 4. Hapus karakter non-numerik kecuali titik dan minus
        cleaned = cleaned.replace(/[^\d.-]/g, '');
        
        console.log("🧹 [Balance] Setelah cleaning:", cleaned);
        
        if (!cleaned || cleaned === '') {
            console.warn("⚠️ [Balance] Data kosong setelah cleaning");
            return null;
        }
        
        const numericValue = parseFloat(cleaned);
        
        if (isNaN(numericValue)) {
            console.error("❌ [Balance] Bukan angka:", cleaned);
            return null;
        }
        
        console.log(`✅ [Balance] Berhasil parse: ${numericValue}`);
        return numericValue;
        
    } catch (error) {
        console.error("❌ [Balance] Error fetch:", error.message);
        return null;
    }
}

async function updateSaldo() {
    if (isUpdating) {
        console.log("⏳ [Balance] Update sudah berjalan, skip...");
        return;
    }
    
    isUpdating = true;
    console.log("🔄 [Balance] Memulai update saldo...");
    
    try {
        const newSaldo = await fetchAndProcessSaldo();
        
        if (newSaldo !== null && newSaldo !== undefined) {
            // Cek apakah ada perubahan
            const hasChanged = currentSaldo !== newSaldo;
            
            // Simpan ke variabel global
            currentSaldo = newSaldo;
            lastUpdateTime = new Date().toISOString();
            
            console.log(`💾 [Balance] Saldo ${hasChanged ? 'BERUBAH' : 'sama'}: ${newSaldo}`);
            
            // KIRIM EVENT ke script.js - SELALU kirim untuk memastikan UI update
            const event = new CustomEvent('balanceUpdated', {
                detail: {
                    saldo: newSaldo,
                    timestamp: lastUpdateTime,
                    formatted: new Intl.NumberFormat('id-ID', {
                        minimumFractionDigits: 0,
                        maximumFractionDigits: 0
                    }).format(newSaldo),
                    changed: hasChanged
                }
            });
            window.dispatchEvent(event);
            console.log("📤 [Balance] Event 'balanceUpdated' dikirim");
            
        } else {
            console.warn("⚠️ [Balance] Gagal mendapatkan saldo baru");
        }
        
    } catch (error) {
        console.error("❌ [Balance] Error dalam update:", error);
    } finally {
        isUpdating = false;
        console.log("✅ [Balance] Update selesai");
    }
}

// ==================== INISIALISASI ====================

async function initialize() {
    if (isInitialized) {
        console.log("ℹ️ [Balance] Sudah diinisialisasi");
        return;
    }
    
    console.log("🚀 [Balance] Inisialisasi sistem...");
    
    try {
        // Tunggu DOM siap
        if (document.readyState !== 'loading') {
            await initBalance();
        } else {
            document.addEventListener('DOMContentLoaded', initBalance);
        }
        
    } catch (error) {
        console.error("❌ [Balance] Error inisialisasi:", error);
    }
}

async function initBalance() {
    console.log("📦 [Balance] DOM siap, mulai setup...");
    
    // 1. Load pertama kali - CRITICAL
    await updateSaldo();
    
    // 2. Setup auto-update setiap 5 menit
    if (updateTimer) {
        clearInterval(updateTimer);
    }
    updateTimer = setInterval(() => {
        console.log("⏰ [Balance] Auto-update triggered");
        updateSaldo();
    }, UPDATE_INTERVAL);
    console.log(`⏰ [Balance] Auto-update diatur setiap ${UPDATE_INTERVAL/60000} menit`);
    
    // 3. Update saat tab aktif kembali
    document.addEventListener('visibilitychange', () => {
        if (!document.hidden) {
            console.log("👁️ [Balance] Tab aktif, refresh data...");
            updateSaldo();
        }
    });
    
    // 4. Update saat koneksi kembali online
    window.addEventListener('online', () => {
        console.log("🌐 [Balance] Koneksi online, refresh data...");
        updateSaldo();
    });
    
    isInitialized = true;
    console.log("✅ [Balance] Sistem siap!");
    
    // Kirim event bahwa balance.js siap
    const readyEvent = new CustomEvent('balanceReady', {
        detail: {
            ready: true,
            timestamp: new Date().toISOString()
        }
    });
    window.dispatchEvent(readyEvent);
}

// ==================== PUBLIC API ====================

window.BalanceSystem = {
    // Status
    isReady: () => isInitialized,
    isUpdating: () => isUpdating,
    
    // Data
    getCurrentSaldo: () => currentSaldo,
    getLastUpdateTime: () => lastUpdateTime,
    
    // Actions
    refresh: async () => {
        console.log("🔄 [Balance] Manual refresh dipanggil");
        await updateSaldo();
    },
    
    forceRefresh: async () => {
        console.log("🔧 [Balance] Force refresh");
        isUpdating = false; // Reset flag
        await updateSaldo();
    },
    
    // Debug
    debug: () => ({
        currentSaldo,
        lastUpdateTime,
        isUpdating,
        isInitialized,
        updateInterval: UPDATE_INTERVAL
    })
};

// ==================== AUTO START ====================
console.log("🎬 [Balance] Script loaded");
setTimeout(() => {
    initialize().catch(error => {
        console.error("❌ [Balance] Initialize failed:", error);
    });
}, 100);
