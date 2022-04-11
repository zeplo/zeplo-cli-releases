// Packages
const axios = require('axios')
const ms = require('ms')

// This is where we're keeping the cached
// releases in the RAM
let cache = null

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET')

  return getData()
}

const slack = (text, id) => {
  axios.post(`https://hooks.slack.com/services/${id}`, {
    text,
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
      url: `https://github.com/zeplo/zeplo-cli/releases/download/${release.tag_name}/${name}`
    }))
  }
}

const getData = async () => {
  if (cache) return cache

  const url = 'https://api.github.com/repos/zeplo/zeplo-cli/releases?per_page=100'

  const response = await axios.get(url, {
    headers: {
      Accept: 'application/vnd.github.preview'
    }
  })

  const releases = response.data
  const canary = releases.find(item => Boolean(item.prerelease))
  const stable = releases.find(item => !item.prerelease)
  cache = {}

  if (canary && isCanary(canary)) {
    cache.canary = generateMeta(canary)
  }

  if (stable && !isCanary(stable)) {
    cache.stable = generateMeta(stable)
  }

  setTimeout(() => {
    cache = null
  }, ms('5m'))

  return cache
}
