// ==================== KONFIGURASI ====================
const DATA_FILE = "balance.json";  // File data utama
const GOOGLE_SHEETS_URL = "https://docs.google.com/spreadsheets/d/e/2PACX-1vRbLFk69seIMkTsx5xGSLyOHM4Iou1uTQMNNpTnwSoWX5Yu2JBgs71Lbd9OH2Xdgq6GKR0_OiTo9shV/pub?gid=236846195&range=A100:A100&single=true&output=csv";

// ==================== VARIABEL GLOBAL ====================
let currentTheme = 'default';
let lastSaldo = 0;
let isLoading = false;
let retryCount = 0;
const MAX_RETRIES = 3;

// ==================== FUNGSI UTAMA ====================
async function fetchSaldo() {
    if (isLoading) return;
    
    isLoading = true;
    updateConnectionStatus('connecting');
    
    try {
        console.log("📁 Mengambil data dari balance.json...");
        
        // Tampilkan loading state
        showLoadingState();
        
        // Ambil data dari file lokal (INSTANT!)
        const response = await fetch(`${DATA_FILE}?_=${Date.now()}`);
        
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }
        
        const result = await response.json();
        
        if (!result.success) {
            throw new Error('Data tidak valid');
        }
        
        console.log("✅ Data dari cache:", result.data);
        
        // Update tampilan
        updateSaldoDisplay(result.data);
        updateThemeBasedOnSaldo(result.data.numeric);
        lastSaldo = result.data.numeric;
        
        // Update status
        updateConnectionStatus('online');
        
        // Reset retry count
        retryCount = 0;
        
        // Update waktu
        updateTime();
        
    } catch (error) {
        console.error("❌ Error baca file:", error);
        
        // Fallback langsung ke Google Sheets
        if (retryCount < MAX_RETRIES) {
            retryCount++;
            console.log(`🔄 Retry ${retryCount}/${MAX_RETRIES}: Fallback ke Google Sheets...`);
            await fetchDirectFromSheets();
        } else {
            showErrorState('Data tidak tersedia');
            updateConnectionStatus('offline');
        }
        
    } finally {
        setTimeout(() => {
            isLoading = false;
        }, 1000);
    }
}

// ==================== FALLBACK KE GOOGLE SHEETS ====================
async function fetchDirectFromSheets() {
    try {
        console.log("🌐 Ambil langsung dari Google Sheets...");
        
        const response = await fetch(`${GOOGLE_SHEETS_URL}&_=${Date.now()}`, {
            cache: 'no-store',
            headers: {
                'Cache-Control': 'no-cache'
            }
        });
        
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }
        
        const text = await response.text();
        const processedData = processSaldoData(text);
        
        // Update tampilan
        updateSaldoDisplay(processedData);
        updateThemeBasedOnSaldo(processedData.numeric);
        
        // Update status
        document.getElementById('connection-status').innerHTML = 
            '<i class="fas fa-circle" style="color:#f59e0b"></i> ' +
            '<span>Online • Direct connection</span>';
            
        console.log("✅ Data dari Google Sheets:", processedData);
        
    } catch (error) {
        console.error("❌ Fallback juga gagal:", error);
        throw error;
    }
}

// ==================== PROSES DATA ====================
function processSaldoData(rawData) {
    console.log("🔧 Memproses data...");
    
    let cleaned = rawData.trim();
    
    // Validasi data kosong
    if (!cleaned) {
        throw new Error('Data kosong');
    }
    
    // Bersihkan format Rupiah
    cleaned = cleaned.replace(/Rp\s*/i, '');
    cleaned = cleaned.replace(/\./g, '');
    
    // Handle koma
    if (cleaned.includes(',')) {
        // Jika koma sebagai pemisah ribuan (format Eropa)
        if (cleaned.match(/\d{1,3}(,\d{3})*(\.\d+)?$/)) {
            cleaned = cleaned.replace(/,/g, '');
        } else {
            // Jika koma sebagai pemisah desimal
            cleaned = cleaned.replace(',', '.');
        }
    }
    
    // Validasi numeric
    if (!/^-?\d*\.?\d*$/.test(cleaned)) {
        throw new Error(`Format data tidak valid: ${cleaned}`);
    }
    
    const numericValue = parseFloat(cleaned);
    
    if (isNaN(numericValue)) {
        throw new Error(`Tidak bisa konversi ke angka: ${cleaned}`);
    }
    
    // Format ke Rupiah Indonesia
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

// ==================== UPDATE TAMPILAN ====================
function updateSaldoDisplay(data) {
    const saldoElement = document.getElementById('saldo');
    if (!saldoElement) return;
    
    // Reset class
    saldoElement.className = 'amount';
    
    // Update text
    saldoElement.textContent = data.formatted;
    
    // Animation effect
    saldoElement.style.transition = 'all 0.5s ease';
    saldoElement.style.transform = 'scale(1.05)';
    saldoElement.style.opacity = '0.8';
    
    setTimeout(() => {
        saldoElement.style.transform = 'scale(1)';
        saldoElement.style.opacity = '1';
    }, 300);
}

// ==================== UPDATE THEME ====================
function updateThemeBasedOnSaldo(saldo) {
    let newTheme = 'default';
    
    if (saldo < 500000) {
        newTheme = 'red';
    } else if (saldo >= 500000 && saldo < 1000000) {
        newTheme = 'yellow-orange';
    } else if (saldo >= 1000000) {
        newTheme = 'teal';
    }
    
    // Hanya ubah theme jika berbeda
    if (newTheme !== currentTheme) {
        currentTheme = newTheme;
        document.body.setAttribute('data-theme', currentTheme);
        console.log(`🎨 Theme berubah ke: ${currentTheme} (Saldo: ${saldo})`);
    }
}

// ==================== LOADING STATE ====================
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

// ==================== ERROR STATE ====================
function showErrorState(message) {
    const saldoElement = document.getElementById('saldo');
    if (!saldoElement) return;
    
    saldoElement.textContent = message;
    saldoElement.className = 'amount error';
}

// ==================== UPDATE CONNECTION STATUS ====================
function updateConnectionStatus(status) {
    const signalElement = document.getElementById('connection-signal');
    const signalText = document.getElementById('signal-text');
    const statusElement = document.getElementById('connection-status');
    
    if (!signalElement || !signalText || !statusElement) return;
    
    // Reset class
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
            
        case 'offline':
            signalElement.classList.add('offline');
            signalText.textContent = 'Offline';
            statusElement.innerHTML = '<i class="fas fa-circle" style="color:#ef4444"></i> <span>Server offline</span>';
            statusElement.classList.add('offline');
            break;
    }
}

// ==================== UPDATE TIME ====================
function updateTime() {
    const now = new Date();
    const gmt7Time = new Date(now.toLocaleString("en-US", {timeZone: "Asia/Jakarta"}));

    // Format hari
    const hari = gmt7Time.getDate();
    const bulanIndex = gmt7Time.getMonth();
    const tahun = gmt7Time.getFullYear();
    
    // Format waktu
    const jam = String(gmt7Time.getHours()).padStart(2, '0');
    const menit = String(gmt7Time.getMinutes()).padStart(2, '0');
    const detik = String(gmt7Time.getSeconds()).padStart(2, '0');
    
    // Nama hari dalam bahasa Indonesia
    const namaHari = ["Minggu", "Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu"];
    const namaHariSekarang = namaHari[gmt7Time.getDay()];
    
    // Nama bulan dalam bahasa Indonesia
    const namaBulan = [
        "Januari", "Februari", "Maret", "April", 
        "Mei", "Juni", "Juli", "Agustus", 
        "September", "Oktober", "November", "Desember"
    ];
    const namaBulanSekarang = namaBulan[bulanIndex];
    
    // Format: Selasa, 10 Desember 2024 ~ 14:30:45 WIB
    const timeString = `${namaHariSekarang}, ${hari} ${namaBulanSekarang} ${tahun} • ${jam}:${menit}:${detik} WIB`;
    
    const waktuElement = document.getElementById('waktu');
    if (waktuElement) {
        waktuElement.textContent = timeString;
    }
}

// ==================== INISIALISASI ====================
document.addEventListener('DOMContentLoaded', function() {
    console.log("🚀 Aplikasi Kas RT02-RW18 dimulai...");
    console.log("📁 Sumber data:", DATA_FILE);
    
    // Set theme default
    document.body.setAttribute('data-theme', 'default');
    
    // Fetch data pertama
    setTimeout(fetchSaldo, 500);
    
    // Update waktu setiap detik
    updateTime();
    setInterval(updateTime, 1000);
    
    // Auto-refresh setiap 30 detik
    setInterval(fetchSaldo, 30000);
    
    // Refresh ketika tab aktif kembali
    document.addEventListener('visibilitychange', function() {
        if (!document.hidden) {
            console.log("🔄 Tab aktif, refresh data...");
            fetchSaldo();
        }
    });
    
    // Refresh ketika online kembali
    window.addEventListener('online', function() {
        console.log("🌐 Koneksi online, refresh data...");
        fetchSaldo();
    });
    
    window.addEventListener('offline', function() {
        console.log("📴 Koneksi offline");
        updateConnectionStatus('offline');
        showErrorState('Offline - cek koneksi');
    });
});

// ==================== FUNGSI DEBUG ====================
window.debugFetch = function() {
    console.log("🔧 Debug: Manual fetch");
    fetchSaldo();
};

window.debugCheckData = function() {
    console.log("📊 Debug info:");
    console.log("Current theme:", currentTheme);
    console.log("Last saldo:", lastSaldo);
    console.log("Is loading:", isLoading);
    console.log("Retry count:", retryCount);
};
