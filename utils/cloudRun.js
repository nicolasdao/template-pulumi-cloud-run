const pulumi = require('@pulumi/pulumi')
const gcp = require('@pulumi/gcp')
const docker = require('@pulumi/docker')
const git = require('./git')

const CLOUD_RUN_SERVICE = 'run.googleapis.com'
const GCR_SERVER = 'gcr.io'
const GCR_OAUTH2_USERNAME = 'oauth2accesstoken'
const CLOUD_RUN_INVOKER_ROLE = 'roles/run.invoker'
const ALL_USER_MEMBER = 'allUsers'

/**
 * Enables the 'run.googleapis.com'
 * 
 * @param  {Output<Resource>} 	options.parent
 * @param  {[Output<Resource?]}	options.dependsOn 
 * 
 * @return {Output<String>}		service.id
 */
const enableCloudRun = (options) => {
	// Enables the Cloud Run service (doc: https://www.pulumi.com/docs/reference/pkg/gcp/projects/service/)
	const service = new gcp.projects.Service(CLOUD_RUN_SERVICE, {
		service: CLOUD_RUN_SERVICE
	}, options)

	return service
}

/**
 * Creates a new Docker image with app and deploy it to GCR. 
 * 
 * @param  {String} 			name
 * @param  {Output<Resource>} 	options.parent
 * @param  {[Output<Resource?]}	options.dependsOn 
 * 
 * @return {Output<String>}		dockerImage.imageName
 */
const uploadDockerImage = ({ name }, options) => {
	const config = new pulumi.Config()
	const shortSha = git.shortSha() || 'v1'
	const gcpAccessToken = pulumi.output(gcp.organizations.getClientConfig({}).then(c => c.accessToken))

	// Uploads new Docker image with your app to Google Cloud Container Registry (doc: https://www.pulumi.com/docs/reference/pkg/docker/image/)
	const dockerImage = new docker.Image(name, {
		imageName: pulumi.interpolate`gcr.io/${gcp.config.project}/${config.name}:${shortSha}`,
		build: {
			context: './app'
		},
		registry: {
			server: GCR_SERVER,
			username: GCR_OAUTH2_USERNAME,
			password: pulumi.interpolate`${gcpAccessToken}`
		}
	}, options)

	return dockerImage
}

/**
 * Creates a new Service Account. 
 * 
 * @param  {String} 			name
 * @param  {Output<Resource>} 	options.parent
 * @param  {[Output<Resource?]}	options.dependsOn 
 * 
 * @return {Output<String>}		serviceAccount.id
 * @return {Output<String>}		serviceAccount.name
 * @return {Output<String>}		serviceAccount.accountId
 * @return {Output<String>}		serviceAccount.email
 * @return {Output<String>}		serviceAccount.project
 */
const createServiceAccount = ({ name }, options) => {
	// Creates a new service account for that Cloud Run service (doc: https://www.pulumi.com/docs/reference/pkg/gcp/serviceaccount/account/)
	const serviceAccount = new gcp.serviceAccount.Account(name, {
		accountId: name, // This will automatically create the service account email as follow: <name>@<PROJECT ID>.iam.gserviceaccount.com
		displayName: name
	}, options)

	return serviceAccount
}

/**
 * Deploys a new Cloud Run version based on the GCR image 'dockerImage.imageName'. 
 * 
 * @param  {String} 				name		
 * @param  {Output<DockerImage>} 	dockerImage
 * @param  {String} 				envs[].name
 * @param  {Output<String>} 		envs[].value
 * @param  {String} 				memory			e.g., '512Mi', '1Gi', '1000000Ki'
 * @param  {Output<ServiceAccount>} serviceAccount
 * @param  {Number} 				concurrency		Max is 80. 
 * @param  {Output<Resource>} 		options.parent
 * @param  {[Output<Resource?]}		options.dependsOn 
 * 
 * @return {Output<String>}			cloudRunService.id
 * @return {Output<String>}			cloudRunService.name
 * @return {Output<String>}			cloudRunService.project
 * @return {Output<String>}			cloudRunService.location
 * @return {Output<String>}			cloudRunService.url
 * @return {Output<String>}			cloudRunService.serviceAccount		Service account email
 */
const createCloudRunVersion = ({ name, dockerImage, envs, memory, serviceAccount, concurrency }, options) => {
	const defaultSpec = {}
	if (serviceAccount)
		defaultSpec.serviceAccountName = serviceAccount.email // This is optional. The default is the project's default service account
	defaultSpec.containerConcurrency = concurrency || 80 // 80 is the max. Above this limit, Cloud Run spawn another container.

	// Deploys the new Docker image to Google Cloud Run (doc: https://www.pulumi.com/docs/reference/pkg/gcp/cloudrun/)
	const cloudRunService = new gcp.cloudrun.Service(name, {
		name,
		location: gcp.config.region,
		template: {
			// doc: https://www.pulumi.com/docs/reference/pkg/gcp/cloudrun/service/#servicetemplatespec
			spec: {
				// doc: https://www.pulumi.com/docs/reference/pkg/gcp/cloudrun/service/#servicetemplatespeccontainer
				containers: [{
					envs,
					image: dockerImage.imageName,
					// doc: https://www.pulumi.com/docs/reference/pkg/gcp/cloudrun/service/#servicetemplatespeccontainerresources
					resources: {
						limits: {
							memory // Available units are 'Gi', 'Mi' and 'Ki'
						},
					},
				}],
				...defaultSpec
			},
		},
	}, options)

	return cloudRunService
}

/**
 * Makes the 'cloudRunService' accessible via public HTTPS by adding a new binding
 * that links the 'allUsers' member to the 'roles/run.invoker' role.
 * 
 * @param  {Output<CloudRunService>} 	cloudRunService [description]
 * @param  {Output<Resource>} 			options.parent
 * @param  {[Output<Resource?]}			options.dependsOn
 *  
 * @return {Output<String>}				iamMember.id
 */
const makePublic = ({ cloudRunService }, options) => {
	// Allows this service to be accessed via public HTTPS (doc: https://www.pulumi.com/docs/reference/pkg/gcp/cloudrun/iampolicy/)
	const iamBinding = new gcp.cloudrun.IamBinding(`${cloudRunService.name}-public-invoker`, {
		service: cloudRunService.output.name,
		location: cloudRunService.output.location,
		project: cloudRunService.output.project,
		role: CLOUD_RUN_INVOKER_ROLE,
		members: [ALL_USER_MEMBER]
	}, options)

	return iamBinding
}

/**
 * Allows the 'serviceAccount' to invoke the 'cloudRunService' via HTTPS by adding a new binding
 * that links the 'serviceAccount:<SERVICE ACCOUNT EMAIL>' member to the 'roles/run.invoker' role.
 * 
 * @param  {Output<ServiceAccount>}		serviceAccount
 * @param  {Output<CloudRunService>}	cloudRunService
 * @param  {Output<Resource>} 			options.parent
 * @param  {[Output<Resource?]}			options.dependsOn
 * 
 * @return {Output<String>}				iamBinding.id
 */
const allowServiceAccountToInvokeService = ({ serviceAccount, cloudRunService }, options) => {
	// Allows this service to be accessed via public HTTPS (doc: https://www.pulumi.com/docs/reference/pkg/gcp/cloudrun/iampolicy/)
	const iamBinding = new gcp.cloudrun.IamBinding(`${cloudRunService.name}-invoker-for-${serviceAccount.name}`, {
		service: cloudRunService.output.name,
		location: cloudRunService.output.location,
		project: cloudRunService.output.project,
		role: CLOUD_RUN_INVOKER_ROLE,
		members: [
			pulumi.interpolate`serviceAccount:${serviceAccount.output.email}`
		]
	}, options)

	return iamBinding
}

module.exports = {
	enableCloudRun,
	uploadDockerImage,
	createServiceAccount,
	createCloudRunVersion,
	makePublic,
	allowServiceAccountToInvokeService
}





