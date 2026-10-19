const fs = require('node:fs');
const path = require('node:path');

const envPath = path.join(__dirname, '..', '.env');
if (!fs.existsSync(envPath)) {
    console.error('Missing .env. Copy .env.example to .env and add your Supabase project URL and publishable/anon key.');
    process.exit(1);
}

const config = Object.fromEntries(
    fs.readFileSync(envPath, 'utf8')
        .split(/\r?\n/)
        .flatMap((line) => {
            const match = line.match(/^\s*(CINE_SUPABASE_URL|CINE_SUPABASE_ANON_KEY)\s*=\s*(.*?)\s*$/);
            if (!match) return [];
            return [[match[1], match[2].replace(/^(['"])(.*)\1$/, '$2')]];
        }),
);

if (
    !/^https:\/\/[a-z0-9-]+\.supabase\.co\/?$/i.test(config.CINE_SUPABASE_URL || '') ||
    !config.CINE_SUPABASE_ANON_KEY ||
    /your-project-ref|your-supabase/i.test(config.CINE_SUPABASE_ANON_KEY)
) {
    console.error('Set a valid CINE_SUPABASE_URL and CINE_SUPABASE_ANON_KEY in .env before creating installers.');
    process.exit(1);
}
