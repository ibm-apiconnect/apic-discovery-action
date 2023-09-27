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

    process.env['INPUT_API_HOST'] = 'd-h01.apiconnect.dev.automation.ibm.com';
    process.env['INPUT_API_KEY'] = '';
    process.env['INPUT_PROVIDER_ORG'] = 'ruairi_h01_b';
    // process.env['INPUT_GIT_DIFF'] = "APIfolder/gmail-api.json mit-api.json new-api.yaml";

    process.env['INPUT_API_FILES'] = [ 'APIfolder/gmail-api.json', 'APIfiles/mit-api.json' ];
    // process.env['INPUT_API_FILES'] = ["gmail-api-2.json"];
    // process.env['INPUT_API_FOLDERS'] = ["APIfiles"];
    // process.env['INPUT_API_FOLDERS'] = ["APIfiles","APIfolder"];
    process.env['INPUT_RESYNC_CHECK'] = true;

    const ip = path.join(__dirname, 'index.js');
    const result = cp.execSync(`node ${ip}`, { env: process.env }).toString();
    console.log(result);
});
