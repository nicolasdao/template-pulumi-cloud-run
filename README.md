# How to use this template

1. Clone it:
	```
	git clone https://github.com/nicolasdao/template-pulumi-cloud-run.git yourprojectname
	cd yourprojectname
	rm -rf .git/
	npm i
	```
2. Rename the following properties:
	- `package.json`:
		- `name`
		- `description`
		- `repository.url`
		- `bugs.url`
		- `homepage`
	- `Pulumi.yaml`:
		- `name`: Choose a proper name here, because this name is used to name your Cloud Run service using this convention: `name-<STACK>`.
		- `description`
	- `Pulumi.test.yaml`:
		- `config.<your-service-name>.memory`: Replace `<your-service-name>` with the `name` set in the `Pulumi.yaml`. As for the value, choose one of the following unit (e.g., `Gi`, `Mi` or `Ki`) and do not exceed 2Gi (e.g., `512Mi`).
		- `config.<your-service-name>.parentStack`: Pulumi parent stack. This might be optionial, but usually, there is a parent infrastructure. Replace `<your-service-name>` with the `name` set in the `Pulumi.yaml`. 
		- `gcp:project`: Your GCP project ID.
		- `gcp:region`: Your GCP region.
3. Adjust the environment variables needed for your project:
	1. `index.js`: Adjust the `ENV_VARS` variable. 
	2. Make sure that those variables are set up in your GitHub repository's secrets.
	3. Make sure that the following two secrets have been set in your GitHub repository:
		- `GOOGLE_CREDENTIALS`
		- `PULUMI_ACCESS_TOKEN`
	4. If you wish to run this project locally, create a `.env` file in the root folder of this project with all those environment variables. Make sure that `.env` is added to your `.gitignore` to avoid secrets leaking.
	5. In the `.github/workflows/deploy.yml`, in the `Create variables` step, update the environment variables accordingly.
4. Create your microservice in the `app` folder.
	1. Create the NodeJS project using the technique of your choice.
	2. Make sure there is a `Dockerfile` in the `app` folder. Example:
	```
	FROM node:12-slim
	WORKDIR /usr/src/app
	COPY package*.json ./
	RUN npm install --only=prod
	COPY . ./
	CMD npm start
	```
	3. Make sure there is a `.dockerignore` file in the `app` folder. Example:
	```
	Dockerfile
	README.md
	node_modules
	npm-debug.log
	```
	4. If your app relies on any secrets or environment specific configuration, we recommend to leverage the environment variables previously set up. When developing locally, use [`dotenv`](https://www.npmjs.com/package/dotenv) with a new `.env` file similar to step 3.3 and place it inside the `app` folder. 
	> WARNING: Make sure that `.env` is added to your `.gitignore` to avoid secrets leaking.
5. Update this `README.md` file:
	1. Update the following tags:
		 - `<YOUR TITLE HERE>`
		 - `<PROJECT DESCRIPTION>`
		 - `<LOCAL PORT>`
		 - `<TEST ENDPOINT>`
		 - `<PROD ENDPOINT>`
		 - `<ENDPOINT 01>` (e.g., `/v1/user`)
		 - `<ENDPOINT 02>`
		 - `<APP PROJECT DESCRIPTION>`
		 - `<ENV VAR NAME 01>` (e.g., DB_PASSWORD)
		 - `<ENV VAR NAME 02>`
	2. Delete this section.

# <YOUR TITLE HERE>

<PROJECT DESCRIPTION>

# Table of contents

> * [Endpoints](#endpoints)
>	- [Environments](#environments)
>	- [APIs](#apis)
> * [Dev](#dev)
>	- [Project structure](#project-structure)
>		- [Pulumi project](#pulumi-project)
>		- [`app` project](#app-project)
>		- [`.github` workflow](#github-workflow)
>		- [Environment variables](#environment-variables)
>	- [Run locally](#run-locally)
>		- [Developing the App](#developing-the-app)
>		- [Maintaining Pulumi](#maintaining-pulumi)
>		- [Configuring the GitHub workflow](#configuring-the-github-workflow)

# Endpoints
## Environments

- `local`: [http://localhost:<LOCAL PORT>](http://localhost:<LOCAL PORT>)
- `Test`: <TEST ENDPOINT>
- `Prod`: <PROD ENDPOINT>

## APIs

- `/<ENDPOINT 01>`
- `/<ENDPOINT 02>`

# Dev
## Project structure

This project is a NodeJS Pulumi project with an `app` subfolder containing the actual NodeJS microservice. The Pulumi project deploys the `app` (incl. infrastructure) automatically using GitHub Actions. The GitHub workflow is defined under the `.github` folder.

### Pulumi project

- Pulumi is set up in the CI/CD pipeline. This means that you do not need to explicitly install it or use it during the development phase. Simply commit your work to GitHub and the rest is taking care of in the background. If you are required to configure the CI/CD pipeline, then jump to the [Maintaining Pulumi](#maintaining-pulumi) section.
- __Stacks__: They are using the branch convention. This means the branch name is the stack name. You can see the number of configured stack by looking at how many `Pulumi.<STACK>.yaml` are set up in the root folder. As for their set up in the CI/CD pipeline, refer to the `.github/workflows/deploy.yml` file to see which branch triggers a deployment. 
- __Environment variables__: The Pulumi `index.js` file uses environment variables to pass secrets and configuration settings to the stack. Those environment variables are either set up via the [`.github` workflow](#github-workflow) or using `dotenv` locally as explained in the [Maintaining Pulumi](#maintaining-pulumi) section.

### `app` project

<APP PROJECT DESCRIPTION>

### `.github` workflow

`.github/workflows/deploy.yml` is the file that manages the GitHub workflow. That file's main responsibilities are:
1. Define the GitHub events that trigger an automatic deployment.
2. Extract the secrets stored in your GitHub repository and store them safely in environment variables so they are accessible to Pulumi.
3. Deploy the app via `pulumi up`.

### Environment variables

The strategy used to manage environment variables depends on the execution environment.
- __Dev mode on local machine__: In this case, both the Pulumi project and the App project use [`dotenv`](https://www.npmjs.com/package/dotenv). This means that a `.env`(1) file must be added in the root folder to maintain the Pulumi project. That same `.env`(1) file must be added in the `app` folder to maintain the app. 
- __CI/CD pipeline__: In this case, secrets and configuration settings are safely stored and encrypted in the GitHub repository. The `.github/workflows/deploy.yml` extracts them and store them safely in environment variables so they are accessible to Pulumi. Pulumi uses those environment variables in two ways:
	- _Infrastructure_: Pulumi may explicitly use the environment variables to set up a piece of infrastructure.
	- _App_: When possible, Pulumi does not use the environment variables to create the Docker image, as this could be a security risk as well as bad practice (it decreases the reusability and configurability of the image). Instead, Pulumi injects the environment variables in the container when it is created. For more details about this topic, please refer to [the Pulumi official doc](https://www.pulumi.com/docs/reference/pkg/gcp/cloudrun/service/#cloud-run-service-multiple-environment-variables).

> (1) WARNING: This `.env` contains highly sensitive data. A maximum amount of precaution is required by the engineer obtaining it. Make sure that `.env` is added to your `.gitignore` to avoid secrets leaking. Get in touch with your SysAdmin to gain access to that file. 

## Run locally

> PREREQUISITES: You must acquire the `.env` file with the secrets for the specific environment you're targetting. Please get in touch with your SysAdmin. That file contains the following environment variables:
> - <ENV VAR NAME 01>
> - <ENV VAR NAME 02>
> WARNING: Make sure that `.env` is added to your `.gitignore` to avoid secrets leaking.

### Developing the App

> IMPORTANT: Make sure you've added the `.env` under the `app` folder.
> WARNING: Make sure that `.env` is added to your `.gitignore` to avoid secrets leaking.

```
cd app
npm run dev
```

### Maintaining Pulumi

> IMPORTANT: Make sure you've added the `.env` under the __*root*__ folder.
> WARNING: Make sure that `.env` is added to your `.gitignore` to avoid secrets leaking.

The following scripts have been pre-configured in the `package.json`:

| Command | Description |
|:--------|:------------|
| `npm run details:<STACK>` | List the outputs and resource URNs for the <STACK> stack. |
| `npm run preview:<STACK>` | Preview the <STACK> stack changes. |
| `npm run up:<STACK>` | Deploys the <STACK> stack changes. |


### Configuring the GitHub workflow

- The GitHub workflow is configured in the `.github/workflows/deploy.yml` file.
- Be default, that workflows is configured as follow:
	- Triggered by `test` branch pushes. 
	- Ignores changes on the following files:
	```yaml
	  - '**.md'
      - 'LICENSE'
      - '**/*.gitignore'
      - '**/*.eslintrc.json'
      - '**/*.dockerignore'
	```

