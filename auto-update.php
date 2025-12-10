<?php
// ==================== KONFIGURASI ====================
$UPDATE_INTERVAL = 600; // 10 menit dalam detik
$DATA_FILE = "balance.json";
$LOCK_FILE = "update.lock";
$LOG_FILE = "update-log.txt";

// ==================== CEK APAKAH PERLU UPDATE ====================
function needsUpdate() {
    global $DATA_FILE, $UPDATE_INTERVAL;
    
    if (!file_exists($DATA_FILE)) {
        return true;
    }
    
    $data = @json_decode(file_get_contents($DATA_FILE), true);
    
    if (!$data || !isset($data['timestamp_unix'])) {
        return true;
    }
    
    $last_update = $data['timestamp_unix'];
    $current_time = time();
    
    return ($current_time - $last_update) > $UPDATE_INTERVAL;
}

// ==================== CEK LOCK FILE ====================
function isLocked() {
    global $LOCK_FILE;
    
    if (!file_exists($LOCK_FILE)) {
        return false;
    }
    
    $lock_time = file_get_contents($LOCK_FILE);
    $current_time = time();
    
    // Jika lock lebih dari 5 menit, hapus lock
    if (($current_time - intval($lock_time)) > 300) {
        unlink($LOCK_FILE);
        return false;
    }
    
    return true;
}

// ==================== BUAT LOCK ====================
function createLock() {
    global $LOCK_FILE;
    file_put_contents($LOCK_FILE, time());
}

// ==================== HAPUS LOCK ====================
function removeLock() {
    global $LOCK_FILE;
    if (file_exists($LOCK_FILE)) {
        unlink($LOCK_FILE);
    }
}

// ==================== LOG ACTIVITY ====================
function logActivity($message) {
    global $LOG_FILE;
    $timestamp = date('Y-m-d H:i:s');
    $log_entry = "[$timestamp] $message\n";
    file_put_contents($LOG_FILE, $log_entry, FILE_APPEND);
}

// ==================== MAIN UPDATE FUNCTION ====================
function runUpdate() {
    // Cek lock
    if (isLocked()) {
        logActivity("Update ditunda - proses sedang berjalan");
        return false;
    }
    
    // Buat lock
    createLock();
    
    try {
        logActivity("Memulai update otomatis");
        
        // Include fetch-balance.php
        require_once 'fetch-balance.php';
        
        // Panggil fungsi utama
        ob_start();
        main();
        $output = ob_get_clean();
        
        logActivity("Update berhasil: " . substr($output, 0, 100));
        
        return true;
        
    } catch (Exception $e) {
        logActivity("ERROR: " . $e->getMessage());
        return false;
        
    } finally {
        // Hapus lock
        removeLock();
    }
}

// ==================== EXECUTE ====================
if (php_sapi_name() === 'cli') {
    // Running from command line/cron
    echo "🔧 Auto Update Kas RT02-RW18\n";
    echo "⏰ " . date('Y-m-d H:i:s') . "\n";
    
    if (needsUpdate()) {
        echo "🔄 Perlu update, menjalankan...\n";
        $success = runUpdate();
        echo $success ? "✅ Update berhasil\n" : "❌ Update gagal\n";
    } else {
        echo "⏸️  Tidak perlu update\n";
    }
    
} else {
    // Running from web
    header('Content-Type: text/plain; charset=utf-8');
    
    if (needsUpdate()) {
        $success = runUpdate();
        echo $success ? "✅ Data berhasil diupdate" : "❌ Gagal update data";
    } else {
        echo "⏸️  Data sudah up-to-date";
    }
}
?>
