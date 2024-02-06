'use strict';
const core = require('@actions/core');
const { createOrUpdateDiscoveredApi } = require('./discovery-client');


// most @actions toolkit packages have async methods
async function run() {
    try {
        let isFolder = false;
        const githubServer = new URL(process.env['GITHUB_SERVER_URL']).hostname;
        const repoLocation = process.env['GITHUB_REPOSITORY'];
        const workspacePath = process.env['GITHUB_WORKSPACE'];
        const apihost = core.getInput('api-host');
        const apikey = core.getInput('api-key');
        const porg = core.getInput('provider-org');
        const datasourceCheck = core.getInput('resync_check');
        const apisLocation = core.getInput('api-files') || core.getInput('api-folders');
        const filesChanged = core.getInput('git_diff');

        if (core.getInput('api-files')) {
            isFolder = false;
        } else if (core.getInput('api-folders')) {
            isFolder = true;
        }
        if (filesChanged.trim() && apisLocation) {
            let checkChanges = false;
            let filesArray = filesChanged.split(' ');
            let apisLocationArray = apisLocation.split(',');
            if (isFolder) {
                for (let name of apisLocationArray) {
                    checkChanges = filesArray.find(file => file.includes(name.trim())) || checkChanges;
                }
            } else {
                for (let name of apisLocationArray) {
                    checkChanges = filesArray.includes(name.trim()) || checkChanges;
                }
            }
            if (checkChanges) {
                await execution(apihost, porg, isFolder, apisLocation, datasourceCheck, workspacePath, apikey, githubServer, repoLocation);
            } else {
                core.setOutput('action-result', 'No files changed from the previous commit to send to Discovery Service');
            }
        } else {
            await execution(apihost, porg, isFolder, apisLocation, datasourceCheck, workspacePath, apikey, githubServer, repoLocation);
        }
    } catch (error) {
        core.setFailed(error.message);
    }
}

async function execution(apihost, porg, isFolder, apisLocation, datasourceCheck, workspacePath, apikey, githubServer, repoLocation) {
    try {
        core.info(`apihost ${apihost}`);
        core.info(`porg ${porg}`);
        isFolder && core.info(`apifolders ${apisLocation}`) || core.info(`apifiles ${apisLocation}`);
        core.info(`datasourceCheck ${datasourceCheck}`);

        var resp = await createOrUpdateDiscoveredApi(workspacePath, apihost, apikey, porg, apisLocation, githubServer + '/' + repoLocation, datasourceCheck, isFolder);
        core.info(`response: status: ${resp.status}, message: ${resp.message[0]}`);

        core.setOutput('action-result', `response: status: ${resp.status}, message: ${resp.message[0]}`);

        if (![ 200, 201, 304 ].includes(resp.status)) {
            core.setFailed(resp.message[0]);
        }
    } catch (error) {
        core.setFailed(error.message);
    }
}

run();
