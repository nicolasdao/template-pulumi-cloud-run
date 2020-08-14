require('dotenv').config()
const pulumi = require('@pulumi/pulumi')
const gcp = require('@pulumi/gcp')
const { cloudRun } = require('./utils')

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
const PARENT_PROJECT = config.require('parentProject')
const MEMORY = config.require('memory') || '512Mi'
const SERVICE_NAME = `${config.name}-${STACK_NAME}`
const IMAGE_NAME = `${SERVICE_NAME}-image`
const SERVICE_ACCOUNT_NAME = `${SERVICE_NAME}-cloudrun`

// UNCOMMENT THIS CODE SNIPPET TO ALLOW SECURE ACCESS VIA HTTPS TO 'someOtherServiceStack'
// const SOME_OTHER_SERVICE_PROJECT = config.require('someOtherCloudRunProject')
// const SOME_OTHER_SERVICE_NAME = `${SOME_OTHER_SERVICE_PROJECT.split('/').reverse()[0]}-${STACK_NAME}`
// if (!SOME_OTHER_SERVICE_PROJECT)
// 	throw new Error(`Missing required 'someOtherCloudRunProject' in the '${STACK_NAME}' stack config`)
// const someOtherServiceStack = new pulumi.StackReference(`${SOME_OTHER_SERVICE_PROJECT}/${STACK_NAME}`)

if (!PARENT_PROJECT)
	throw new Error(`Missing required 'parentProject' in the '${STACK_NAME}' stack config`)
if (!gcp.config.project)
	throw new Error(`Missing required 'gcp:project' in the '${STACK_NAME}' stack config`)
if (!gcp.config.region)
	throw new Error(`Missing required 'gcp:region' in the '${STACK_NAME}' stack config`)

// Gets the parent stack reference (doc: https://www.pulumi.com/docs/intro/concepts/organizing-stacks-projects/#inter-stack-dependencies)
const infraStack = new pulumi.StackReference(`${PARENT_PROJECT}/${STACK_NAME}`)

const enableCloudRun = cloudRun.enableCloudRun({ dependsOn: [infraStack] })

const dockerImage = cloudRun.uploadDockerImage({ name:IMAGE_NAME }, { dependsOn: [infraStack] })

const serviceAccount = cloudRun.createServiceAccount({ name: SERVICE_ACCOUNT_NAME })

const cloudRunService = cloudRun.createCloudRunVersion({
	name: SERVICE_NAME, 
	memory: MEMORY, 
	envs: [
		...ENV_VARS.map(name => ({ name, value:process.env[name] })),
		// UNCOMMENT THIS CODE SNIPPET TO ALLOW SECURE ACCESS VIA HTTPS TO 'someOtherServiceStack'
		// {
		// 	name: 'SOME_OTHER_SERVICE_ENDPOINT',
		// 	value: someOtherServiceStack.outputs.cloudRunService.url
		// }
	], 
	dockerImage, 
	serviceAccount
}, { dependsOn: [ infraStack, enableCloudRun ] })

// UNCOMMENT THIS CODE SNIPPET TO ALLOW SECURE ACCESS VIA HTTPS TO 'someOtherServiceStack'
// const invokerAccessToDbApiBinding = cloudRun.allowServiceAccountToInvokeService({ 
// 	serviceAccount: { 
// 		name:SERVICE_ACCOUNT_NAME, 
// 		output:serviceAccount 
// 	}, 
// 	cloudRunService: { 
// 		name:SOME_OTHER_SERVICE_NAME, 
// 		output:someOtherServiceStack.outputs.cloudRunService 
// 	}
// }, { 
// 	parent: cloudRunService
// })

// UNCOMMENT THIS CODE SNIPPET TO ALLOW PUBLIC HTTPS ACCESS
// const publicAccessBinding = cloudRun.makePublic({ 
// 	cloudRunService: {
// 		name: SERVICE_NAME,
// 		output: cloudRunService
// 	}
// }, { 
// 	parent:cloudRunService
// })

module.exports = {
	serviceAccount: {
		id: serviceAccount.id,
		name: serviceAccount.name,
		accountId: serviceAccount.accountId,
		email: serviceAccount.email,
		project: serviceAccount.project
	},
	cloudRunService: {
		id: cloudRunService.id,
		name: cloudRunService.name,
		project: cloudRunService.project,
		location: cloudRunService.location,
		url: cloudRunService.status.url,
		serviceAccount: cloudRunService.template.spec.serviceAccountName
	},
	dockerImage: dockerImage.imageName,
	enableCloudRun: enableCloudRun.id,
	// UNCOMMENT THIS CODE SNIPPET TO ALLOW PUBLIC HTTPS ACCESS OR ALLOW SECURE ACCESS VIA HTTPS TO 'someOtherServiceStack'
	// iamPolicies: {
	// 	invokerAccessToDbApiBinding: invokerAccessToDbApiBinding.id,
	// 	publicAccessBinding: publicAccessBinding.id
	// }
}

