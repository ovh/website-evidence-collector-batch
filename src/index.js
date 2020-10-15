const cluster = require('cluster');
const path = require('path');
const urlParser = require('url');
const os = require('os');
const _ = require('lodash');
const Bluebird = require('bluebird');
const execa = require('execa');
const Joi = require('@hapi/joi');
const Logger = require('./lib/logger');
const { getUrlsList } = require('./lib/urls');
const { writeFile } = require('./lib/files');

// init logger
const logger = new Logger();

/**
 * Validates the input configuration
 */
const validateConfig = async (config) => {
  // test if website-evidence-collector is available:
  try {
    const { stdout } = await execa.command('website-evidence-collector --version && website-evidence-reporter --version');
    logger.debug(`✔ website-evidence-collector version ${stdout}`);
  } catch (e) {
    throw new Error('Please install website-evidence-collector before!');
  }

  if (!config.get('urls') && !config.get('sitemaps')) {
    throw new Error('Please provide a sitemap and/or an URLs list.');
  }

  const { error } = Joi.object().keys({
    output: Joi.string().required(),
    workers: Joi.number().integer(),
    dnt: Joi.boolean(),
    firstPartyUri: Joi.string().uri().required(),
    setCookie: Joi.string(),
    urls: Joi.array().items(Joi.string().uri().required()),
    sitemaps: Joi.array().items(Joi.object().keys({
      url: Joi.string().uri(),
      exclude: Joi.string(),
      file: Joi.string(),
    }).required()),
  }).required().validate(config.get());

  if (error) {
    throw new Error(error);
  }

  // set workers count to cpus length, if not set
  if (!config.get('workers')) {
    const numCores = os.cpus().length;
    config.set('workers', numCores);
  }
};

/**
 * Generates simplified report
 */
const getSimplifiedReport = async ({ results }) => {
  const report = {
    cookies: [],
    localStorage: [],
    beacons: [],
  };

  for (const result of results) {
    // -- cookies
    for (const valueFromResults of result.results.cookies) {
      const matchedValueIndex = _.findIndex(
        report.cookies,
        (c) => (valueFromResults.name === c.name)
          && (valueFromResults.domain === c.domain)
          && (valueFromResults.path === c.path),
      );

      if (!~matchedValueIndex) {
        report.cookies.push({
          name: valueFromResults.name,
          domain: valueFromResults.domain,
          path: valueFromResults.path,
          expires: valueFromResults.session ? 'session' : valueFromResults.expiresDays,
        });
      }
    }

    // -- localStorage
    const localStorageListFromResults = _.flatten(_.map(
      _.map(result.results.localStorage),
      _.keys,
    ));
    for (const valueFromResults in localStorageListFromResults) {
      const matchedValueIndex = _.findIndex(
        report.localStorage,
        {
          key: localStorageListFromResults[valueFromResults],
        },
      );

      if (!~matchedValueIndex) {
        report.localStorage.push({
          key: localStorageListFromResults[valueFromResults],
        });
      }
    }

    // -- beacons
    for (const valueFromResults of result.results.beacons) {
      let beaconUrlParsed = urlParser.parse(valueFromResults.url);
      beaconUrlParsed = `${beaconUrlParsed.protocol}//${beaconUrlParsed.hostname}${beaconUrlParsed.pathname.replace(/\/$/, '')}`;

      const matchedValueIndex = _.findIndex(report.beacons, { url: beaconUrlParsed });

      if (!~matchedValueIndex) {
        report.beacons.push({
          url: beaconUrlParsed,
        });
      }
    }
  }

  // now, sort elements
  report.cookies = _.sortBy(report.cookies, ['domain', 'name']);
  report.localStorage = _.sortBy(report.localStorage, 'key');
  report.beacons = _.sortBy(report.beacons, 'url');

  return report;
};

/**
 * Generates full report
 */
const getFullReport = async ({
  config, results, startTime, endTime,
}) => {
  // take the base url report as reference
  const report = _.find(results, { url: config.get('firstPartyUri') }).results;

  // set some infos
  report.start_time = startTime;
  report.end_time = endTime;
  report.browsing_history = _.map(results, 'url').sort();

  for (const result of results) {
    if (result.url !== config.get('firstPartyUri')) {
      // -- links --- firstParty, thirdParty, social, keywords
      for (const linksType in report.links) {
        for (const valueFromResults of result.results.links[linksType]) {
          const matchedValueIndex = _.findIndex(
            report.links[linksType],
            {
              href: valueFromResults.href,
            },
          );
          if (!~matchedValueIndex) {
            report.links[linksType].push(valueFromResults);
          }
        }
      }

      // -- @todo unsafeForms
      // -- @todo websockets

      // -- cookies
      for (const valueFromResults of result.results.cookies) {
        const matchedValueIndex = _.findIndex(
          report.cookies,
          (d) => (valueFromResults.name === d.name)
            && (valueFromResults.domain === d.domain)
            && (valueFromResults.path === d.path),
        );
        if (!~matchedValueIndex) {
          report.cookies.push(valueFromResults);
        }
      }

      // -- localStorage
      for (const originValueFromResults in result.results.localStorage) {
        for (const valueFromResults in result.results.localStorage[originValueFromResults]) {
          report.localStorage[originValueFromResults] = report
            .localStorage[originValueFromResults] || {};
          if (!report.localStorage[originValueFromResults][valueFromResults]) {
            report.localStorage[originValueFromResults][valueFromResults] = result
              .results.localStorage[originValueFromResults][valueFromResults];
          }
        }
      }

      // -- beacons
      for (const valueFromResults of result.results.beacons) {
        // note: use a common url, to avoid a lot of duplicates
        let beaconUrlParsed = urlParser.parse(valueFromResults.url);
        beaconUrlParsed = `${beaconUrlParsed.protocol}//${beaconUrlParsed.hostname}${beaconUrlParsed.pathname.replace(/\/$/, '')}`;
        const matchedValueIndex = _.findIndex(report.beacons, { url: beaconUrlParsed });
        if (!~matchedValueIndex) {
          report.beacons.push(_.assignIn({}, valueFromResults, {
            url: beaconUrlParsed,
            fullUrl: valueFromResults.url,
          }));
        } else {
          report.beacons[matchedValueIndex].occurrances += valueFromResults.occurrances;
        }
      }

      // -- hosts --- requests, beacons, cookies, localStorage, links
      for (const hostsType in report.hosts) {
        for (const partyType in report.hosts[hostsType]) {
          for (const valueFromResults of result.results.hosts[hostsType][partyType]) {
            const matchedValueIndex = report.hosts[hostsType][partyType].indexOf(valueFromResults);
            if (!~matchedValueIndex) {
              report.hosts[hostsType][partyType].push(valueFromResults);
            }
          }
        }
      }
    }
  }

  // now, sort elements
  report.links = _.mapValues(report.links, (links) => _.sortBy(links, 'href'));
  report.cookies = _.sortBy(report.cookies, ['domain', 'name']);
  report.localStorage = _.mapValues(
    report.localStorage,
    (ls) => _(ls).toPairs().sortBy(0).fromPairs()
      .value(),
  );
  report.beacons = _.sortBy(report.beacons, 'url');
  report.hosts = _.mapValues(
    report.hosts,
    (hostsType) => _.mapValues(hostsType, (hosts) => hosts.sort()),
  );

  return report;
};

/**
 * Handle results: Generate reports from results.
 */
const handleResults = async ({
  config, results, startTime, endTime,
}) => {
  logger.info('[master] Generating JSON report...');
  const fullReportJson = await getFullReport({
    config, results, startTime, endTime,
  });
  await writeFile(path.resolve(config.get('output'), 'report.json'), fullReportJson);

  logger.info('[master] Generating HTML report...');
  const command = `website-evidence-reporter ${path.resolve(config.get('output'), 'report.json')}`;
  let { stdout: fullReportHtml } = await execa.command(command, { timeout: 30000 });
  fullReportHtml = fullReportHtml.replace('</style>', '.markdown-body pre { max-height: 150px; }</style>'); // hotfix because of original template
  await writeFile(path.resolve(config.get('output'), 'report.html'), fullReportHtml);

  logger.info('[master] Generating simplified JSON report...');
  const simplifiedReportJson = await getSimplifiedReport({ results });
  await writeFile(path.resolve(config.get('output'), 'report_simplified.json'), simplifiedReportJson);

  logger.info('[master] Generating individual reports...');
  await Bluebird.map(results, async (result) => {
    logger.debug(`[master] Generating individual report for ${result.url}...`);
    try {
      const reportFileLocation = path.resolve(config.get('output'), 'full_results', `${_.snakeCase(result.url)}.json`);
      await writeFile(reportFileLocation, result.results);
      const { stdout: reportHtml } = await execa.command(`website-evidence-reporter ${reportFileLocation}`, { timeout: 30000 });
      await writeFile(path.resolve(config.get('output'), 'full_results', `${_.snakeCase(result.url)}.html`), reportHtml);
    } catch (e) {
      // skip
      logger.error(`[master] failed to create the report for ${result.url}`);
    }
  }, { concurrency: config.get('workers') });

  logger.info('[master] Done.');
};

/**
 * [master] main task
 */
const setupMaster = async (config) => {
  // Get urls list
  const urls = await getUrlsList({
    urls: config.get('urls'),
    sitemaps: config.get('sitemaps'),
  });

  // @FIXME
  if (!~urls.indexOf(config.get('firstPartyUri'))) {
    throw new Error('For now, the firstPartyUri must be in URLs list, because it is used for the main report.');
  }

  const results = [];
  const startTime = new Date();

  // event: worker is online and ready
  cluster.on('online', (worker) => {
    logger.debug(`[master] Worker ${worker.id} (${worker.process.pid}) up and listening`);
  });

  // event: worker sent a message to master
  cluster.on('message', (worker, { message, data }) => {
    logger.debug(`[master] Worker ${worker.id} (${worker.process.pid}) sent message '${message}'`);

    if (message === 'results') {
      logger.debug(`[master] Worker ${worker.id} (${worker.process.pid}) sent results for URL '${data.url}'`);
      results.push(data);
    }

    if (urls.length) {
      const newTaskUrl = urls.shift();
      logger.debug(`[master] Worker ${worker.id} (${worker.process.pid}) send new task to worker for URL: '${newTaskUrl}'`);
      worker.send(newTaskUrl);
    } else {
      logger.debug(`[master] Worker ${worker.id} (${worker.process.pid}) no more job to do, kill it`);
      worker.kill();
    }
  });

  // event: worker exited: relaunch a new one or finish
  cluster.on('exit', async (worker, code, signal) => {
    logger.debug(`[master] Worker ${worker.id} (${worker.process.pid}) died with code: ${code}, and signal: ${signal}`);

    if (!Object.keys(cluster.workers).length) {
      logger.info('[master] All workers have finished its jobs');
      const endTime = new Date();
      // done -> now let's create reports based on results
      await handleResults({
        config, results, startTime, endTime,
      });
    } else if (urls.length) {
      logger.debug('[master] Starting a new worker');
      cluster.fork();
    }
  });

  // spawn workers, based on configuration
  for (let i = 0; i < config.get('workers'); i += 1) {
    cluster.fork();
  }

  logger.info(`[master] Cluster is setup with ${config.get('workers')} workers`);
};

/**
 * [worker] main task
 */
const setupWorker = async (config) => {
  // event: worker received a message from master
  process.on('message', async (url) => {
    logger.debug(`[worker ${cluster.worker.id} (${cluster.worker.process.pid})] start working on URL '${url}'`);

    const result = {
      url,
      results: {},
    };

    try {
      const command = `website-evidence-collector ${url} --first-party-uri="${config.get('firstPartyUri')}" ${config.get('dnt') ? '--dnt-js' : ''} ${config.get('setCookie') ? `--set-cookie "${config.get('setCookie')}"` : ''} --sleep=3000 --overwrite --quiet --no-output --json --headless -- --disable-gpu --ignore-certificate-errors --no-sandbox --disable-setuid-sandbox --disable-dev-shm-usage`;
      const { stdout } = await execa.command(command, { timeout: 30000 });
      result.results = JSON.parse(stdout);

      logger.info(`[worker ${cluster.worker.id} (${cluster.worker.process.pid})] got results for URL '${url}'`);
      process.send({ message: 'results', data: result });
    } catch (e) {
      logger.error(`[worker ${cluster.worker.id} (${cluster.worker.process.pid})] failed on '${url}'`);
      logger.debug(e && e.stack);
      process.exit(1);
    }
  });

  // worker is ready
  logger.debug(`[worker ${cluster.worker.id} (${cluster.worker.process.pid})] started`);
  process.send({ message: 'ready' });
};

/**
 * Main entry point for master & workers
 */
const WebsiteEvidenceCollectorBatch = async (config) => {
  if (cluster.isMaster) {
    await validateConfig(config);
    await setupMaster(config);
  } else {
    await setupWorker(config);
  }
};

module.exports = WebsiteEvidenceCollectorBatch;
