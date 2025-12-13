/* ==================== BALANCE.JS - SISTEM PEMANTAUAN SALDO ==================== */

/* ==================== KONFIGURASI ==================== */
const BALANCE_UPDATE_INTERVAL = 15000;
const BALANCE_MAX_READINGS = 3;
const BALANCE_REQUIRED_CONSECUTIVE = 2;

/* ==================== VARIABEL STATE ==================== */
const BalanceSystem = {
    // Data state
    stickyValue: null,
    stickyCounter: 0,
    readings: [],
    currentCandidate: null,
    lastDisplayedBalance: null,
    
    // Control state
    updateTimer: null,
    isFetching: false,
    retryCount: 0,
    MAX_RETRIES: 3,
    isInitialized: false,
    initializationAttempts: 0,
    MAX_INIT_ATTEMPTS: 5,
    
    // DOM references
    balanceElement: null,
    statusElement: null,
    currencyElement: null
};

/* ==================== FUNGSI UTILITAS ==================== */

function formatBalance(amount) {
    if (typeof amount !== 'number' || isNaN(amount)) return 'Error';
    if (amount >= 1000000) {
        const juta = (amount / 1000000).toFixed(3);
        return `${juta.replace('.', ',')} Jt`;
    }
    return amount.toLocaleString('id-ID');
}

function detectThemeFromBalance(balance) {
    if (!document.body) return;
    
    let theme = 'default';
    if (balance < 500000) theme = 'red';
    else if (balance >= 500000 && balance <= 1000000) theme = 'yellow-orange';
    else if (balance > 1000000) theme = 'teal';
    
    document.body.classList.add('changing-theme');
    document.body.setAttribute('data-theme', theme);
    setTimeout(() => document.body.classList.remove('changing-theme'), 2500);
}

/* ==================== MANAJEMEN DOM ==================== */

function findBalanceElements() {
    // Cari dengan berbagai kemungkinan selector
    const selectors = [
        '#balance',
        '#saldo',
        '.amount',
        '[data-balance]',
        '.saldo-display > span',
        '.card-3d .amount'
    ];
    
    for (const selector of selectors) {
        const element = document.querySelector(selector);
        if (element) {
            console.log(`✅ [Balance] Found element with selector: ${selector}`);
            return element;
        }
    }
    
    // Fallback: cari elemen dengan teks angka atau "Rp"
    const allElements = document.querySelectorAll('*');
    for (const element of allElements) {
        const text = element.textContent.trim();
        if ((text.includes('Rp') || /\d{3,}/.test(text)) && 
            text.length < 50 && 
            !element.querySelector('*')) {
            console.log(`✅ [Balance] Found potential balance element by content: "${text}"`);
            return element;
        }
    }
    
    return null;
}

function findStatusElement() {
    return document.getElementById('balance-status') || 
           document.querySelector('.status-display') ||
           document.querySelector('[data-status]');
}

function findCurrencyElement() {
    return document.getElementById('currency') || 
           document.querySelector('.currency') ||
           document.querySelector('[data-currency]');
}

function setupDOMReferences() {
    BalanceSystem.balanceElement = findBalanceElements();
    BalanceSystem.statusElement = findStatusElement();
    BalanceSystem.currencyElement = findCurrencyElement();
    
    return {
        balance: !!BalanceSystem.balanceElement,
        status: !!BalanceSystem.statusElement,
        currency: !!BalanceSystem.currencyElement
    };
}

/* ==================== VOTING SYSTEM ==================== */

function resetBalanceVoting() {
    BalanceSystem.readings = [];
    BalanceSystem.currentCandidate = null;
    BalanceSystem.stickyCounter = 0;
}

function processBalanceVoting(newValue) {
    if (typeof newValue !== 'number' || isNaN(newValue)) {
        return BalanceSystem.stickyValue;
    }
    
    // Tambahkan ke readings
    BalanceSystem.readings.push(newValue);
    if (BalanceSystem.readings.length > BALANCE_MAX_READINGS) {
        BalanceSystem.readings.shift();
    }
    
    console.log('📊 [Balance] Readings:', BalanceSystem.readings);
    
    // Hitung frekuensi
    const counts = {};
    BalanceSystem.readings.forEach(v => counts[v] = (counts[v] || 0) + 1);
    
    // Cari nilai terbanyak
    let topValue = null;
    let topCount = 0;
    for (const [value, count] of Object.entries(counts)) {
        const numValue = parseInt(value);
        if (count > topCount) {
            topCount = count;
            topValue = numValue;
        }
    }
    
    // Minimal perlu 2 pembacaan sama
    if (!topValue || topCount < 2) {
        console.log('📊 [Balance] No consensus yet');
        return BalanceSystem.stickyValue;
    }
    
    // Proses konfirmasi
    if (topValue === BalanceSystem.currentCandidate) {
        BalanceSystem.stickyCounter++;
        console.log(`🔼 [Balance] Same candidate: ${topValue}, counter: ${BalanceSystem.stickyCounter}/${BALANCE_REQUIRED_CONSECUTIVE}`);
        
        if (BalanceSystem.stickyCounter >= BALANCE_REQUIRED_CONSECUTIVE) {
            console.log(`🎯 [Balance] Confirmed: ${topValue}`);
            if (BalanceSystem.stickyValue !== topValue) {
                BalanceSystem.stickyValue = topValue;
                resetBalanceVoting();
                return topValue;
            }
        }
    } else {
        console.log(`🔄 [Balance] New candidate: ${topValue}`);
        BalanceSystem.currentCandidate = topValue;
        BalanceSystem.stickyCounter = 1;
        
        // Jika langsung muncul banyak, konfirmasi cepat
        if (topCount >= BALANCE_REQUIRED_CONSECUTIVE) {
            console.log(`⚡ [Balance] Quick confirm: ${topValue}`);
            BalanceSystem.stickyValue = topValue;
            resetBalanceVoting();
            return topValue;
        }
    }
    
    return BalanceSystem.stickyValue;
}

/* ==================== UPDATE DISPLAY ==================== */

function updateBalanceDisplay(balance) {
    if (!BalanceSystem.balanceElement) {
        BalanceSystem.balanceElement = findBalanceElements();
        if (!BalanceSystem.balanceElement) return;
    }
    
    if (typeof balance !== 'number' || isNaN(balance) || balance < 0) {
        BalanceSystem.balanceElement.textContent = 'Error';
        BalanceSystem.balanceElement.className = 'amount error';
        return;
    }
    
    const formatted = formatBalance(balance);
    BalanceSystem.balanceElement.textContent = formatted;
    BalanceSystem.balanceElement.className = 'amount';
    
    // Update status jika ada
    if (BalanceSystem.statusElement) {
        if (balance < 50000) {
            BalanceSystem.statusElement.innerHTML = '<i class="fas fa-exclamation-circle"></i> Saldo Rendah';
            BalanceSystem.statusElement.style.color = 'var(--danger-color)';
        } else if (balance < 500000) {
            BalanceSystem.statusElement.innerHTML = '<i class="fas fa-info-circle"></i> Saldo Menengah';
            BalanceSystem.statusElement.style.color = 'var(--warning-color)';
        } else {
            BalanceSystem.statusElement.innerHTML = '<i class="fas fa-check-circle"></i> Saldo Aman';
            BalanceSystem.statusElement.style.color = 'var(--success-color)';
        }
    }
    
    // Update tema
    detectThemeFromBalance(balance);
    
    console.log(`🖥️ [Balance] Display: ${balance} (${formatted})`);
}

/* ==================== FETCH DATA ==================== */

async function fetchBalanceData() {
    if (BalanceSystem.isFetching) throw new Error('Already fetching');
    BalanceSystem.isFetching = true;
    
    try {
        // SIMULASI: Ganti dengan fetch real
        await new Promise(r => setTimeout(r, 300 + Math.random() * 700));
        
        const testValues = [613000, 1300000, 750000, 200000, 950000];
        return testValues[Math.floor(Math.random() * testValues.length)];
        
    } finally {
        BalanceSystem.isFetching = false;
    }
}

/* ==================== MAIN UPDATE LOOP ==================== */

async function updateBalanceMain() {
    if (!BalanceSystem.isInitialized || BalanceSystem.isFetching) {
        scheduleBalanceUpdate();
        return;
    }
    
    console.log('📡 [Balance] Fetching...');
    const startTime = Date.now();
    
    try {
        const newBalance = await fetchBalanceData();
        console.log(`✅ [Balance] Fetched: ${newBalance} (${Date.now() - startTime}ms)`);
        
        const votedValue = processBalanceVoting(newBalance);
        
        if (votedValue !== null && votedValue !== BalanceSystem.lastDisplayedBalance) {
            console.log(`🎨 [Balance] Updating to: ${votedValue}`);
            updateBalanceDisplay(votedValue);
            BalanceSystem.lastDisplayedBalance = votedValue;
        } else if (votedValue === null && BalanceSystem.stickyValue !== null) {
            console.log(`🔒 [Balance] Using sticky: ${BalanceSystem.stickyValue}`);
            updateBalanceDisplay(BalanceSystem.stickyValue);
            BalanceSystem.lastDisplayedBalance = BalanceSystem.stickyValue;
        } else {
            console.log(`⏸️ [Balance] No change (display: ${BalanceSystem.lastDisplayedBalance})`);
        }
        
    } catch (error) {
        console.error('❌ [Balance] Error:', error);
    } finally {
        scheduleBalanceUpdate();
    }
}

function scheduleBalanceUpdate() {
    if (BalanceSystem.updateTimer) clearTimeout(BalanceSystem.updateTimer);
    BalanceSystem.updateTimer = setTimeout(updateBalanceMain, BALANCE_UPDATE_INTERVAL);
}

/* ==================== INISIALISASI ==================== */

function initializeBalanceSystem() {
    // Cek jika sudah diinisialisasi
    if (BalanceSystem.isInitialized) {
        console.log('⏩ [Balance] Already initialized');
        return true;
    }
    
    BalanceSystem.initializationAttempts++;
    console.log(`🚀 [Balance] Init attempt ${BalanceSystem.initializationAttempts}/${BalanceSystem.MAX_INIT_ATTEMPTS}`);
    
    // Setup DOM references
    const domStatus = setupDOMReferences();
    
    if (!domStatus.balance) {
        console.warn('⚠️ [Balance] Balance element not found');
        
        if (BalanceSystem.initializationAttempts < BalanceSystem.MAX_INIT_ATTEMPTS) {
            setTimeout(initializeBalanceSystem, 500);
            return false;
        }
        
        console.error('❌ [Balance] Failed to find balance element');
        return false;
    }
    
    console.log('✅ [Balance] DOM elements found');
    BalanceSystem.isInitialized = true;
    
    // Setup event listeners
    window.addEventListener('online', () => {
        console.log('🌐 [Balance] Online');
        if (BalanceSystem.retryCount > 0) updateBalanceMain();
    });
    
    window.addEventListener('offline', () => {
        console.log('🔌 [Balance] Offline');
    });
    
    // Setup manual refresh button
    if (!document.querySelector('.balance-refresh-btn')) {
        const btn = document.createElement('button');
        btn.className = 'balance-refresh-btn';
        btn.innerHTML = '<i class="fas fa-sync-alt"></i>';
        btn.title = 'Refresh Balance';
        btn.style.cssText = `
            position: fixed;
            bottom: 20px;
            right: 70px;
            background: var(--primary-color);
            color: white;
            border: none;
            border-radius: 50%;
            width: 40px;
            height: 40px;
            font-size: 16px;
            cursor: pointer;
            box-shadow: 0 2px 8px rgba(0,0,0,0.2);
            z-index: 1000;
            transition: all 0.3s;
        `;
        btn.onclick = (e) => {
            e.preventDefault();
            btn.style.transform = 'rotate(360deg)';
            setTimeout(() => btn.style.transform = '', 300);
            updateBalanceMain();
        };
        document.body.appendChild(btn);
    }
    
    // Set loading state
    if (BalanceSystem.balanceElement) {
        BalanceSystem.balanceElement.innerHTML = '<span class="loading-dots-container"><span></span><span></span><span></span></span>';
        BalanceSystem.balanceElement.className = 'amount';
    }
    
    // Start update loop
    console.log('⏳ [Balance] Starting update loop...');
    updateBalanceMain();
    
    return true;
}

/* ==================== DEBUG FUNCTIONS ==================== */

function debugBalanceSystem() {
    console.log('🔧 [Balance Debug]', {
        stickyValue: BalanceSystem.stickyValue,
        stickyCounter: BalanceSystem.stickyCounter,
        readings: BalanceSystem.readings,
        currentCandidate: BalanceSystem.currentCandidate,
        lastDisplayed: BalanceSystem.lastDisplayedBalance,
        isInitialized: BalanceSystem.isInitialized,
        balanceElement: BalanceSystem.balanceElement ? 'Found' : 'Not found'
    });
}

function forceBalanceUpdate() {
    console.log('🔧 [Balance] Manual update');
    updateBalanceMain();
}

function testBalanceTheme(balance) {
    console.log(`🎨 [Balance] Test theme: ${balance}`);
    updateBalanceDisplay(balance);
}

/* ==================== GLOBAL EXPORTS ==================== */

window.BalanceSystem = {
    debug: debugBalanceSystem,
    forceUpdate: forceBalanceUpdate,
    testTheme: testBalanceTheme,
    getCurrentSaldo: () => BalanceSystem.lastDisplayedBalance || BalanceSystem.stickyValue,
    getState: () => ({ ...BalanceSystem }),
    init: initializeBalanceSystem,
    isReady: () => BalanceSystem.isInitialized
};

/* ==================== STARTUP ==================== */

function startBalanceSystem() {
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
            console.log('📄 [Balance] DOM ready');
            setTimeout(initializeBalanceSystem, 100);
        });
    } else {
        console.log('📄 [Balance] DOM already ready');
        setTimeout(initializeBalanceSystem, 100);
    }
}

// Start the system
startBalanceSystem();

// Cleanup on page unload
window.addEventListener('beforeunload', () => {
    if (BalanceSystem.updateTimer) clearTimeout(BalanceSystem.updateTimer);
});