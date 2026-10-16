const fs = require('fs');
const path = require('path');
const http = require('http');

async function clearData() {
  console.log('--- Cleaning Stored League and User Data ---');

  const baseDir = path.resolve(__dirname, '..');
  const dataDir = process.env.DATA_DIR || path.join(baseDir, '.data');
  const leaguesDir = path.join(dataDir, 'leagues');
  const usersDir = path.join(dataDir, 'users');
  const usersJsonFile = path.join(dataDir, 'users.json');

  let deletedLeaguesCount = 0;
  let deletedUsersCount = 0;

  // 1. Clear leagues directory
  if (fs.existsSync(leaguesDir)) {
    const files = fs.readdirSync(leaguesDir);
    for (const file of files) {
      if ((file.endsWith('.json') || file.includes('.tmp.')) && !file.startsWith('.')) {
        const filePath = path.join(leaguesDir, file);
        try {
          fs.unlinkSync(filePath);
          if (file.endsWith('.json')) deletedLeaguesCount++;
          console.log(`Deleted league file: ${file}`);
        } catch (e) {
          console.error(`Failed to delete ${filePath}:`, e);
        }
      }
    }
  }

  // 2. Clear users directory
  if (fs.existsSync(usersDir)) {
    const files = fs.readdirSync(usersDir);
    for (const file of files) {
      if ((file.endsWith('.json') || file.includes('.tmp.')) && !file.startsWith('.')) {
        const filePath = path.join(usersDir, file);
        try {
          fs.unlinkSync(filePath);
          if (file.endsWith('.json')) deletedUsersCount++;
          console.log(`Deleted user account: ${file}`);
        } catch (e) {
          console.error(`Failed to delete ${filePath}:`, e);
        }
      }
    }
  }

  // 3. Clear root users.json if present
  if (fs.existsSync(usersJsonFile)) {
    try {
      fs.unlinkSync(usersJsonFile);
      deletedUsersCount++;
      console.log(`Deleted root users.json`);
    } catch (e) {
      console.error(`Failed to delete ${usersJsonFile}:`, e);
    }
  }

  // Write sentinel file to record that clean slate has run
  const sentinelFile = path.join(dataDir, '.clean_slate_20261016');
  try {
    if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
    fs.writeFileSync(sentinelFile, `Clean slate performed at ${new Date().toISOString()}\n`, 'utf-8');
  } catch {}

  console.log(`\nLocal disk wiped: ${deletedLeaguesCount} leagues, ${deletedUsersCount} users/accounts.`);

  // 4. Trigger in-memory wipe on running local server if listening
  const ports = [6969, 3000];
  for (const port of ports) {
    try {
      await new Promise((resolve) => {
        const req = http.request(
          {
            hostname: '127.0.0.1',
            port: port,
            path: '/api/admin/clear',
            method: 'POST',
            timeout: 2000,
          },
          (res) => {
            let data = '';
            res.on('data', (chunk) => (data += chunk));
            res.on('end', () => {
              console.log(`Triggered server in-memory clear on port ${port}: HTTP ${res.statusCode}`);
              resolve(true);
            });
          }
        );
        req.on('error', () => resolve(false));
        req.on('timeout', () => {
          req.destroy();
          resolve(false);
        });
        req.end();
      });
    } catch {}
  }

  console.log('\nData clearing complete! Clean slate initialized.');
}

clearData().catch((err) => {
  console.error('Error clearing data:', err);
  process.exit(1);
});
