// ==================== KONFIGURASI =====================
const SHEET_URL = "https://docs.google.com/spreadsheets/d/e/2PACX-1vRbLFk69seIMkTsx5xGSLyOHM4Iou1uTQMNNpTnwSoWX5Yu2JBgs71Lbd9OH2Xdgq6GKR0_OiTo9shV/pub?gid=236846195&range=A100:A100&single=true&output=csv";
const UPDATE_INTERVAL = 60000; // 1 menit

// ==================== VARIABEL GLOBAL ====================
let currentSaldo = null;
let lastUpdateTime = null;
let isUpdating = false;
let updateTimer = null;
let isInitialized = false;
let consecutiveSameValueCount = 0; // Track nilai yang sama berturut-turut
let lastFetchedValue = null; // Track nilai terakhir yang di-fetch

// ==================== FUNGSI UTAMA ====================

async function fetchAndProcessSaldo() {
    try {
        console.log("📡 [Balance] Mengambil dari Google Sheets...");
        
        // Gunakan timestamp yang lebih random untuk bypass cache
        const timestamp = Date.now() + Math.random().toString(36).substring(7);
        const response = await fetch(`${SHEET_URL}&_=${timestamp}`, {
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
        
        if (newSaldo !== null) {
            // DETEKSI CACHE ISSUE
            // Jika nilai yang sama terus muncul setelah perubahan, kemungkinan cache
            if (lastFetchedValue !== null && newSaldo === lastFetchedValue) {
                consecutiveSameValueCount++;
                console.log(`🔁 [Balance] Nilai sama ke-${consecutiveSameValueCount}: ${newSaldo}`);
                
                // Jika nilai sama muncul 2x berturut-turut setelah ada perubahan sebelumnya
                // Skip update untuk menghindari overwrite data yang benar
                if (consecutiveSameValueCount >= 2 && currentSaldo !== null && currentSaldo !== newSaldo) {
                    console.warn(`⚠️ [Balance] Kemungkinan cache terdeteksi! Skip update.`);
                    console.log(`   Current: ${currentSaldo}, Fetched: ${newSaldo}`);
                    return;
                }
            } else {
                // Nilai berubah, reset counter
                consecutiveSameValueCount = 0;
            }
            
            lastFetchedValue = newSaldo;
            
            // Cek apakah nilai benar-benar berubah
            const isValueChanged = currentSaldo !== newSaldo;
            
            if (isValueChanged || currentSaldo === null) {
                // Simpan ke variabel global
                currentSaldo = newSaldo;
                lastUpdateTime = new Date().toISOString();
                
                console.log(`💾 [Balance] Saldo ${currentSaldo === null ? 'diinisialisasi' : 'diupdate'}: ${newSaldo}`);
                
                // KIRIM EVENT ke script.js
                const event = new CustomEvent('balanceUpdated', {
                    detail: {
                        saldo: newSaldo,
                        timestamp: lastUpdateTime,
                        formatted: new Intl.NumberFormat('id-ID').format(newSaldo),
                        isChanged: isValueChanged
                    }
                });
                window.dispatchEvent(event);
                
            } else {
                console.log(`ℹ️ [Balance] Saldo tidak berubah: ${newSaldo}`);
            }
            
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
    
    // 1. Load pertama kali
    await updateSaldo();
    
    // 2. Setup auto-update setiap 1 menit
    updateTimer = setInterval(updateSaldo, UPDATE_INTERVAL);
    console.log(`⏰ [Balance] Auto-update diatur (${UPDATE_INTERVAL/60000} menit)`);
    
    // 3. Update saat tab aktif (dengan delay untuk menghindari race condition)
    document.addEventListener('visibilitychange', () => {
        if (!document.hidden) {
            console.log("👁️ [Balance] Tab aktif, refresh dalam 2 detik...");
            setTimeout(() => {
                updateSaldo();
            }, 2000); // Delay 2 detik
        }
    });
    
    // 4. Update saat online (dengan delay)
    window.addEventListener('online', () => {
        console.log("🌐 [Balance] Online, refresh dalam 2 detik...");
        setTimeout(() => {
            updateSaldo();
        }, 2000);
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
    forceRefresh: () => {
        console.log("🔧 [Balance] Manual refresh (reset cache detection)");
        consecutiveSameValueCount = 0; // Reset detection
        lastFetchedValue = null;
        updateSaldo();
    },
    
    // Debug
    debug: () => ({
        currentSaldo,
        lastUpdateTime,
        isUpdating,
        isInitialized,
        consecutiveSameValueCount,
        lastFetchedValue
    })
};

// ==================== AUTO START ====================
// Tunggu sedikit sebelum mulai
setTimeout(() => {
    initialize().catch(console.error);
}, 100);