const { app } = require('@neap/funky')

const ENV_VARS = [
	'DB_API_ENDPOINT'
]

for (let varName of ENV_VARS)
	if (!process.env[varName])
		throw new Error(`Missing required environment variable 'process.env.${varName}'`)

console.log('INFO - All environment variables are properly set')

app.get('/', (req,res) => res.status(200).send('Hello world'))

app.listen({
	native: true,
	port: process.env.PORT,
	service: 'your-service'
})



