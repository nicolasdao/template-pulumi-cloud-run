require('dotenv').config()
const pulumi = require('@pulumi/pulumi')
const gcp = require('@pulumi/gcp')
const docker = require('@pulumi/docker')
const { git } = require('./utils')

// Validates that the environment variables are set up
const ENV_VARS = [
	'DB_NAME',
	'DB_USER',
	'DB_PASSWORD',
	'DB_MASTER_ENDPOINT',
	'DB_READER_ENDPOINT',
	'DB_MAX_CONN'
]

for (let varName of ENV_VARS)
	if (!process.env[varName])
		throw new Error(`Missing required environment variables 'process.env.${varName}'`)

const config = new pulumi.Config()

const STACK_NAME = pulumi.getStack()
const PARENT_STACK = config.require('parentStack')
const MEMORY = config.require('memory') || '512Mi'
const SHORT_SHA = git.shortSha()
const IMAGE_NAME = `${config.name}-${STACK_NAME}-image`

if (!SHORT_SHA)
	throw new Error('This project is not a git repository')
if (!PARENT_STACK)
	throw new Error(`Missing required 'parentStack' in the '${STACK_NAME}' stack config`)
if (!gcp.config.project)
	throw new Error(`Missing required 'gcp:project' in the '${STACK_NAME}' stack config`)
if (!gcp.config.region)
	throw new Error(`Missing required 'gcp:region' in the '${STACK_NAME}' stack config`)

// Gets the parent stack reference (doc: https://www.pulumi.com/docs/intro/concepts/organizing-stacks-projects/#inter-stack-dependencies)
const infraStack = new pulumi.StackReference(`${PARENT_STACK}/${STACK_NAME}`)

// Enables the Cloud Run servicec (doc: https://www.pulumi.com/docs/reference/pkg/gcp/projects/service/)
const enableCloudRun = new gcp.projects.Service('run.googleapis.com', {
	service: 'run.googleapis.com'
}, {
	dependsOn: [infraStack]
})

const gcpAccessToken = pulumi.output(gcp.organizations.getClientConfig({}).then(c => c.accessToken))

// Uploads new Docker image with your app to Google Cloud Container Registry (doc: https://www.pulumi.com/docs/reference/pkg/docker/image/)
const dockerImage = new docker.Image(IMAGE_NAME, {
	imageName: pulumi.interpolate`gcr.io/${gcp.config.project}/${config.name}:${SHORT_SHA}`,
	build: {
		context: './app'
	},
	registry: {
		server: 'gcr.io',
		username: 'oauth2accesstoken',
		password: pulumi.interpolate`${gcpAccessToken}`
	}
}, {
	dependsOn: [infraStack]
})

// Deploys the new Docker image to Google Cloud Run (doc: https://www.pulumi.com/docs/reference/pkg/gcp/cloudrun/)
const cloudRunServiceName = `${config.name}-${STACK_NAME}`
const cloudRunService = new gcp.cloudrun.Service(cloudRunServiceName, {
	name: cloudRunServiceName,
	location: gcp.config.region,
	template: {
		// doc: https://www.pulumi.com/docs/reference/pkg/gcp/cloudrun/service/#servicetemplatespec
		spec: {
			// doc: https://www.pulumi.com/docs/reference/pkg/gcp/cloudrun/service/#servicetemplatespeccontainer
			containers: [{
				envs: ENV_VARS.map(name => ({ name, value:process.env[name] })),
				image: dockerImage.imageName,
				// doc: https://www.pulumi.com/docs/reference/pkg/gcp/cloudrun/service/#servicetemplatespeccontainerresources
				resources: {
					limits: {
						memory: MEMORY // Available units are 'Gi', 'Mi' and 'Ki'
					},
				},
			}],
			containerConcurrency: 80, // 80 is the max. Above this limit, Cloud Run spawn another container.
		},
	},
}, { 
	dependsOn: [
		infraStack,
		enableCloudRun 
	]
})


module.exports = {
	cloudRunService: {
		id: cloudRunService.id,
		url: cloudRunService.status.url
	}, 
	dockerImage: dockerImage.imageName,
	enableCloudRun: enableCloudRun.id
}
