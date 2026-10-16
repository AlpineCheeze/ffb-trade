const path = require('path');
const createJiti = require('jiti');
const jiti = createJiti(__filename, {
  alias: {
    '@': path.resolve(__dirname, '../src'),
  },
});
async function run() {
  const resetModule = jiti('./test_reset.ts');
  if (resetModule && resetModule.testPromise) {
    await resetModule.testPromise;
  }
  const claimsModule = jiti('./test_claims.ts');
  if (claimsModule && claimsModule.testPromise) {
    await claimsModule.testPromise;
  }
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
