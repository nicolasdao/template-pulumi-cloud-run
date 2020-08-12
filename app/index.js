const { app } = require('@neap/funky')

app.get('/', (req,res) => res.status(200).send(`Hello world`))

app.listen({
	native: true,
	port: process.env.PORT,
	service: 'your-service'
})



