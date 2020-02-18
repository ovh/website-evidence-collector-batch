const Bluebird = require('bluebird');
const got = require('got');
const path = require('path');
const cheerio = require('cheerio');
const _ = require('lodash');
const { readFile } = require('./files');
const pkg = require('../../package.json');

async function getUrlsList({ urls = [], sitemaps = [] }) {
  let urlsList = urls;

  await Bluebird.map(sitemaps, async (sitemap) => {
    let sitemapDatas;
    if (sitemap.url) {
      // sitemap is an URL
      const response = await got({
        method: 'GET',
        url: sitemap.url,
        headers: {
          'User-Agent': `Node/${pkg.name} ${pkg.version} (${pkg.repository.url})`,
        },
        timeout: 30000,
        retry: 5,
      });
      sitemapDatas = response.body;
    } else {
      // sitemap is a file
      const sitemapFile = path.resolve(process.cwd(), sitemap.file);
      sitemapDatas = await readFile(sitemapFile);
    }

    const $ = cheerio.load(sitemapDatas, {
      xmlMode: true,
    });

    const sitemapExclude = (
      sitemap.exclude
        ? new RegExp(sitemap.exclude, 'gi')
        : null
    );

    $('url > loc').toArray().forEach((element) => {
      const url = $(element).text();

      // exclude urls from regex
      if (sitemapExclude && url.match(sitemapExclude)) {
        return;
      }

      urlsList.push(url);
    });
  }, { concurrency: 5 });

  // sorted & uniq
  urlsList = urlsList.sort();
  urlsList = _.sortedUniq(urlsList);

  return urlsList;
}

module.exports = {
  getUrlsList,
};
