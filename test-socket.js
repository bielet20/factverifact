const net = require('net');
const fs = require('fs');
const path = require('path');

const socketPath = '/tmp/test_node_socket.sock';

if (fs.existsSync(socketPath)) {
    fs.unlinkSync(socketPath);
}

const server = net.createServer((socket) => {
    socket.write('Hello from Node Socket!\n');
    socket.pipe(socket);
});

server.listen(socketPath, () => {
    console.log(`Node server listening on ${socketPath}`);
    server.close();
    console.log('UNIX SOCKET TEST SUCCESSFUL!');
});

server.on('error', (err) => {
    console.error('UNIX SOCKET TEST FAILED:', err.message);
});
