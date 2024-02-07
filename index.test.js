'use strict';
const process = require('process');
const cp = require('child_process');
const path = require('path');

// shows how the runner will run a javascript action with env / stdout protocol
// eslint-disable-next-line no-undef
test('test runs', () => {

    process.env['GITHUB_SERVER_URL'] = 'https://github.com';
    process.env['GITHUB_REPOSITORY'] = 'ru2-apic-discovery-action';
    process.env['GITHUB_WORKSPACE'] = '/home/ruairi/git/misc/apic-discovery-action';

    process.env['INPUT_API-HOST'] = 'd-h01.apiconnect.dev.automation.ibm.com';
    process.env['INPUT_API-KEY'] = '';
    process.env['INPUT_PROVIDER-ORG'] = 'ruairi_h01_b';
    // process.env['INPUT_GIT_DIFF'] = 'APIfolder/gmail-api.json mit-api.json new-api.yaml';

    process.env['INPUT_API-FILES'] = [ 'APIfolder/gmail-api.json', 'APIfiles/mit-api.json' ];
    // process.env['INPUT_API-FILES'] = [ 'gmail-api-2.json' ];
    // process.env['INPUT_API-FOLDERS'] = [ 'APIfiles' ];
    // process.env['INPUT_API-FOLDERS'] = [ 'APIfiles', 'APIfolder' ];
    process.env['INPUT_RESYNC_CHECK'] = true;

    const ip = path.join(__dirname, 'index.js');
    const resultOne = cp.execSync(`cat ${ip}`).toString();
    try {
        const resNpmVersion = cp.execSync('npm -v');
        console.log('success', resNpmVersion.toString());
        const result = cp.execSync(`node ${ip}`, { env: process.env }, { stdio: 'inherit' }).toString();
        console.log(result);
    } catch (error) {
        console.log(error.message);
        console.log('error', error.stdout.toString());
    }

});
