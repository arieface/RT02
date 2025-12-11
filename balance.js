// ==================== KONFIGURASI =====================
const SHEET_URL = "https://docs.google.com/spreadsheets/d/e/2PACX-1vRbLFk69seIMkTsx5xGSLyOHM4Iou1uTQMNNpTnwSoWX5Yu2JBgs71Lbd9OH2Xdgq6GKR0_OiTo9shV/pub?gid=236846195&range=A100:A100&single=true&output=csv";
const UPDATE_INTERVAL = 5000; // 5 detik

// ==================== VARIABEL GLOBAL ====================
let currentSaldo = null;
let lastUpdateTime = null;
let isUpdating = false;
let updateTimer = null;
let isInitialized = false;
let lastFetchTime = 0;
let consecutiveSameValues = 0;
let lastFetchValue = null;

// ==================== FUNGSI UTAMA ====================

async function fetchAndProcessSaldo() {
    try {
        console.log("📡 [Balance] Mengambil dari Google Sheets...");
        
        // Cache-busting yang lebih agresif dengan timestamp dan random
        const timestamp = new Date().getTime();
        const random = Math.floor(Math.random() * 10000);
        const urlWithCacheBuster = `${SHEET_URL}&_=${timestamp}&rand=${random}`;
        
        // Tambahkan header untuk mencegah cache
        const response = await fetch(urlWithCacheBuster, {
            cache: 'no-store',
            mode: 'cors',
            headers: { 
                'Cache-Control': 'no-cache, no-store, must-revalidate',
                'Pragma': 'no-cache'
            }
        });
        
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        
        const text = await response.text().then(t => t.trim());
        console.log("📄 [Balance] Data mentah:", text);
        
        // PERBAIKAN: Periksa error Google Sheets sebelum proses data
        if (text.includes('#NAME?') || text.includes('#REF!') || text.includes('#VALUE!') || text.includes('#DIV/0!')) {
            console.error("❌ [Balance] Error dari Google Sheets:", text);
            return null;
        }
        
        // PROSES DATA dengan berbagai format
        let cleaned = text;
        
        // 1. Hapus "Rp" jika ada
        cleaned = cleaned.replace(/Rp\s*/i, '');
        
        // 2. Hapus titik (ribuan separator)
        cleaned = cleaned.replace(/\./g, '');
        
        // 3. Ganti koma dengan titik untuk desimal
        cleaned = cleaned.replace(',', '.');
        
        // 4. Hapus karakter non-numerik
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
        
        // Track nilai yang sama berturut-turut
        if (lastFetchValue === numericValue) {
            consecutiveSameValues++;
            console.log(`📊 [Balance] Nilai sama berturut-turut: ${consecutiveSameValues} kali`);
        } else {
            consecutiveSameValues = 0;
            lastFetchValue = numericValue;
        }
        
        lastFetchTime = Date.now();
        console.log(`✅ [Balance] Berhasil: ${numericValue}`);
        return numericValue;
        
    } catch (error) {
        console.error("❌ [Balance] Error fetch:", error.message);
        return null;
    }
}

async function updateSaldo() {
    if (isUpdating) {
        console.log("⏳ [Balance] Update sudah berjalan...");
        return;
    }
    
    isUpdating = true;
    console.log("🔄 [Balance] Memulai update...");
    
    try {
        const newSaldo = await fetchAndProcessSaldo();
        
        // PERBAIKAN: Hanya update jika data valid dan berbeda
        if (newSaldo !== null && newSaldo !== currentSaldo) {
            // Simpan ke variabel global
            currentSaldo = newSaldo;
            lastUpdateTime = new Date().toISOString();
            
            console.log(`💾 [Balance] Saldo disimpan: ${newSaldo}`);
            
            // KIRIM EVENT ke script.js
            const event = new CustomEvent('balanceUpdated', {
                detail: {
                    saldo: newSaldo,
                    timestamp: lastUpdateTime,
                    formatted: new Intl.NumberFormat('id-ID').format(newSaldo)
                }
            });
            window.dispatchEvent(event);
        } else if (newSaldo !== null) {
            console.log(`📊 [Balance] Saldo tidak berubah: ${newSaldo}`);
        } else {
            console.warn("⚠️ [Balance] Gagal mendapatkan saldo baru, menggunakan data yang ada");
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
    
    // 1. Load pertama kali
    await updateSaldo();
    
    // 2. Setup auto-update setiap 5 detik
    updateTimer = setInterval(() => {
        console.log("⏰ [Balance] Interval update terpicu (5 detik)");
        updateSaldo();
    }, UPDATE_INTERVAL);
    console.log(`⏰ [Balance] Auto-update diatur (${UPDATE_INTERVAL/1000} detik)`);
    
    // 3. Update saat tab aktif
    document.addEventListener('visibilitychange', () => {
        if (!document.hidden) {
            console.log("👁️ [Balance] Tab aktif, refresh...");
            updateSaldo();
        }
    });
    
    // 4. Update saat online
    window.addEventListener('online', () => {
        console.log("🌐 [Balance] Online, refresh...");
        updateSaldo();
    });
    
    isInitialized = true;
    console.log("✅ [Balance] Sistem siap!");
    
    // Kirim event bahwa balance.js siap
    const readyEvent = new CustomEvent('balanceReady');
    window.dispatchEvent(readyEvent);
}

// ==================== PUBLIC API ====================

// Ekspor fungsi yang bisa diakses script.js
window.BalanceSystem = {
    // Status
    isReady: () => isInitialized,
    
    // Data
    getCurrentSaldo: () => currentSaldo,
    getLastUpdateTime: () => lastUpdateTime,
    
    // Actions
    refresh: updateSaldo,
    
    // Debug
    debug: () => ({
        currentSaldo,
        lastUpdateTime,
        isUpdating,
        isInitialized,
        lastFetchTime,
        consecutiveSameValues,
        lastFetchValue
    })
};

// ==================== AUTO START ====================
// Tunggu sedikit sebelum mulai
setTimeout(() => {
    initialize().catch(console.error);
}, 100);
