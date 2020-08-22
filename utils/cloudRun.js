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
 * @param  {[Output<Resource>]}	options.dependsOn 
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
 * @param  {String}				imageConfig.name				Default is config.name. Used the build the Docker image name: `gcr.io/${gcp.config.project}/${name}:${tag}`
 * @param  {String}				imageConfig.tag					Default is git.shortSha() || 'latest'. Used the build the Docker image name: `gcr.io/${gcp.config.project}/${name}:${tag}`
 * @param  {Object}				imageConfig.buildArgs			Arguments passed to the 'docker build --build-arg ...' command (e.g., { GITHUB_TOKEN:1234 })
 * @param  {Output<Resource>} 	options.parent
 * @param  {[Output<Resource>]}	options.dependsOn 
 * 
 * @return {Output<String>}		dockerImage.imageName
 */
const uploadDockerImage = (imageConfig, options) => {
	let { name, tag, buildArgs } = imageConfig || {}
	const config = new pulumi.Config()
	name = name || config.name
	tag = tag || git.shortSha() || 'latest'
	const gcpAccessToken = pulumi.output(gcp.organizations.getClientConfig({}).then(c => c.accessToken))

	const extraOptions = []
	if (buildArgs)
		for (const arg in buildArgs)
			extraOptions.push('--build-arg', `${arg}='${buildArgs[arg]}'`)

	// Uploads new Docker image with your app to Google Cloud Container Registry (doc: https://www.pulumi.com/docs/reference/pkg/docker/image/)
	const dockerImage = new docker.Image(name, {
		imageName: pulumi.interpolate`gcr.io/${gcp.config.project}/${name}:${tag}`,
		build: {
			context: './app',
			extraOptions
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
 * @param  {[Output<Resource>]}	options.dependsOn 
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
 * @param  {[Output<Resource>]}		options.dependsOn 
 * 
 * @return {Output<String>}			cloudRunService.id
 * @return {Output<String>}			cloudRunService.name
 * @return {Output<String>}			cloudRunService.project
 * @return {Output<String>}			cloudRunService.location
 * @return {Output<String>}			cloudRunService.url
 * @return {Output<String>}			cloudRunService.serviceAccount		Service account email
 */
const deployCloudRunVersion = ({ name, dockerImage, envs, memory, serviceAccount, concurrency }, options) => {
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
 * Creates a Cloud Run service Policy object that can add bindings to it. 
 * 
 * @param {Output<Resource>} cloudRunService
 */
function ServicePolicy(cloudRunService) {
	if (!cloudRunService)
		throw new Error('Missing required argument \'cloudRunService\'')

	/**
	 * Adds a new binding to a Cloud Run service's policy. 
	 * 
	 * @param  {String}						name				Binding's name
	 * @param  {String}						role				e.g., 'roles/run.invoker'
	 * @param  {[Output<Resource>]}			serviceAccounts
	 * @param  {[String]}					members		
	 * @param  {Output<Resource>} 			options.parent
	 * @param  {[Output<Resource>]}			options.dependsOn              
	 * 
	 * @return {Output<Resource>}			iamBinding
	 */
	const addBinding = ({ name, role, serviceAccounts, members }, options) => {
		if (!name)
			throw new Error('Missing required argument \'name\' (binding name)')
		if (!role)
			throw new Error('Missing required argument \'role\'')
		if (!serviceAccounts && !members)
			throw new Error('Missing required argument. One of those two arguments must be specified: \'serviceAccount\' or \'member\'')

		if (members && !Array.isArray(members))
			throw new Error('Invalid argument exception. \'members\' must be an array.')
		if (serviceAccounts && !Array.isArray(serviceAccounts))
			throw new Error('Invalid argument exception. \'serviceAccounts\' must be an array.')

		members = members || []
		if (serviceAccounts && serviceAccounts.length)
			members.push(...serviceAccounts.map(a => pulumi.interpolate`serviceAccount:${a.email}`))

		// Allows this service to be accessed via public HTTPS (doc: https://www.pulumi.com/docs/reference/pkg/gcp/cloudrun/iampolicy/)
		const iamBinding = new gcp.cloudrun.IamBinding(name, {
			service: cloudRunService.name,
			location: cloudRunService.location,
			project: cloudRunService.project,
			role,
			members
		}, options)

		return iamBinding
	}

	this.addBinding = addBinding
	this.addPublicAccessBinding = ({ name }, options) => addBinding({ name, role:CLOUD_RUN_INVOKER_ROLE, members:[ALL_USER_MEMBER] }, options)
	this.addInvokerBinding = ({ name, serviceAccounts, members }, options) => addBinding({ name, role:CLOUD_RUN_INVOKER_ROLE, serviceAccounts, members }, options)

	return this
}

module.exports = {
	enableCloudRun,
	uploadDockerImage,
	createServiceAccount,
	deployCloudRunVersion,
	ServicePolicy
}





