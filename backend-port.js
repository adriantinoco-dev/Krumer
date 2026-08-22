const net = require('net');

function reserveAvailablePort(port) {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.unref();
    server.once('error', (error) => {
      if (error.code === 'EADDRINUSE' || error.code === 'EACCES') {
        resolve(null);
        return;
      }
      reject(error);
    });
    server.listen({ host: '127.0.0.1', port, exclusive: true }, () => {
      const address = server.address();
      const selectedPort = typeof address === 'object' && address ? address.port : null;
      server.close((error) => {
        if (error) reject(error);
        else resolve(selectedPort);
      });
    });
  });
}

async function selectBackendPort(preferredPort = 8765) {
  const availablePreferredPort = await reserveAvailablePort(preferredPort);
  if (availablePreferredPort) return availablePreferredPort;

  const fallbackPort = await reserveAvailablePort(0);
  if (!fallbackPort) throw new Error('Não foi possível reservar uma porta local para o backend.');
  return fallbackPort;
}

module.exports = { reserveAvailablePort, selectBackendPort };
