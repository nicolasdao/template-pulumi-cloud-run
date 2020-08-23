require('dotenv').config()
const pulumi = require('@pulumi/pulumi')
const { cloudRun, stackRef, validate } = require('./utils')

// 1. Validates that the environment variables and configs are available
const ENV_VARS = [
	// UNCOMMENT THIS IF YOU NEED TO PROVIDE A 'GITHUB_PERSONAL_TOKEN' (EXAMPLE: YOU NEED TO INSTALL PRIVATE GITHUB PACKAGES)
	// 'GITHUB_PERSONAL_TOKEN', 
	'DB_NAME',
	'DB_USER',
	'DB_PASSWORD',
	'DB_MASTER_ENDPOINT',
	'DB_READER_ENDPOINT',
	'DB_MAX_CONN'
]

validate.envVars.mustExist(...ENV_VARS)
validate.config.mustExist('gcp:project', 'gcp:region')

// 2. Initilizes common variables
const stackName = pulumi.getStack()
const config = new pulumi.Config()
const serviceName = `${config.name}-${stackName}`
const memory = config.require('memory') || '512Mi'

// 3. Gets other stacks that contain outputs needed for this stack
const stackReference = stackRef.select('infra') // stackRef.select('parent', 'neededOtherStack')

// 4. Creates Docker image for your Cloud Run app
const imageConfig = null
// UNCOMMENT THIS IF YOU NEED TO PROVIDE A 'GITHUB_PERSONAL_TOKEN' (EXAMPLE: YOU NEED TO INSTALL PRIVATE GITHUB PACKAGES)
// const imageConfig = { 
// 	buildArgs: {
// 		GITHUB_TOKEN: process.env.GITHUB_PERSONAL_TOKEN
// 	}
// }
const dockerImage = cloudRun.uploadDockerImage(imageConfig, { dependsOn: [stackReference.infra] })

// 5. Creates a dedicated service account for your Cloud Run service. This helps for security configuration.
const serviceAccount = cloudRun.createServiceAccount({ name:`${serviceName}-cloudrun` })

// 6. Deploys a docker container using the previously created Docker image.
const cloudRunService = cloudRun.deployCloudRunVersion({
	name: serviceName, 
	memory,
	envs: [
		...ENV_VARS.map(name => ({ name, value:process.env[name] })),
		// UNCOMMENT THIS CODE SNIPPET TO PASS ANY CONFIGURATION FROM THE 'stackReference.neededOtherStack' TO THE CODE IN THIS STACK
		// {
		// 	name: 'SOME_OTHER_SERVICE_ENDPOINT',
		// 	value: stackReference.neededOtherStack.outputs.cloudRunService.url
		// }
	], 
	dockerImage, 
	serviceAccount
}, { 
	parent: serviceAccount,
	dependsOn: [ stackReference.infra ] 
})

// UNCOMMENT THIS CODE SNIPPET TO ALLOW SECURE ACCESS VIA HTTPS TO 'stackReference.neededOtherStack'
// // 7. Creates a new binding to allow this Cloud Run service to invoke to other Cloud Run service
// const someOtherServicePolicy = new cloudRun.ServicePolicy(stackReference.neededOtherStack.outputs.cloudRunService)
// const someOtherServiceInvokerBinding = someOtherServicePolicy.addInvokerBinding({
// 	name: `someotherservice-invoker-binding-for-${serviceName}`,
// 	serviceAccounts:[serviceAccount]
// }, {
// 	parent: serviceAccount
// })

// UNCOMMENT THIS CODE SNIPPET TO ALLOW PUBLIC HTTPS ACCESS
// // 8. Creates a new binding to allow public access via HTTPS on this Cloud Run service
// const apiPolicy = new cloudRun.ServicePolicy(cloudRunService)
// const publicAccessBinding = apiPolicy.addPublicAccessBinding({
// 	name: `public-access-binding-for-${serviceName}`
// }, {
// 	parent: cloudRunService
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
	dockerImage: dockerImage.imageName
	// UNCOMMENT THIS CODE SNIPPET TO ALLOW PUBLIC HTTPS ACCESS OR ALLOW SECURE ACCESS VIA HTTPS TO 'stackReference.neededOtherStack'
	// iamPolicies: {
	// 	someOtherServiceInvokerBinding: someOtherServiceInvokerBinding.id,
	// 	publicAccessBinding: publicAccessBinding.id
	// }
}

