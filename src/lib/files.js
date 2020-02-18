const path = require('path');
const fse = require('fs-extra');
const yaml = require('js-yaml');

/**
 * Read a file of any types (YAML, JSON, ...) and return its output (parsed).
 */
async function readFile(filePath) {
  const fileExists = await fse.pathExists(filePath);
  if (!fileExists) {
    throw new Error(`The file '${filePath}' is unreachable!`);
  }
  let content;
  switch (path.extname(filePath).toLowerCase()) {
    case '.json':
      content = await fse.readJson(filePath, { encoding: 'utf8' });
      break;
    case '.yaml':
    case '.yml':
      content = await fse.readFile(filePath, { encoding: 'utf8' });
      content = yaml.safeLoad(content);
      break;
    default:
      content = await fse.readFile(filePath, { encoding: 'utf8' });
  }
  return content;
}

/**
 * Write content to file of any types (YAML, JSON, ...).
 */
async function writeFile(filePath, content) {
  await fse.ensureFile(filePath);
  switch (path.extname(filePath).toLowerCase()) {
    case '.json':
      await fse.outputJson(filePath, content, { spaces: 2, encoding: 'utf8' });
      break;
    case '.yaml':
    case '.yml':
      await fse.outputFile(filePath, yaml.safeDump(content, { lineWidth: 99999 }), { encoding: 'utf8' });
      break;
    default:
      await fse.outputFile(filePath, content, { encoding: 'utf8' });
  }
}

module.exports = {
  readFile,
  writeFile,
};
