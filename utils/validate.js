const pulumi = require('@pulumi/pulumi')
const gcp = require('@pulumi/gcp')

const stackConfig = new pulumi.Config()
const stackName = pulumi.getStack()

const config = {
	mustExist: (...configNames) => {
		for (let name of configNames) {
			if (name.indexOf('gcp:') == 0) {
				const key = name.replace('gcp:', '').split('.')[0].split('[')[0]
				if (!gcp.config[key])
					throw new Error(`Missing required 'gcp:${key}' in the '${stackName}' stack config`)
			} else if (!stackConfig.require(name))
				throw new Error(`Missing required '${stackConfig.name}:${name}' in the '${stackName}' stack config`)
		}
	}
}

const envVars = {
	mustExist: (...varNames) => {
		for (let varName of varNames)
			if (!process.env[varName])
				throw new Error(`Missing required environment variables 'process.env.${varName}'`)
	}
}

module.exports = {
	config,
	envVars
}