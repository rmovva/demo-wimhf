const fs = require('fs');
const path = require('path');

const SOURCE_DATA_PATH = '/Users/rajivmovva/Documents/data/feature_data_for_demo.json';
const TARGET_DATA_PATH = path.join(__dirname, '..', 'public', 'feature_data_for_demo.json');

function copyData() {
  try {
    if (!fs.existsSync(SOURCE_DATA_PATH)) {
      console.warn(
        `[sync-data] Source file not found at ${SOURCE_DATA_PATH}. ` +
        'The app will load the previous copy in public/.'
      );
      return;
    }

    fs.copyFileSync(SOURCE_DATA_PATH, TARGET_DATA_PATH);
    console.log(`[sync-data] Copied data to ${TARGET_DATA_PATH}`);
  } catch (err) {
    console.error('[sync-data] Failed to copy demo data:', err);
    process.exitCode = 1;
  }
}

copyData();
