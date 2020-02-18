#!/usr/bin/env node

const program = require('commander');
const Logger = require('../src/lib/logger');
const Config = require('../src/lib/config');
const WebsiteEvidenceCollectorBatch = require('../src/');

const logger = new Logger();

// Load config
async function getConfig(configurationFile) {
  const config = new Config(configurationFile);
  try {
    await config.load();
  } catch (e) {
    logger.error(e);
    process.exit(1);
  }
  return config;
}

// Main function
(async () => {
  // CLI
  program
    .requiredOption('--config <config>', 'The location of your config file.')
    .description('Launch website-evidence-collector for a list of URLs.')
    .parse(process.argv);

  try {
    const config = await getConfig(program.config);
    await WebsiteEvidenceCollectorBatch(config);
  } catch (e) {
    logger.error(e);
    process.exit(1);
  }
})();
