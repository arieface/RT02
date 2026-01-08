// ==================== KONFIGURASI =====================
const SHEET_URL = "https://docs.google.com/spreadsheets/d/e/2PACX-1vRbLFk69seIMkTsx5xGSLyOHM4Iou1uTQMNNpTnwSoWX5Yu2JBgs71Lbd9OH2Xdgq6GKR0_OiTo9shV/pub?gid=236846195&range=A100:A100&single=true&output=csv";
const SHEET_URL_SOCIAL = "https://docs.google.com/spreadsheets/d/e/2PACX-1vTmrowEj1HMbNBtcfJOhUvDarDXuHf-suUPxtKmxMPlXe89kNXyRBsbSpotX4sNQ14bJngsjVnDgiho/pub?gid=0&single=true&output=csv";
const SHEET_URL_DEVELOPMENT = "https://docs.google.com/spreadsheets/d/e/2PACX-1vS_4KvXeJwe9h6neHrbJpcMerGlWfGqnBmnV-8vT_JYNXQCVpuLD01qJ8tfXvTZJx6RK0qtQ_znWpto/pub?gid=0&single=true&output=csv";
const SHEET_URL_LIGHTING = "https://docs.google.com/spreadsheets/d/e/2PACX-1vR1ZZW3_kvfwtucZLvmWiRTpAxHZcvdXeCwdgxzX5ndi5MRN84PqHv4OPm7fNx2N7qoDmqWEhkBMTTu/pub?gid=0&single=true&output=csv"; // URL Baru

const UPDATE_INTERVAL = 60000; // 1 menit
const STABILITY_CHECK_COUNT = 3; // 3x fetch per attempt
const STABILITY_CHECK_DELAY = 1500; // Delay antar check (1.5 detik)
const MAX_STABILITY_ATTEMPTS = 5; // Maksimal berapa kali coba sampai dapat data stabil
const RETRY_DELAY = 2000; // Delay sebelum retry (2 detik)

// ==================== VARIABEL GLOBAL ====================
let currentSaldo = null;
let lastUpdateTime = null;
let isUpdating = false;
let updateTimer = null;
let isInitialized = false;
let fetchAttempts = 0;

// Variabel untuk Dana Sosial
let currentDanaSosial = null;
let lastUpdateDanaSosial = null;
let isUpdatingSosial = false;
let updateTimerSosial = null;

// Variabel untuk Dana Pembangunan
let currentDanaPembangunan = null;
let lastUpdateDanaPembangunan = null;
let isUpdatingPembangunan = false;
let updateTimerPembangunan = null;

// Variabel untuk Data Lampu (Jumlah & Stok)
let currentLampuData = null; // Akan menyimpan object { jumlah: 0, stok: 0 }
let isUpdatingLampu = false;
let updateTimerLampu = null;

// ==================== FUNGSI UTAMA (SALDO UTAMA) ====================

async function fetchAndProcessSaldo() {
    try {
        fetchAttempts++;
        console.log(`📡 [Balance] Mengambil dari Google Sheets... (Attempt #${fetchAttempts})`);
        
        const timestamp = Date.now() + Math.random().toString(36).substring(7);
        
        const response = await fetch(`${SHEET_URL}&_=${timestamp}`, {
            cache: 'no-store',
            headers: { 
                'Cache-Control': 'no-cache'
            }
        });
        
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        
        const text = await response.text().then(t => t.trim());
        console.log("📄 [Balance] Data mentah:", text);
        
        // PROSES DATA
        let cleaned = text;
        cleaned = cleaned.replace(/Rp\s*/i, '');
        cleaned = cleaned.replace(/\./g, '');
        cleaned = cleaned.replace(',', '.');
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

// FUNGSI: Verifikasi stabilitas data dengan multiple fetch
async function fetchWithStabilityCheck() {
    console.log(`🔍 [Balance] Memulai stability check (${STABILITY_CHECK_COUNT}x)...`);
    
    const values = [];
    
    // Fetch beberapa kali dengan delay
    for (let i = 0; i < STABILITY_CHECK_COUNT; i++) {
        if (i > 0) {
            console.log(`⏳ [Balance] Menunggu ${STABILITY_CHECK_DELAY/1000}s sebelum check ke-${i + 1}...`);
            await new Promise(resolve => setTimeout(resolve, STABILITY_CHECK_DELAY));
        }
        
        const value = await fetchAndProcessSaldo();
        if (value !== null) {
            values.push(value);
            console.log(`📊 [Balance] Check ${i + 1}/${STABILITY_CHECK_COUNT}: ${value}`);
        }
    }
    
    if (values.length === 0) {
        console.error("❌ [Balance] Semua fetch gagal");
        return { stable: false, value: null, values: [] };
    }
    
    // Cek apakah semua nilai sama (DATA STABIL)
    const allSame = values.every(v => v === values[0]);
    
    if (allSame) {
        console.log(`✅ [Balance] Data stabil! Nilai konsisten: ${values[0]}`);
        return { stable: true, value: values[0], values };
    } else {
        console.warn(`⚠️ [Balance] Data tidak stabil! Values: [${values.join(', ')}]`);
        return { stable: false, value: null, values };
    }
}

// FUNGSI BARU: Tunggu sampai data stabil
async function waitForStableData() {
    console.log(`🎯 [Balance] Menunggu data stabil (max ${MAX_STABILITY_ATTEMPTS} attempts)...`);
    
    for (let attempt = 1; attempt <= MAX_STABILITY_ATTEMPTS; attempt++) {
        console.log(`🔄 [Balance] Stability attempt ${attempt}/${MAX_STABILITY_ATTEMPTS}`);
        
        const result = await fetchWithStabilityCheck();
        
        if (result.stable) {
            console.log(`🎉 [Balance] Data stabil ditemukan pada attempt ke-${attempt}!`);
            return result.value;
        }
        
        // Jika belum stabil dan masih ada attempt tersisa
        if (attempt < MAX_STABILITY_ATTEMPTS) {
            console.log(`⏸️ [Balance] Retry dalam ${RETRY_DELAY/1000}s...`);
            await new Promise(resolve => setTimeout(resolve, RETRY_DELAY));
        }
    }
    
    // Jika setelah semua attempt masih tidak stabil, gunakan fallback
    console.warn(`⚠️ [Balance] Tidak dapat menemukan data stabil setelah ${MAX_STABILITY_ATTEMPTS} attempts`);
    console.log(`🔧 [Balance] Fallback: Menggunakan single fetch...`);
    
    return await fetchAndProcessSaldo();
}

async function updateSaldo() {
    if (isUpdating) {
        console.log("⏳ [Balance] Update sudah berjalan...");
        return;
    }
    
    isUpdating = true;
    console.log("🔄 [Balance] Memulai update...");
    
    try {
        // TUNGGU sampai data stabil
        const newSaldo = await waitForStableData();
        
        if (newSaldo !== null) {
            // Cek apakah nilai benar-benar berubah
            const isValueChanged = currentSaldo !== newSaldo;
            
            if (isValueChanged || currentSaldo === null) {
                const previousSaldo = currentSaldo;
                currentSaldo = newSaldo;
                lastUpdateTime = new Date().toISOString();
                
                console.log(`💾 [Balance] Saldo ${previousSaldo === null ? 'diinisialisasi' : 'diupdate'}: ${previousSaldo} → ${newSaldo}`);
                
                // KIRIM EVENT ke script.js
                const event = new CustomEvent('balanceUpdated', {
                    detail: {
                        saldo: newSaldo,
                        previousSaldo: previousSaldo,
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

// ==================== FUNGSI TAMBAHAN (DANA SOSIAL & PEMBANGUNAN) ====================
// Logika diambil dan disesuaikan dari fungsi utama agar memiliki stabilitas yang sama

// Helper untuk fetch generic dana
async function fetchAndProcessFund(url, fundName) {
    try {
        console.log(`📡 [${fundName}] Mengambil data...`);
        const timestamp = Date.now() + Math.random().toString(36).substring(7);
        const response = await fetch(`${url}&_=${timestamp}`, {
            cache: 'no-store',
            headers: { 'Cache-Control': 'no-cache' }
        });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        
        // PERBAIKAN: Gunakan .then(text => text.trim()) agar .trim() berfungsi
        const text = await response.text().then(t => t.trim());
        
        // Cleaning data sama seperti saldo utama
        let cleaned = text.replace(/Rp\s*/i, '').replace(/\./g, '').replace(',', '.').replace(/[^\d.-]/g, '');
        
        if (!cleaned) return null;
        const val = parseFloat(cleaned);
        return isNaN(val) ? null : val;
    } catch (error) {
        console.error(`❌ [${fundName}] Error:`, error.message);
        return null;
    }
}

// Helper stability check generic
async function waitForStableFund(url, fundName, eventName) {
    console.log(`🎯 [${fundName}] Menunggu data stabil...`);
    let finalValue = null;

    for (let attempt = 1; attempt <= MAX_STABILITY_ATTEMPTS; attempt++) {
        const values = [];
        for (let i = 0; i < STABILITY_CHECK_COUNT; i++) {
            if (i > 0) await new Promise(r => setTimeout(r, STABILITY_CHECK_DELAY));
            const val = await fetchAndProcessFund(url, fundName);
            if (val !== null) values.push(val);
        }

        if (values.length > 0 && values.every(v => v === values[0])) {
            finalValue = values[0];
            console.log(`✅ [${fundName}] Stabil: ${finalValue}`);
            break;
        }
        if (attempt < MAX_STABILITY_ATTEMPTS) {
            await new Promise(r => setTimeout(r, RETRY_DELAY));
        }
    }

    if (finalValue === null) {
        // Fallback single fetch
        finalValue = await fetchAndProcessFund(url, fundName);
    }

    if (finalValue !== null) {
        window.dispatchEvent(new CustomEvent(eventName, {
            detail: {
                value: finalValue,
                formatted: new Intl.NumberFormat('id-ID').format(finalValue)
            }
        }));
    }
}

// Update Dana Sosial
async function updateDanaSosial() {
    if (isUpdatingSosial) return;
    isUpdatingSosial = true;
    await waitForStableFund(SHEET_URL_SOCIAL, "DanaSosial", "socialFundUpdated");
    isUpdatingSosial = false;
}

// Update Dana Pembangunan
async function updateDanaPembangunan() {
    if (isUpdatingPembangunan) return;
    isUpdatingPembangunan = true;
    await waitForStableFund(SHEET_URL_DEVELOPMENT, "DanaPembangunan", "devFundUpdated");
    isUpdatingPembangunan = false;
}

// ==================== FUNGSI BARU (DATA LAMPU) ====================
// Mengambil data CSV, misal: "50,10" (Jumlah, Stok)
async function fetchAndProcessLighting() {
    try {
        console.log(`📡 [Lighting] Mengambil data...`);
        const timestamp = Date.now() + Math.random().toString(36).substring(7);
        const response = await fetch(`${SHEET_URL_LIGHTING}&_=${timestamp}`, {
            cache: 'no-store',
            headers: { 'Cache-Control': 'no-cache' }
        });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        
        const text = await response.text().then(t => t.trim());
        console.log("📄 [Lighting] Data mentah:", text);
        
        // Proses CSV (bisa dipisah koma atau baris baru)
        // Ganti koma dengan spasi lalu split untuk handle koma atau newline
        let cleanText = text.replace(/,/g, ' ').replace(/\n/g, ' ');
        let parts = cleanText.split(/\s+/).filter(part => part !== '');
        
        // Ambil 2 angka pertama yang valid
        let numbers = parts.map(p => parseFloat(p)).filter(n => !isNaN(n));
        
        if (numbers.length >= 2) {
            return { jumlah: numbers[0], stok: numbers[1] };
        } else if (numbers.length === 1) {
            // Jika cuma 1 angka, asumsikan itu jumlah, stok 0 atau sama
            return { jumlah: numbers[0], stok: 0 };
        }
        
        return null;
    } catch (error) {
        console.error(`❌ [Lighting] Error:`, error.message);
        return null;
    }
}

async function waitForStableLighting() {
    console.log(`🎯 [Lighting] Menunggu data stabil...`);
    let finalData = null;

    for (let attempt = 1; attempt <= MAX_STABILITY_ATTEMPTS; attempt++) {
        const values = [];
        for (let i = 0; i < STABILITY_CHECK_COUNT; i++) {
            if (i > 0) await new Promise(r => setTimeout(r, STABILITY_CHECK_DELAY));
            const val = await fetchAndProcessLighting();
            if (val !== null) values.push(val);
        }

        // Cek kesamaan string JSON object untuk membandingkan
        if (values.length > 0 && values.every(v => JSON.stringify(v) === JSON.stringify(values[0]))) {
            finalData = values[0];
            console.log(`✅ [Lighting] Stabil:`, finalData);
            break;
        }
        if (attempt < MAX_STABILITY_ATTEMPTS) {
            await new Promise(r => setTimeout(r, RETRY_DELAY));
        }
    }

    if (finalData === null) {
        finalData = await fetchAndProcessLighting();
    }

    if (finalData !== null) {
        window.dispatchEvent(new CustomEvent('lightingUpdated', {
            detail: finalData
        }));
    }
}

async function updateLampu() {
    if (isUpdatingLampu) return;
    isUpdatingLampu = true;
    await waitForStableLighting();
    isUpdatingLampu = false;
}


// ==================== INISIALISASI ====================

async function initialize() {
    if (isInitialized) {
        console.log("ℹ️ [Balance] Sudah diinisialisasi");
        return;
    }
    
    console.log("🚀 [Balance] Inisialisasi sistem...");
    
    try {
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
    
    // 1. Load pertama kali (Saldo Utama)
    await updateSaldo();
    // Load dana lain
    updateDanaSosial();
    updateDanaPembangunan();
    // Load data lampu
    updateLampu();
    
    // 2. Setup auto-update setiap 1 menit
    updateTimer = setInterval(updateSaldo, UPDATE_INTERVAL);
    updateTimerSosial = setInterval(updateDanaSosial, UPDATE_INTERVAL);
    updateTimerPembangunan = setInterval(updateDanaPembangunan, UPDATE_INTERVAL);
    updateTimerLampu = setInterval(updateLampu, UPDATE_INTERVAL);
    console.log(`⏰ [Balance] Auto-update diatur (${UPDATE_INTERVAL/60000} menit)`);
    
    // 4. Update saat online
    window.addEventListener('online', () => {
        console.log("🌐 [Balance] Online, refresh dalam 5 detik...");
        setTimeout(() => {
            updateSaldo();
            updateDanaSosial();
            updateDanaPembangunan();
            updateLampu();
        }, 5000);
    });
    
    isInitialized = true;
    console.log("✅ [Balance] Sistem siap!");
    
    const readyEvent = new CustomEvent('balanceReady');
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
    refresh: updateSaldo,
    forceRefresh: () => {
        console.log("🔧 [Balance] Manual refresh");
        updateSaldo();
        updateDanaSosial();
        updateDanaPembangunan();
        updateLampu();
    },
    
    // Reset system
    reset: () => {
        console.log("🔄 [Balance] Reset sistem...");
        currentSaldo = null;
        lastUpdateTime = null;
        fetchAttempts = 0;
        console.log("✅ [Balance] Reset selesai");
    },
    
    // Debug
    debug: () => {
        const debugInfo = {
            currentSaldo,
            lastUpdateTime,
            isUpdating,
            isInitialized,
            fetchAttempts,
            updateInterval: `${UPDATE_INTERVAL/1000}s`,
            stabilityChecks: STABILITY_CHECK_COUNT,
            stabilityDelay: `${STABILITY_CHECK_DELAY/1000}s`,
            maxAttempts: MAX_STABILITY_ATTEMPTS,
            retryDelay: `${RETRY_DELAY/1000}s`
        };
        console.table(debugInfo);
        return debugInfo;
    },
    
    // Manual fetch untuk testing
    manualFetch: async () => {
        console.log("🧪 [Balance] Manual single fetch...");
        const result = await fetchAndProcessSaldo();
        console.log("🧪 [Balance] Hasil:", result);
        return result;
    },
    
    // Test stability check
    testStability: async () => {
        console.log("🧪 [Balance] Testing stability check...");
        const result = await fetchWithStabilityCheck();
        console.log("🧪 [Balance] Hasil:", result);
        return result;
    },
    
    // Test wait for stable data
    testWaitStable: async () => {
        console.log("🧪 [Balance] Testing wait for stable data...");
        const result = await waitForStableData();
        console.log("🧪 [Balance] Hasil:", result);
        return result;
    }
};

// ==================== AUTO START ====================
setTimeout(() => {
    initialize().catch(console.error);
}, 100);