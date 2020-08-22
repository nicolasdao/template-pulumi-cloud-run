const pulumi = require('@pulumi/pulumi')


const select = (...projects) => {
	const config = new pulumi.Config()
	const stackName = pulumi.getStack()
	const projectRef = config.requireObject('projectRef')
	if (!projectRef)
		throw new Error(`Missing '${config.name}:projectRef' in ${stackName} stack config`)

	const stackRef = {}
	for (let project of projects) {
		if (!projectRef[project])
			throw new Error(`Missing '${config.name}:projectRef.${project}' in ${stackName} stack config`)

		const projectStack = `${projectRef[project]}/${stackName}`
		// Gets the parent stack reference (doc: https://www.pulumi.com/docs/intro/concepts/organizing-stacks-projects/#inter-stack-dependencies)
		stackRef[project] = new pulumi.StackReference(projectStack)

		if (!stackRef[project])
			throw new Error(`Project stack '${projectStack}' not found`)
	}

	return stackRef
}

module.exports = {
	select
}