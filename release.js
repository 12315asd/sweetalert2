const pify = require('pify')
const rimraf = require('rimraf')
const fs = require('fs')
const assert = require('assert')
const isCi = require('is-ci')
const semver = require('semver')
const getGitStatus = require('./utils/get-git-status')
const execute = require('./utils/execute')

const log = console.log // eslint-disable-line
const removeDir = pify(rimraf)
const readFile = pify(fs.readFile)
const writeFile = pify(fs.writeFile)

const dryRun = process.argv.includes('--dry-run')

const version = semver.clean(process.argv[2])
assert.ok(semver.valid(version), 'Must specify the valid semver version, e.g. 1.2.3')

;(async () => {
  log('Doing sanity checks...')
  let { currentBranch: branchToPublish, isCleanWorkingTree } = await getGitStatus()
  if (!dryRun) {
    if (isCi) {
      branchToPublish = process.env.TRAVIS_BRANCH
      log(`CI, switching to ${branchToPublish}...`)
      await execute(`git checkout ${branchToPublish}`)

      log(`CI, cleaning working tree on ${branchToPublish}...`)
      await execute('git checkout .')
    } else {
      assert.equal(branchToPublish, 'master', 'Must be on master branch')
    }
  }
  assert.equal(isCleanWorkingTree, true, 'Must have clean working tree')

  log(`Pulling the latest ${branchToPublish} branch from Github...`)
  await execute('git pull origin')

  log(`Running npm version ${version}...`)
  await execute(`npm version --no-git-tag-version ${version}`)

  log(`Making a version change commit...`)
  await execute(`git add package.json && git commit -m "${version}"`)

  log('Deleting the dist folder (it will conflict with the next step)...')
  await removeDir('dist')

  log('Switching to the dist branch...')
  await execute('yarn switch-to-dist')

  log('Installing npm dependencies...')
  await execute('yarn')

  log('Running the build...')
  await execute('npm run build')

  if (!isCi) {
    log('Running the checks...')
    await execute('npm run check')
  }

  if (dryRun) {
    log('Skipping publishing on npm...')
  } else {
    log('Publishing on npm...')
    await execute('npm publish')
  }

  log('Removing "dist" from .gitignore...')
  const gitignore = await readFile('.gitignore', 'utf8')
  const gitignoreWithoutDist = gitignore.split(/\r?\n/).filter(line => line !== 'dist').join('\n')
  await writeFile('.gitignore', gitignoreWithoutDist)

  log('Committing the dist dir...')
  await execute(`git add dist/ && git commit -m "Release v${version}"`)

  log('Reverting the change to .gitignore...')
  await execute('git reset --hard HEAD')

  log(`Tagging commit as "v${version}"...`)
  await execute(`git tag "v${version}"`)

  if (dryRun) {
    log('Skipping pushing to Github...')
  } else {
    log('Pushing to Github both master and dist branches...')
    if (isCi) {
      await execute('git config --global user.email "semantic-release-bot@martynus.net"')
      await execute('git config --global user.name "semantic-release-bot"')
      await execute(`git remote set-url origin https://${process.env.GH_TOKEN}@github.com/sweetalert2/sweetalert2.git`)
    }
    await execute('git push origin master:master dist:dist --tags')
  }

  log(`Purge jsdelivr cache...`)
  const distFiles = fs.readdirSync('dist')
  for (const distFile of distFiles) {
    await execute(`curl --silent https://purge.jsdelivr.net/npm/sweetalert2@latest/dist/${distFile}`, { skipLogging: true })
  }

  log(`Switching back to "${branchToPublish}" (so you can continue to work)...`)
  await execute(`git checkout "${branchToPublish}"`)

  log('OK!')
})().catch(console.error)
