'use strict';
const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');
const FormData = require('form-data');
const axios = require('axios');
const AdmZip = require('adm-zip');

const COLLECTOR_TYPE = 'github';
const RECORD_API_VERSION = '1.0';
const MCP_EXTENSIONS = [ '.json', '.yaml', '.yml' ];
const MCP_CLASSIFICATION = 'MCP';
// Keys that hold a map of server name -> server config in MCP client config files
const MCP_SERVER_CONTAINER_KEYS = [ 'mcpServers', 'servers' ];
// process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
const zip = new AdmZip();
const outputFile = 'multipleAPIfiles.zip';

let createOrUpdateDiscoveredApi = async function(workspacePath, apihost, platformApiPrefix, apikey, porg, apisLocation, dataSourceLocation, dataSourceCheck, isFolder, nodeTlsRejectUnauthorized) {
    if (nodeTlsRejectUnauthorized) {
        process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
    }
    if (!apisLocation) {
        return { status: 400, message: [ 'Error: create Or Update Discovered Api not run as API files or API folders parameter is missing or Empty' ] };
    }
    const apisArray = apisLocation.split(',');
    const isMultiple = apisArray.length > 1;
    let resp; let stateUpdateContent;
    let curlUrl = `https://${platformApiPrefix}.${apihost}/discovery/orgs/${porg}/discovered-apis`;
    if (!apikey) {
        return { status: 304, message: [ 'Warning: create Or Update Discovered Api not run as apikey is missing' ] };
    }
    var token = await getAuthToken(apihost, platformApiPrefix, apikey);
    if (dataSourceCheck) {
        await checkAndRegisterDataSource(apihost, platformApiPrefix, token, porg, dataSourceLocation);
    }
    if (!isFolder && !isMultiple) {
        let stats = fs.statSync(path.resolve(apisLocation));
        if (stats.size > 1048576) {
            resp = await sendBulkAPI(dataSourceLocation, workspacePath, apisArray, isFolder, isMultiple, curlUrl, token);
        } else {
            let [ bodyContent, contentType ] = await createFormattedAPI(apisLocation, dataSourceLocation, false);
            resp = await createOrUpdateApiInternal(curlUrl, token, bodyContent, 'POST', contentType);
            if (resp.status === 409) {
                var uuid = resp.message[0].match(/\w{8}-\w{4}-\w{4}-\w{4}-\w{12}/);
                resp = await createOrUpdateApiInternal(curlUrl + '/' + uuid, token, bodyContent, 'PATCH', contentType);
            }
        }
    } else if (isFolder || isMultiple) {
        resp = await sendBulkAPI(dataSourceLocation, workspacePath, apisArray, isFolder, isMultiple, curlUrl, token);
    }

    if (resp.status !== 200 && resp.status !== 201) {
        stateUpdateContent = JSON.stringify({ state: 'unhealthy', message: resp.message.message });
        datasourceStateUpdate(apihost, platformApiPrefix, stateUpdateContent, token, porg, dataSourceLocation);
    }
    return resp;

};

let sendBulkAPI = async function(dataSourceLocation, workspacePath, apisArray, isFolder, isMultiple, curlUrl, token) {
    let resp;
    await zipDirectory(dataSourceLocation, workspacePath, apisArray, isFolder, isMultiple);
    const formData = new FormData();
    // let data = await axios.toFormData({'zip':fs.createReadStream('myfile.zip')},form);
    formData.append('zip', fs.createReadStream(workspacePath + '/' + outputFile), {
        name: outputFile,
        contentType: 'application/zip'
    });
    resp = await createOrUpdateApiInternal(curlUrl + '/bulk', token, formData, 'POST', 'multipart/form-data');
    fs.unlink(outputFile, (err) => {
        if (err) {
            throw err;
        }
    });
    return resp;
};
let zipDirectory = async function(dataSourceLocation, workspacePath, apisArray, isFolder, isMultiple) {
    if (isFolder) {
        for (let folder of apisArray) {
            const fileList = fs.readdirSync(workspacePath + '/' + folder.trim());
            for (let element of fileList) {
                await createFormattedAPI(workspacePath + '/' + folder.trim() + '/' + element, dataSourceLocation, true);
            }
        }
    } else if (isMultiple) {
        for (let element of apisArray) {
            await createFormattedAPI(workspacePath + '/' + element.trim(), dataSourceLocation, true);
        }
    } else {
        await createFormattedAPI(workspacePath + '/' + apisArray[0].trim(), dataSourceLocation, true);
    }
    await zip.writeZip(outputFile);
};

let createFormattedAPI = async function(apisLocation, dataSourceLocation, isAddFilesToZip) {
    let bodyContent; let contentType;
    const fileExtension = path.extname(apisLocation);
    let stringContent = fs.readFileSync(path.resolve(apisLocation), 'utf8');
    if (fileExtension === '.json') {
        bodyContent = JSON.stringify({ api: JSON.parse(stringContent), original_format: 'json', data_source: { source: dataSourceLocation, collector_type: COLLECTOR_TYPE } });
        contentType = 'application/json';
    } else if (fileExtension === '.yaml' || fileExtension === '.yml') {
        bodyContent = JSON.stringify({ api: yaml.load(stringContent), original_format: 'yaml', data_source: { source: dataSourceLocation, collector_type: COLLECTOR_TYPE } });
        contentType = 'application/yaml';
    }
    if (isAddFilesToZip) {
        await zip.addFile(apisLocation.split('/').pop(), bodyContent);
        return;
    } else {
        return [ bodyContent, contentType ];
    }
};

let createOrUpdateApiInternal = async function(curlUrl, token, bodyContent, method, contentType) {
    console.log('createOrUpdateApiInternal');
    try {
        const resp = await axios.post(curlUrl, bodyContent, {
            headers: {
                Authorization: 'Bearer ' + token,
                Accept: 'application/json',
                'Content-Type': contentType,
                'x-ibm-record-api-version': RECORD_API_VERSION,
                responseType: 'text'
            }
        })
        .then(function(res) {
            if (res.status === 201 || res.status === 200) {
                return { status: res.status, message: [ `${method} operation on api has been successful` ] };
            }
            return res.json();
        });
        return resp;
    } catch (err) {
        console.log(err);
        return { status: 500, message: err };
    }
};

let datasourceStateUpdate = async function(apihost, platformApiPrefix, bodyContent, token, porg, dataSourceLocation) {
    let resp;
    try {
        dataSourceLocation = dataSourceLocation.replaceAll('/', '-');
        resp = await axios.patch(`https://${platformApiPrefix}.${apihost}/discovery/orgs/${porg}/data-sources/${dataSourceLocation}`, bodyContent, {
            headers: {
                Authorization: 'Bearer ' + token,
                Accept: 'application/json',
                'Content-Type': 'application/json'
            }
        }).then(response => {
            if (response.data.status === 404) {
                return;
            }
        });
    } catch (error) {
        console.log(error);
        return { status: 500, message: error };
    }
};
let checkAndRegisterDataSource = async function(apihost, platformApiPrefix, token, porg, dataSourceLocation) {
    // Use this function to perform the datasource registration. If the dataSource doesn't exist create it
    let resp;
    try {
        dataSourceLocation = dataSourceLocation.replaceAll('/', '-');
        resp = await axios.get(`https://${platformApiPrefix}.${apihost}/discovery/orgs/${porg}/data-sources/${dataSourceLocation}`, {
            headers: {
                Authorization: 'Bearer ' + token,
                Accept: 'application/json',
                'Content-Type': 'application/json'
            }
        }).then(response => {
            if (response.data.status === 404) {
                const bodyContent = JSON.stringify({ title: dataSourceLocation, collector_type: COLLECTOR_TYPE });
                resp = axios.post(`https://${platformApiPrefix}.${apihost}/discovery/orgs/${porg}/data-sources`, bodyContent, {
                    headers: {
                        Authorization: 'Bearer ' + token,
                        Accept: 'application/json',
                        'Content-Type': 'application/json'
                    }
                });
            }
        });
    } catch (error) {
        return { status: 500, message: error };
    }

};

let getAuthToken = async function(apihost, platformApiPrefix, apikey) {

    var bodyContent = JSON.stringify({ grant_type: 'api_key', api_key: apikey, realm: 'provider/default-idp-2' });
    const token = await axios.post(`https://${platformApiPrefix}.${apihost}/discovery/token`, bodyContent, {
        headers: {
            Accept: 'application/json',
            'Content-Type': 'application/json'
        }
    })
    .then(function(res) {
        return res.data.access_token;
    });
    return token;
};

let isSupportedMcpFile = function(file) {
    return MCP_EXTENSIONS.includes(path.extname(file).toLowerCase());
};

let listMcpFolderFiles = function(workspacePath, folder) {
    const found = [];
    const walk = function(dir) {
        for (const entry of fs.readdirSync(path.join(workspacePath, dir), { withFileTypes: true })) {
            const relativePath = path.posix.join(dir, entry.name);
            if (entry.isDirectory()) {
                walk(relativePath);
            } else if (entry.isFile() && isSupportedMcpFile(entry.name)) {
                found.push(relativePath);
            }
        }
    };
    walk(folder);
    return found;
};

let parseMcpFile = function(absolutePath) {
    const stringContent = fs.readFileSync(absolutePath, 'utf8');
    return path.extname(absolutePath).toLowerCase() === '.json' ? JSON.parse(stringContent) : yaml.load(stringContent);
};

// Identify potential MCP server definitions by the presence of a command or URL.
let isMcpServerDefinition = function(config) {
    if (!config || typeof config !== 'object' || Array.isArray(config)) {
        return false;
    }
    const command = Array.isArray(config.command) ? config.command[0] : config.command;
    const hasCommand = typeof command === 'string' && command.trim() !== '';
    const hasUrl = typeof config.url === 'string' && config.url.trim() !== '';
    return hasCommand || hasUrl;
};

// Identify potential MCP Registry manifests by their name, version, and package or remote definitions.
const isRegistryManifest = doc =>
    typeof doc.name === 'string' &&
    typeof doc.version === 'string' &&
    (
        (Array.isArray(doc.packages) && doc.packages.length > 0) ||
        (Array.isArray(doc.remotes) && doc.remotes.length > 0)
    );

// Extract MCP servers from client configuration files (server maps) or server manifests.
let extractMcpServers = function(doc) {
    if (!doc || typeof doc !== 'object' || Array.isArray(doc) || Object.keys(doc).length === 0) {
        return null;
    }
    // Extract server entries from recognised MCP configuration containers.
    for (const key of MCP_SERVER_CONTAINER_KEYS) {
        const container = doc[key];
        if (container && typeof container === 'object' && !Array.isArray(container)) {
            return Object.entries(container)
            .filter(([ , config ]) => config && typeof config === 'object' && !Array.isArray(config) && Object.keys(config).length > 0)
            .map(([ name, config ]) => ({ name, config }));
        }
    }
    // Identify standalone server definitions or registry manifests.
    return isMcpServerDefinition(doc) || isRegistryManifest(doc) ? [ { name: doc.name, config: doc } ] : null;
};

let buildMcpRecord = function(name, config, sourceFile) {
    const serverName = name ? String(name) : undefined;
    const title = typeof config.title === 'string' && config.title ? config.title : undefined;
    return {
        ...(serverName && { name: serverName.slice(0, 255) }),
        ...(title && { title: title.slice(0, 1023) }),
        ...(typeof config.description === 'string' && { description: config.description }),
        ...(typeof config.version === 'string' && { version: config.version }),
        classification: MCP_CLASSIFICATION,
        content_type: 'application/json',
        content: { name: serverName, ...config, source_file: sourceFile }
    };
};

let buildMcpDiscoveryRequest = function(source, dataSourceLocation) {
    const { workspacePath, files: configuredFiles, folders, changedFiles } = source;
    const skipped = [];
    const records = [];
    let files;
    // Use changed files when available; otherwise collect files from the configured paths.
    if (changedFiles) {
        files = changedFiles;
    } else {
        files = [];
        for (const file of configuredFiles) {
            if (isSupportedMcpFile(file)) {
                files.push(file);
            } else {
                skipped.push({ file, reason: `unsupported file type (only ${MCP_EXTENSIONS.join(', ')} are supported)` });
            }
        }
        for (const folder of folders) {
            try {
                files = files.concat(listMcpFolderFiles(workspacePath, folder));
            } catch (err) {
                skipped.push({ file: folder, reason: err.message });
            }
        }
    }
    // Extract MCP servers from each unique file and build their records.
    for (const file of new Set(files.map(item => path.posix.normalize(item)))) {
        try {
            const doc = parseMcpFile(path.join(workspacePath, file));
            const servers = extractMcpServers(doc);
            if (!servers || servers.length === 0) {
                skipped.push({ file, reason: 'no MCP server definitions found' });
                continue;
            }
            servers.forEach(({ name, config }) => records.push(buildMcpRecord(name, config, file)));
        } catch (err) {
            skipped.push({ file, reason: err.message });
        }
    }
    return {
        request: { data_source: { source: dataSourceLocation, collector_type: COLLECTOR_TYPE }, records },
        skipped
    };
};

let createOrUpdateDiscoveredMcp = async function({ connection, source, dataSourceLocation, dataSourceCheck }) {
    const { apihost, platformApiPrefix, apikey, porg, nodeTlsRejectUnauthorized } = connection;
    const { request, skipped } = buildMcpDiscoveryRequest(source, dataSourceLocation);
    if (request.records.length === 0) {
        return { status: 304, message: [ 'No valid MCP server definitions to send to Discovery Service' ], skipped };
    }
    if (!apikey) {
        return { status: 304, message: [ 'Warning: create Or Update Discovered Mcp not run as apikey is missing' ], skipped };
    }
    const curlUrl = `https://${platformApiPrefix}.${apihost}/discovery/orgs/${porg}/discovered-objects`;
    const headers = {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        'x-ibm-record-api-version': RECORD_API_VERSION
    };

    if (nodeTlsRejectUnauthorized) {
        process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
    }
    var token = await getAuthToken(apihost, platformApiPrefix, apikey);
    if (dataSourceCheck) {
        await checkAndRegisterDataSource(apihost, platformApiPrefix, token, porg, request.data_source.source);
    }
    try {
        const res = await axios.post(curlUrl, JSON.stringify(request), { headers: { ...headers, Authorization: 'Bearer ' + token } });
        if (res.data.queued === false) {
            return { status: res.status, warning: true, message: [ `${res.data.total_submitted} MCP server(s) were received, but none were queued for processing. API Security may be disabled, or the Discovery Service may not be ready.` ], skipped };
        }
        return { status: res.status, message: [ `POST operation on ${res.data.total_submitted} MCP server(s) has been successful` ], skipped };
    } catch (err) {
        console.log(err);
        const response = err.response || {};
        return { status: response.status || 500, message: [ (response.data && response.data.message) || err.message ], skipped };
    }
};

module.exports = { createOrUpdateDiscoveredApi, createOrUpdateDiscoveredMcp, isSupportedMcpFile };
