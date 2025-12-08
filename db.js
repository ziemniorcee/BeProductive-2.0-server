import 'dotenv/config';
import { Connector } from '@google-cloud/cloud-sql-connector';
import mysql from 'mysql2/promise';

export let pool;

export async function initDb() {
    pool = mysql.createPool({
        host: process.env.DB_HOST,
        port: process.env.DB_PORT,
        user:     process.env.DB_USER,
        password: process.env.DB_PASS,
        database: process.env.DB_NAME,
        ssl: {
            minVersion: 'TLSv1.2',
            rejectUnauthorized: true
        },
        waitForConnections: true,
        connectionLimit:    10,
        queueLimit: 0
    });

    console.log('🔧 DB pool initialized');
}

// zwracasz pool tam, gdzie go potrzebujesz
export function getPool() {
    if (!pool) throw new Error('Pool not initialized');
    return pool;
}
