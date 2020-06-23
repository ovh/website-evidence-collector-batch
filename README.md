# website-evidence-collector-batch

A tool to launch [website-evidence-collector](https://github.com/EU-EDPS/website-evidence-collector) on several URLs or Sitemaps and generate a full report.

## Prerequisites

You need to have [website-evidence-collector](https://github.com/EU-EDPS/website-evidence-collector) installed on your machine.

See [installation guide](https://github.com/EU-EDPS/website-evidence-collector#installation).

## Install

```bash
$ npm install -g git+https://github.com/ovh/website-evidence-collector-batch.git
```

## Usage

```bash
$ website-evidence-collector-batch --config="/path/to/config/file"
```

Your results will be stored in the output folder, like this:

 * **full_results**: all reports for each pages individually (JSON and HTML)
 * **report.html**: the full HTML report of all pages
 * **report.json**: the full JSON report of all pages
 * **report_simplified.json**: the simplified report of all pages (with only the list of cookies/localStorage/beacons)

## Configuration

Create a config file with the following configuration:

```yaml
output: '/path/to/output/folder'                      # (required) Path to the output folder
workers: 4                                            # (optional) number of concurrency workers (default is CPUs count)
dnt: true                                             # (optional) Set Do-Not-Track (default is false)
firstPartyUri: 'https://ovhcloud.com/fr/'             # (required) First Party URI
urls:                                                 # (required/optional) List of URLs to grab
  - 'https://ovhcloud.com/fr/url1'
  - 'https://ovhcloud.com/fr/url2'
sitemaps:                                             # (required/optional) Sitemaps list containing URLs to grab (can be files or urls)
  - url: 'https://ovhcloud.com/fr/sitemap.xml'
    exclude: '/^exclude/these/url$/'
  - file: '/path/to/sitemap_custom.xml'
setCookie: cookies.txt                                # (optional) --set-cookie option to be passed to website-evidence-collector
                                                      # see https://github.com/EU-EDPS/website-evidence-collector/blob/master/FAQ.md#how-do-i-gather-evidence-with-given-consent 
```

You must provide at least one item in `urls` and/or `sitemaps`.

You can create your config file in **JSON** or **YAML** format.

## FAQ

### Why do you launch multiple parallels instances of the tool, instead of using parameter `--browse-link`?

You can use the parameter [--browse-link](https://github.com/EU-EDPS/website-evidence-collector/blob/master/lib/argv.js#L35) to launch the tool on a set of URLs.

In this case, the URLs will be browsed one after one, taking a lot of time.

This tool will launch multiple instances in parallel, and then merge the results into one report.

As an example, on a set of **100** URLs, we've benchmarked that this is **3x** faster:

|                                                       |           |
|-------------------------------------------------------|-----------|
| website-evidence-collector with --browse-link         | ~13min41s |
| website-evidence-collector-batch (4 CPUs / 4 workers) | ~04min38s |

## Credits

This tool is based on the great tool from @rriemann-eu: [website-evidence-collector](https://github.com/EU-EDPS/website-evidence-collector).

## License

This tool is licensed under the same license than [website-evidence-collector](https://github.com/EU-EDPS/website-evidence-collector/blob/master/LICENSE.txt). See [LICENSE.txt](LICENSE.txt) file.
