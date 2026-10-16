const path = require('path');
const createJiti = require('jiti');
const jiti = createJiti(__filename, {
  alias: {
    '@': path.resolve(__dirname, '../src'),
  },
});
jiti('./test_reset.ts');
jiti('./test_claims.ts');
