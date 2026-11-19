'use strict';
const path = require('path');
const core = require('@actions/core');
const { createOrUpdateDiscoveredApi, createOrUpdateDiscoveredMcp, isSupportedMcpFile } = require('./discovery-client');

// most @actions toolkit packages have async methods
async function run() {
    try {
        let isFolder = false;
        const githubServer = new URL(process.env['GITHUB_SERVER_URL']).hostname;
        const repoLocation = process.env['GITHUB_REPOSITORY'];
        const workspacePath = process.env['GITHUB_WORKSPACE'];
        const apihost = core.getInput('api_host');
        const apikey = core.getInput('api_key');
        const porg = core.getInput('provider_org');
        const datasourceCheck = core.getInput('resync_check');
        const apisLocation = core.getInput('api_files') || core.getInput('api_folders');
        const filesChanged = core.getInput('git_diff');
        const platformApiPrefix = core.getInput('platform_api_prefix') ? core.getInput('platform_api_prefix') : 'platform-api';
        const nodeTlsRejectUnauthorized = (core.getInput('insecure_skip_tls_verify').toLowerCase() === 'true');
        const mcpFiles = core.getInput('mcp_files');
        const mcpFolders = core.getInput('mcp_folders');
        const filesArray = filesChanged.split(' ');
        const results = [];

        if (!apisLocation && !mcpFiles && !mcpFolders) {
            core.setFailed('Error: create Or Update Discovered Api/Mcp not run as API files, API folders, MCP files or MCP folders parameter is missing or Empty');
            return;
        }

        // API collection
        if (core.getInput('api_files')) {
            isFolder = false;
        } else if (core.getInput('api_folders')) {
            isFolder = true;
        }
        if (filesChanged.trim() && apisLocation) {
            let checkChanges = false;
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
                results.push(await executeApiCollection(apihost, platformApiPrefix, porg, isFolder, apisLocation, datasourceCheck, workspacePath, apikey, githubServer, repoLocation, nodeTlsRejectUnauthorized));
            } else {
                results.push('No files changed from the previous commit to send to Discovery Service');
            }
        } else if (apisLocation) {
            results.push(await executeApiCollection(apihost, platformApiPrefix, porg, isFolder, apisLocation, datasourceCheck, workspacePath, apikey, githubServer, repoLocation, nodeTlsRejectUnauthorized));
        }

        // MCP collection
        const mcpFilesArray = splitList(mcpFiles);
        const mcpFoldersArray = splitList(mcpFolders);
        if (mcpFilesArray.length > 0 || mcpFoldersArray.length > 0) {
            let changedMcpFiles;
            if (filesChanged.trim()) {
                changedMcpFiles = filesArray.filter(file => isSupportedMcpFile(file) &&
                    (mcpFilesArray.includes(file) || mcpFoldersArray.some(folder => isInFolder(file, folder))));
                core.info(`mcp files changed: ${changedMcpFiles.join(', ') || 'none'}`);
            }
            if (!changedMcpFiles || changedMcpFiles.length > 0) {
                // changedMcpFiles is undefined when git_diff is not provided (collect everything)
                results.push(await executeMcpCollection({
                    connection: { apihost, platformApiPrefix, apikey, porg, nodeTlsRejectUnauthorized },
                    source: { workspacePath, files: mcpFilesArray, folders: mcpFoldersArray, changedFiles: changedMcpFiles },
                    dataSourceLocation: githubServer + '/' + repoLocation,
                    dataSourceCheck: datasourceCheck
                }));
            } else {
                results.push('No MCP files changed from the previous commit to send to Discovery Service');
            }
        } else {
            core.warning('MCP files and MCP folders parameters contain no file or folder names, MCP collection skipped');
            results.push('No valid MCP files or folders specified to send to Discovery Service');
        }

        // Single action-result for both collections
        const output = results.filter(Boolean).join('\n');
        if (output) {
            core.setOutput('action-result', output);
        }
    } catch (error) {
        core.setFailed(error.message);
    }
}

async function executeApiCollection(apihost, platformApiPrefix, porg, isFolder, apisLocation, datasourceCheck, workspacePath, apikey, githubServer, repoLocation, nodeTlsRejectUnauthorized) {
    try {
        core.info(`apihost ${apihost}`);
        core.info(`porg ${porg}`);
        isFolder && core.info(`apifolders ${apisLocation}`) || core.info(`apifiles ${apisLocation}`);
        core.info(`datasourceCheck ${datasourceCheck}`);
        var resp = await createOrUpdateDiscoveredApi(workspacePath, apihost, platformApiPrefix, apikey, porg, apisLocation, githubServer + '/' + repoLocation, datasourceCheck, isFolder, nodeTlsRejectUnauthorized);
        core.info(`response: status: ${resp.status}, message: ${resp.message[0]}`);

        if (![ 200, 201, 304 ].includes(resp.status)) {
            core.setFailed(resp.message[0]);
        }
        return `response: status: ${resp.status}, message: ${resp.message[0]}`;
    } catch (error) {
        core.setFailed(error.message);
    }
}

async function executeMcpCollection(params) {
    try {
        const { connection, source, dataSourceCheck } = params;
        core.info(`apihost ${connection.apihost}`);
        core.info(`porg ${connection.porg}`);
        core.info(`mcpfiles ${source.files.join(', ')}`);
        core.info(`mcpfolders ${source.folders.join(', ')}`);
        core.info(`datasourceCheck ${dataSourceCheck}`);
        var resp = await createOrUpdateDiscoveredMcp(params);
        resp.skipped.forEach(item => core.warning(`Skipping MCP file ${item.file}: ${item.reason}`));
        resp.warning && core.warning(resp.message[0]);
        core.info(`response: status: ${resp.status}, message: ${resp.message[0]}`);

        if (![ 200, 201, 304 ].includes(resp.status)) {
            core.setFailed(resp.message[0]);
        }
        return `response: status: ${resp.status}, message: ${resp.message[0]}`;
    } catch (error) {
        core.setFailed(error.message);
    }
}

function splitList(value) {
    return value.split(',').map(item => item.trim()).filter(Boolean);
}

function isInFolder(file, folder) {
    const dir = path.posix.normalize(folder);
    return path.posix.normalize(file).startsWith(dir.endsWith('/') ? dir : dir + '/');
}

run();
