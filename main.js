import 'dotenv/config';
import { initDb }    from './db.js';
import { Server }    from './server.js';

async function bootstrap() {
    await initDb();

    // 2) Create your server and configure routes
    const server = new Server();

    server.configure();
    server.listen();
}

bootstrap().catch(err => {
    console.error('❌ Failed to start application:', err);
    process.exit(1);
});
