const app = require('express')()
const path = require('path')
const cluster = require('cluster')
const http = require('http')

const { Server } = require('socket.io')
const redisAdapter = require('socket.io-redis')
const { setupMaster, setupWorker } = require('@socket.io/sticky')
const { setupPrimary } = require('@socket.io/cluster-adapter')

const { createClient } = require("redis");
const { createAdapter } = require("@socket.io/redis-adapter");

const { Emitter } = require("@socket.io/redis-emitter");

const numProcesses = 4


// Server html file in index
app.get('/', (req, res) => {
	res.sendFile('index.html', {root: path.join(__dirname)})
})


// Code ở dưới em tham khảo ở trang chủ của socket.io 
// phần Server -> Using multiple nodes (sử dụng cluster node.js)
if (cluster.isMaster) {
	console.log(`Master ${process.pid} is running.`)

	const httpServer = http.createServer(app);
	setupMaster(httpServer, {
		loadBalancingMethod: "round-robin",
	})

	setupPrimary()

	httpServer.listen(3000)

	for(let i = 0; i < numProcesses; i++){
		cluster.fork()
	}

	cluster.on("exit", (worker) => {
		console.log(`Worker ${worker.process.pid} died`)
		cluster.fork()
	})
}
else {
	console.log(`Worker ${process.pid} started`);

	const httpServer = http.createServer(app)
	const io = new Server(httpServer)

	// Setup emiiter để giao tiếp giữa các process
	// code từ document socket.io -> Adapters -> Redis adapter
	const pubClient = createClient({ host: "localhost", port: 6379 });
	const subClient = pubClient.duplicate();

	const emitter = new Emitter(pubClient)

	io.adapter(createAdapter(pubClient, subClient));

	setupWorker(io)

	io.on("connection", (socket) => {
		socket.on("message", (data) => {
			emitter.emit("notifications", {
				from: socket.id,
				content: data
			})
		})

	})
}
