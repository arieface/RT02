// ==================== KONFIGURASI ====================
// URL akan diambil dari balance.js
let DATABASE_URL = null;

// ==================== VARIABEL GLOBAL ====================
let isRefreshing = false;
let retryCount = 0;
const MAX_RETRIES = 3;
let lastSuccessfulFetch = null;
let isOnline = navigator.onLine;
let currentTheme = 'default';
let lastSaldo = 0;

// ==================== FUNGSI UTAMA ====================
async function fetchSaldo() {
    if (isRefreshing) return;
    
    isRefreshing = true;
    updateConnectionStatus('connecting');
    
    try {
        console.log("📡 Mengambil data saldo...");
        showLoadingState();
        
        // Dapatkan URL dari BalanceSystem jika tersedia
        if (!DATABASE_URL && window.BalanceSystem) {
            DATABASE_URL = window.BalanceSystem.getDataURL();
        }
        
        // Fallback ke URL default jika BalanceSystem tidak tersedia
        if (!DATABASE_URL) {
            DATABASE_URL = "https://docs.google.com/spreadsheets/d/e/2PACX-1vRbLFk69seIMkTsx5xGSLyOHM4Iou1uTQMNNpTnwSoWX5Yu2JBgs71Lbd9OH2Xdgq6GKR0_OiTo9shV/pub?gid=236846195&range=A100:A100&single=true&output=csv";
        }
        
        // Coba ambil dari BalanceSystem cache dulu
        if (window.BalanceSystem && window.BalanceSystem.getCurrentSaldo()) {
            const cachedSaldo = window.BalanceSystem.getCurrentSaldo();
            console.log(`📊 Menggunakan cache dari BalanceSystem: ${cachedSaldo}`);
            
            const processedData = processSaldoData(cachedSaldo.toString());
            if (processedData) {
                updateDisplay(processedData);
                return;
            }
        }
        
        // Jika cache tidak ada atau tidak valid, fetch langsung
        console.log("🔄 Fetch data langsung...");
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 10000);
        
        const timestamp = new Date().getTime();
        const response = await fetch(`${DATABASE_URL}&_=${timestamp}`, {
            signal: controller.signal,
            cache: 'no-store',
            headers: {
                'Cache-Control': 'no-cache'
            }
        });
        
        clearTimeout(timeout);
        
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }
        
        const text = await response.text();
        const processedData = processSaldoData(text);
        
        if (processedData) {
            updateDisplay(processedData);
            updateConnectionStatus('online');
            retryCount = 0;
            lastSuccessfulFetch = new Date();
        } else {
            throw new Error('Data tidak valid');
        }
        
    } catch (error) {
        console.error("❌ Error fetch:", error);
        handleFetchError(error);
    } finally {
        setTimeout(() => {
            isRefreshing = false;
        }, 1000);
    }
}

// ==================== FUNGSI BANTUAN ====================

function processSaldoData(rawData) {
    try {
        let cleaned = rawData.trim();
        
        if (!cleaned) return null;
        
        // Format: Rp 1.234.567
        cleaned = cleaned.replace(/Rp\s*/i, '');
        cleaned = cleaned.replace(/\./g, '');
        cleaned = cleaned.replace(',', '.');
        
        if (!/^-?\d*\.?\d*$/.test(cleaned)) return null;
        
        const numericValue = parseFloat(cleaned);
        if (isNaN(numericValue)) return null;
        
        const formatted = new Intl.NumberFormat('id-ID', {
            minimumFractionDigits: 0,
            maximumFractionDigits: 0
        }).format(numericValue);
        
        return {
            raw: rawData,
            numeric: numericValue,
            formatted: formatted
        };
    } catch (error) {
        console.error("❌ Error proses data:", error);
        return null;
    }
}

function updateDisplay(data) {
    const saldoElement = document.getElementById('saldo');
    if (!saldoElement) return;
    
    saldoElement.className = 'amount';
    saldoElement.textContent = data.formatted;
    
    saldoElement.style.transition = 'all 0.5s ease';
    saldoElement.style.transform = 'scale(1.05)';
    saldoElement.style.opacity = '0.8';
    
    setTimeout(() => {
        saldoElement.style.transform = 'scale(1)';
        saldoElement.style.opacity = '1';
    }, 300);
    
    updateThemeBasedOnSaldo(data.numeric);
    lastSaldo = data.numeric;
    updateTime();
}

function handleFetchError(error) {
    if (error.name === 'AbortError') {
        updateConnectionStatus('timeout');
        showError('Coba lagi - server lambat');
    } else if (!navigator.onLine) {
        updateConnectionStatus('offline');
        showError('Offline - cek koneksi');
    } else {
        updateConnectionStatus('error');
        showError('Gagal mengambil data');
    }
    
    // Retry logic
    if (retryCount < MAX_RETRIES) {
        retryCount++;
        console.log(`🔄 Retry ${retryCount}/${MAX_RETRIES} dalam 3 detik...`);
        setTimeout(fetchSaldo, 3000);
    }
}

function updateThemeBasedOnSaldo(saldo) {
    let newTheme = 'default';
    
    if (saldo < 500000) newTheme = 'red';
    else if (saldo >= 500000 && saldo < 1000000) newTheme = 'yellow-orange';
    else if (saldo >= 1000000) newTheme = 'teal';
    
    if (newTheme !== currentTheme) {
        currentTheme = newTheme;
        document.body.setAttribute('data-theme', currentTheme);
        console.log(`🎨 Theme: ${currentTheme} (Saldo: ${saldo})`);
    }
}

// ==================== EVENT LISTENER ====================

// Listen untuk update dari balance.js
window.addEventListener('saldoUpdated', function(event) {
    console.log("📢 Event diterima dari balance.js:", event.detail);
    
    if (event.detail && event.detail.saldo) {
        const processedData = {
            raw: event.detail.saldo.toString(),
            numeric: event.detail.saldo,
            formatted: new Intl.NumberFormat('id-ID', {
                minimumFractionDigits: 0,
                maximumFractionDigits: 0
            }).format(event.detail.saldo)
        };
        
        updateDisplay(processedData);
        updateConnectionStatus('online');
        
        // Update waktu di footer
        if (event.detail.timestamp) {
            const timeElement = document.getElementById('waktu');
            if (timeElement) {
                const updateTime = new Date(event.detail.timestamp);
                const now = new Date();
                const diffMs = now - updateTime;
                const diffMins = Math.floor(diffMs / 60000);
                
                let timeText = 'Baru saja';
                if (diffMins > 0) {
                    timeText = `${diffMins} menit yang lalu`;
                }
                
                // Update tooltip
                timeElement.title = `Diperbarui: ${updateTime.toLocaleString('id-ID')}`;
                console.log(`⏰ Data diperbarui ${timeText}`);
            }
        }
    }
});

// ==================== INISIALISASI ====================
document.addEventListener('DOMContentLoaded', function() {
    console.log("🚀 Aplikasi Kas RT02-RW18 (GitHub Version) dimulai...");
    
    // Setup awal
    document.body.setAttribute('data-theme', 'default');
    updateStatsDisplay();
    checkConnection();
    
    // Event listeners
    window.addEventListener('online', checkConnection);
    window.addEventListener('offline', checkConnection);
    
    // Tunggu balance.js siap
    const initInterval = setInterval(() => {
        if (window.BalanceSystem && window.BalanceSystem.getDataURL) {
            clearInterval(initInterval);
            
            // Dapatkan URL dari balance.js
            DATABASE_URL = window.BalanceSystem.getDataURL();
            console.log("🔗 URL diatur:", DATABASE_URL);
            
            // Fetch data pertama
            setTimeout(fetchSaldo, 1000);
        }
    }, 100);
    
    // Update waktu
    updateTime();
    setInterval(updateTime, 1000);
    
    // Auto-refresh
    setInterval(() => {
        if (isOnline && window.BalanceSystem) {
            window.BalanceSystem.refresh();
        }
    }, 300000);
    
    // Cek koneksi berkala
    setInterval(checkConnection, 30000);
});

// ==================== FUNGSI UI (tetap sama) ====================
function showLoadingState() {
    const saldoElement = document.getElementById('saldo');
    const statusElement = document.getElementById('connection-status');
    
    if (saldoElement) {
        saldoElement.innerHTML = `
            <div class="loading-dots-container">
                <span></span><span></span><span></span>
            </div>
        `;
        saldoElement.className = 'amount';
    }
    
    if (statusElement) {
        statusElement.innerHTML = '<i class="fas fa-sync-alt fa-spin"></i> <span>Mengambil data...</span>';
    }
}

function updateConnectionStatus(status) {
    const signalElement = document.getElementById('connection-signal');
    const signalText = document.getElementById('signal-text');
    const statusElement = document.getElementById('connection-status');
    
    if (!signalElement || !signalText || !statusElement) return;
    
    signalElement.className = 'connection-signal';
    statusElement.className = 'connection-status';
    
    switch(status) {
        case 'online':
            signalElement.classList.add('online');
            signalText.textContent = 'Online';
            statusElement.innerHTML = '<i class="fas fa-circle" style="color:#10b981"></i> <span>Terhubung • Data real-time</span>';
            statusElement.classList.add('online');
            break;
        case 'connecting':
            signalText.textContent = 'Menghubungkan...';
            statusElement.innerHTML = '<i class="fas fa-circle" style="color:#f59e0b"></i> <span>Menyambungkan...</span>';
            break;
        case 'timeout':
            signalElement.classList.add('offline');
            signalText.textContent = 'Timeout';
            statusElement.innerHTML = '<i class="fas fa-circle" style="color:#f59e0b"></i> <span>Server lambat • Mencoba lagi...</span>';
            statusElement.classList.add('offline');
            break;
        case 'offline':
            signalElement.classList.add('offline');
            signalText.textContent = 'Offline';
            statusElement.innerHTML = '<i class="fas fa-circle" style="color:#ef4444"></i> <span>Server offline</span>';
            statusElement.classList.add('offline');
            break;
        case 'error':
            signalElement.classList.add('offline');
            signalText.textContent = 'Error';
            statusElement.innerHTML = '<i class="fas fa-circle" style="color:#ef4444"></i> <span>Offline • Menyambungkan...</span>';
            statusElement.classList.add('offline');
            break;
    }
}

function showError(message) {
    const saldoElement = document.getElementById('saldo');
    if (!saldoElement) return;
    
    saldoElement.textContent = message;
    saldoElement.className = 'amount error';
}

function updateTime() {
    const now = new Date();
    const gmt7Time = new Date(now.toLocaleString("en-US", {timeZone: "Asia/Jakarta"}));
    
    const hari = gmt7Time.getDate();
    const bulanIndex = gmt7Time.getMonth();
    const tahun = gmt7Time.getFullYear();
    const jam = String(gmt7Time.getHours()).padStart(2, '0');
    const menit = String(gmt7Time.getMinutes()).padStart(2, '0');
    const detik = String(gmt7Time.getSeconds()).padStart(2, '0');
    
    const namaHari = ["Minggu", "Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu"];
    const namaBulan = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];
    
    const timeString = `${namaHari[gmt7Time.getDay()]}, ${hari} ${namaBulan[bulanIndex]} ${tahun} • ${jam}:${menit}:${detik} WIB`;
    
    const waktuElement = document.getElementById('waktu');
    if (waktuElement) {
        waktuElement.textContent = timeString;
    }
}

function checkConnection() {
    isOnline = navigator.onLine;
    
    if (isOnline) {
        updateConnectionStatus('online');
        if (!lastSuccessfulFetch || (Date.now() - lastSuccessfulFetch) > 300000) {
            fetchSaldo();
        }
    } else {
        updateConnectionStatus('offline');
        showError('Offline - cek koneksi');
    }
}

function updateStatsDisplay() {
    const statItems = document.querySelectorAll('.stat-item');
    if (statItems.length >= 2) {
        const timeStat = statItems[1];
        const statValue = timeStat.querySelector('.stat-value');
        const statLabel = timeStat.querySelector('.stat-label');
        
        if (statValue && statLabel) {
            statValue.textContent = '24 Jam';
            statLabel.textContent = 'Akses';
        }
    }
}
