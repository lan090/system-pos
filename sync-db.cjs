const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const MIG_DIR = path.join(__dirname, 'supabase', 'migrations');
const BACKUP_DIR = path.join(__dirname, 'supabase', 'migrations_backup');

function run() {
    try {
        console.log('🔄 [1/5] Memulai pembersihan berkas migrasi lokal...');

        // 1. Membuat folder backup jika belum ada
        if (!fs.existsSync(BACKUP_DIR)) {
            fs.mkdirSync(BACKUP_DIR, { recursive: true });
        }

        // 2. Memindahkan semua berkas lama ke folder backup (Karantina)
        if (fs.existsSync(MIG_DIR)) {
            const files = fs.readdirSync(MIG_DIR);
            files.forEach(file => {
                const oldPath = path.join(MIG_DIR, file);
                const newPath = path.join(BACKUP_DIR, file);
                fs.renameSync(oldPath, newPath);
                console.log(`📦 Dikarantina: ${file} -> migrations_backup/`);
            });
        } else {
            fs.mkdirSync(MIG_DIR, { recursive: true });
        }

        console.log('\n📥 [2/5] Menarik skema bersih dari Supabase Cloud...');
        // 3. Menjalankan db pull (inherit digunakan agar Anda bisa langsung input password di terminal)
        execSync('npx supabase db pull', { stdio: 'inherit' });

        console.log('\n📄 [3/5] Membuat berkas migrasi baru untuk Foreign Key...');
        // 4. Membuat template migrasi baru lewat CLI
        execSync('npx supabase migration new fix_appointments_services_relation', { stdio: 'inherit' });

        // 5. Mencari berkas migrasi baru yang baru saja dibuat oleh CLI
        const newFiles = fs.readdirSync(MIG_DIR).filter(f => f.endsWith('.sql') && f.includes('fix_appointments_services_relation'));

        if (newFiles.length === 0) {
            throw new Error('Gagal menemukan berkas migrasi baru yang dibuat oleh Supabase CLI.');
        }

        const targetMigrationFile = path.join(MIG_DIR, newFiles[0]);

        // 6. Menyuntikkan DDL SQL relasi ke dalam berkas baru tersebut
        const ddlContent = `BEGIN;

-- Memastikan kolom jembatan tersedia
ALTER TABLE public.appointments 
ADD COLUMN IF NOT EXISTS service_id UUID;

-- Hancurkan constraint cacat lama jika ada
ALTER TABLE public.appointments 
DROP CONSTRAINT IF EXISTS fk_appointments_services;

-- Suntikkan batasan fisik Foreign Key resmi
ALTER TABLE public.appointments
ADD CONSTRAINT fk_appointments_services
FOREIGN KEY (service_id) 
REFERENCES public.services(id)
ON DELETE SET NULL;

-- Memaksa reload skema API PostgREST
NOTIFY pgrst, 'reload schema';

COMMIT;`;

        fs.writeFileSync(targetMigrationFile, ddlContent, 'utf8');
        console.log(`✅ SQL DDL berhasil disuntikkan ke: ${newFiles[0]}`);

        console.log('\n🚀 [4/5] Mendorong skema baru ke live database...');
        // 7. Mendorong perubahan ke cloud
        execSync('npx supabase db push', { stdio: 'inherit' });

        console.log('\n🎉 [5/5] Selesai! Seluruh pipa database telah sinkron dan bersih.');

    } catch (error) {
        console.error('\n❌ Terjadi kegagalan sistem saat otomatisasi:', error.message);
        process.exit(1);
    }
}

run();