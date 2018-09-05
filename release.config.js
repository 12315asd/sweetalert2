module.exports = {
  debug: true,
  dryRun: true,
  verifyConditions: [
  ],
  prepare: [
  ],
  publish: [
    {
      'path': '@semantic-release/exec',
      'cmd': 'node release ${nextRelease.version}'
    }
  ],
  success: [
  ],
  fail: [
  ]
}
