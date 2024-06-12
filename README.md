# Create an APIConnect Discovery Action

The APIConnect Discovery Action allows you to send and keep in sync your OpenAPI reference documents with APIConnect.
The action will sync the documents with the discovery service repository in APIConnect and from there they can be promoted
as required to be managed by APIConnect through their entire lifecycle.

# Usage

See [action.yml](action.yml)

## Parameters required for apic-discovery-action

The following parameters are always required:

- API_HOST - Domain name of the APIConnect instance where discovered APIs will be sent.<br /> &nbsp; Example : `us-east.apiconnect.automation.ibm.com`
- PLATFORM_API_PREFIX - The Platform API prefix has a default value of `platform-api`, the same as the prefix value for APIConnect on Cloud. It can be changed to match your system setup if it is different from the default
- INSECURE_SKIP_TLS_VERIFY - If set to true the action skips the validity check for the server's certificate. This may be required in the case where your APIConnect system is using self-signed certificates. Note: Setting this will make your HTTPS connections insecure.
- PROVIDER_ORG - The provider org name of the APIConnect manager.
- API_FILES - One or more file names of the APIs to sync with the APIConnect discovery repo separated by a comma.<br /> &nbsp; Example : `gmail-api.json,gmail-api.yaml,mit-api.json,APIfolder/petstore-exp.json`
- API_FOLDERS - One or more folder names containing APIs to sync with the APIConnect discovery repo separated by a comma. <br /> &nbsp; Example: `APIFiles, APIFolders`
- resync_check: Indicates if changes to the action like at initial creation should trigger an api-file sync.
- git_diff: (Optional) Git diff between the current and the previous commit. If multiple files have changed in the commit, the workflow will run only if one of the files supplied in `API_FILES` or `API_FOLDERS` has changed.
- apikey - An API Key can be obtained from the APIConnect manager for the user who has access to post the API.<br />
An API key can be created by logging into the APIConnect Manager UI and selecting the "My API Keys" option under the profile icon from the top navigation bar. It is good practice to store any sensitive data like the apikey as a GitHub action secret. See [here](https://docs.github.com/en/actions/security-guides/encrypted-secrets#creating-encrypted-secrets-for-a-repository) for more details. For the sample below the GitHub secret should be called `apicApikey` as it will need to match the following templated value  
${{ secrets.apicApikey }} 

The format of the API documents can be json or yaml. Among the parameters used, either `API_FILES` or `API_FOLDERS` must be supplied according to how the API documents are sent. The APIs can be sent to the APIConnect discovery service in any one of the following ways - single/multiple documents or folder/folders with APIs documents in it. Single and multiple documents will be supplied through the `API_FILES` param and single and multiple folders with many API files inside will be supplied through the `API_FOLDERS` param.<br /> 
To send the documents, create the workflow in your GitHub repository similar to one of the samples below

To create the workflow action in your GitHub repository do the following
1. Create a .github/workflows directory in your repository on GitHub if this directory does not already exist.
2. In the .github/workflows directory, create a file named **discover-api.yml**.
3. Copy the yaml contents of any examples described below into the discover-api.yml file.
4. Update the env variables and secret to match your environment.

```
name: Sync Discovered API with APIConnect

on: [pull_request, workflow_dispatch, push]

env:
  API_HOST: <host-name>
  PLATFORM_API_PREFIX: <platform-api-prefix>
  PROVIDER_ORG: <porg-name>
  API_FILES: <file/files name>

jobs:
  run-discovery:
    runs-on: ubuntu-latest
    steps:
    - uses: actions/checkout@v3
    - name: Difference
      id: difference-output
      run: |
        echo "action_updates=$(git diff --name-only --diff-filter=ACMRT ${{ github.event.before }} ${{ github.sha }} | xargs)" >> $GITHUB_OUTPUT
    - uses: ibm-apiconnect/apic-discovery-action@main
      id: discover-apis
      with:
        api_host: ${{ env.API_HOST }}
        platform_api_prefix: ${{ env.PLATFORM_API_PREFIX }}
        provider_org: ${{ env.PROVIDER_ORG }}
        api_key: ${{ secrets.apicApikey }}
        if: env.API_FILES
        api_files: ${{ env.API_FILES }}
        else if: env.API_FOLDERS
        api_folders: ${{ env.API_FOLDERS }}
        resync_check: ${{ true }}
        git_diff: ${{ steps.difference-output.outputs.action_updates }}
    - name: Display the action-result
      run: |
        echo "Result of the action: ${{ steps.discover-apis.outputs.action-result }}"
        echo "End"  
```

In the above yml content, env and jobs are described to send API documents.<br /> 
The job works as follows, on a push commit to the GitHub repo the specified `api_files` will be sent to the discovery service repo of the given `provider_org` at location `api_host` using the `api_key` to authenticate with the discovery service.<br />
The job will send the git diff of the files between the previous commit and the current commit and the discovery action will verify whether any of the changed files include files supplied in `API_FILES` or `API_FOLDERS`.<br />
`API_FILES` can be replaced with `API_FOLDERS` when the entire folder/folders needs to be sent. This can be used when the git push has multiple files and needs to run the workflow when any of the supplied files changes.

```
name: Sync Discovered API with APIConnect

on: [pull_request, workflow_dispatch, push]

env:
  API_HOST: <host-name>
  PLATFORM_API_PREFIX: <platform-api-prefix>
  PROVIDER_ORG: <porg-name>
  API_FILES: <file/files name>

jobs:
  check_changes_job:
    runs-on: 'ubuntu-20.04'
    # Declare outputs for next jobs
    outputs:
      action_changed: ${{ steps.check_workflow_changed.outputs.action_updates }}
      changed_filename: ${{ steps.changed_filename.outputs.api_file }}
      apifiles_env: ${{ steps.changed_filename.outputs.apifiles_env }}
      folder_changed: ${{ steps.check_apifolders_changed.outputs.folder_updates }}
    steps:
    - uses: actions/checkout@v3
      with:
        fetch-depth: 2
    - name: Check Workflow changed
      id: check_workflow_changed
      run: |
        echo "action_updates=$(git diff --name-only --diff-filter=ACMRT ${{ github.event.before }} ${{ github.sha }} | grep discover-api.yml | xargs)" >> $GITHUB_OUTPUT
    - name: Changed API File Name
      id: changed_filename
      run: |
        echo "api_file=$(git diff --name-only --diff-filter=ACMRT ${{ github.event.before }} ${{ github.sha }} | xargs)" >> $GITHUB_OUTPUT
        echo "apifiles_env=$(echo $API_FILES)" >> $GITHUB_OUTPUT
    - name: Check API Folders changed
      id: check_apifolders_changed
      run: |
        echo "folder_updates=$(git diff --name-only --diff-filter=ACMRT ${{ github.event.before }} ${{ github.sha }} | grep $API_FOLDERS | xargs)" >> $GITHUB_OUTPUT
  run-discovery:
    runs-on: ubuntu-latest
    needs: [ check_changes_job ]
    if: ${{ (contains(needs.check_changes_job.outputs.apifiles_env,needs.check_changes_job.outputs.changed_filename)) || (needs.check_changes_job.outputs.action_changed) || (needs.check_changes_job.outputs.folder_changed) }}
    steps:
    - uses: actions/checkout@v3
    - uses: ibm-apiconnect/apic-discovery-action@main
      id: discover-apis
      with:
        api_host: ${{ env.API_HOST }}
        platform_api_prefix: ${{ env.PLATFORM_API_PREFIX }}
        provider_org: ${{ env.PROVIDER_ORG }}
        api_key: ${{ secrets.apicApikey }}
        if: env.API_FILES
        api_files: ${{ env.API_FILES }}
        else if: env.API_FOLDERS
        api_folders: ${{ env.API_FOLDERS }}
        resync_check: ${{ needs.check_changes_job.outputs.action_changed && true || false }}
    - name: Display the action-result
      run: |
        echo "Result of the action: ${{ steps.discover-apis.outputs.action-result }}"
```

In the above yml content, env and jobs are described to send API documents.<br /> 
The job works as follows, where on a push commit to the GitHub repo the specified `api_files` will be sent to the discovery service repo of the given `provider_org` at location `api_host` using the `api_key` to authenticate with the discovery service.<br /> 
The job will only send the files to the discovery service if any of the mentioned files has been updated and changed in the commit,
or when you first create or update the `discover-api.yml` file.<br /> 
`API_FILES` can be replaced with `API_FOLDERS` when the entire folder/folders needs to be sent. The content can be modified according to the test requirement for sending the APIs

Please refer to [here](https://github.com/ibm-apiconnect/apic-discovery-test) which has working examples of the test repo to be created.

## More details on setting up a sample GitHub Action
For more details on how to set up a GitHub Action workflow in your GitHub repo in general see [the quickstart guide](https://docs.github.com/en/actions/quickstart).
