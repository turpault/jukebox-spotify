import { spawn } from 'child_process';

async function checkServerReady(maxAttempts = 30): Promise<boolean> {
  for (let i = 0; i < maxAttempts; i++) {
    try {
      const response = await fetch('http://localhost:3000');
      if (response.ok) {
        return true;
      }
    } catch (error) {
      // Server not ready yet
    }
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  return false;
}

async function startServer(): Promise<void> {
  console.log('Starting server...');
  const serverProcess = spawn('bun', ['server.ts'], {
    stdio: 'pipe',
    detached: false
  });

  // Pipe server output
  serverProcess.stdout?.on('data', (data) => {
    process.stdout.write(`[Server] ${data}`);
  });
  serverProcess.stderr?.on('data', (data) => {
    process.stderr.write(`[Server] ${data}`);
  });

  serverProcess.on('error', (error) => {
    console.error('Failed to start server:', error);
    process.exit(1);
  });

  // Wait for server to be ready
  const ready = await checkServerReady();
  if (!ready) {
    console.error('Server failed to start within timeout');
    serverProcess.kill();
    process.exit(1);
  }
  console.log('Server is ready');
}

async function main() {
  try {
    // Start the server
    await startServer();

    console.log('Application is running.');
    console.log('Open http://localhost:3000 in your browser.');
    console.log('Connecting to go-librespot on port 3678...');
    console.log('Press Ctrl+C to exit.');

    // Keep the process alive
    process.on('SIGINT', async () => {
      console.log('\nShutting down...');
      process.exit(0);
    });

    process.on('SIGTERM', async () => {
      console.log('\nShutting down...');
      process.exit(0);
    });

  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

main();
