// Packages
const fetch = require('node-fetch')
const ms = require('ms')

// This is where we're keeping the cached
// releases in the RAM
const cache = {}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET')

  return cache
}

const slack = (text, id) => {
  fetch(`https://hooks.slack.com/services/${id}`, {
    method: 'POST',
    body: JSON.stringify({text})
  })
}

const isCanary = ({tag_name}) => {
  return tag_name.includes('canary')
}

const log = text => slack(text, process.env.TOKEN_EVENTS)
const logError = text => slack(text, process.env.TOKEN_ALERTS)

const platformFromName = name => {
  const spec = {
    mac: 'macOS',
    win: 'Windows',
    alpine: 'Alpine (musl)',
    linux: 'Linux (glibc)'
  }

  for (const platform of Object.keys(spec)) {
    if (name.includes(platform)) {
      return spec[platform]
    }
  }

  return 'Other'
}

const generateMeta = release => {
  return {
    tag: release.tag_name,
    url: release.html_url,
    assets: release.assets.map(({name}) => ({
      name,
      platform: platformFromName(name),
      url: `https://github.com/ralleyio/ralley-cli/releases/download/${release.tag_name}/${name}`
    }))
  }
}

const cacheData = async () => {
  const start = Date.now()
  const url = 'https://api.github.com/repos/ralleyio/ralley-cli/releases?per_page=100'

  const response = await fetch(url, {
    headers: {
      Accept: 'application/vnd.github.preview'
    }
  })

  if (response.status !== 200) {
    return logError('Non-200 response code from GitHub: ' + response.status)
  }

  let releases

  try {
    releases = await response.json()
  } catch (err) {
    logError('Error parsing response from GitHub: ' + err.stack)
    return
  }

  const canary = releases.find(item => Boolean(item.prerelease))
  const stable = releases.find(item => !item.prerelease)

  if (canary && isCanary(canary)) {
    cache.canary = generateMeta(canary)
  }

  if (stable && !isCanary(stable)) {
    cache.stable = generateMeta(stable)
  }

  log(`Re-built Now CLI releases cache. ` +
  `Elapsed: ${(new Date() - start)}ms`)
}

// Cache releases now
cacheData()

// ... and every 5 minutes
setInterval(cacheData, ms('5m'))
