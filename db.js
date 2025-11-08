import 'dotenv/config';
import { Connector } from '@google-cloud/cloud-sql-connector';
import mysql from 'mysql2/promise';

export let pool;

export async function initDb() {
    const connector = new Connector();
    const clientOpts = await connector.getOptions({
        instanceConnectionName: process.env.CLOUD_SQL_CONNECTION_NAME.trim(),
        ipType: 'PUBLIC', // albo logika na env PRIVATE_IP
    });

    pool = mysql.createPool({
        ...clientOpts,
        user:     process.env.DB_USER,
        password: process.env.DB_PASS,
        database: process.env.DB_NAME,
        waitForConnections: true,
        connectionLimit:    10,
    });

    console.log('🔧 DB pool initialized');
}

// zwracasz pool tam, gdzie go potrzebujesz
export function getPool() {
    if (!pool) throw new Error('Pool not initialized');
    return pool;
}
