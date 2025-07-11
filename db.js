// loads .env first
import dotenv from 'dotenv';
dotenv.config();

import { Connector } from '@google-cloud/cloud-sql-connector';
import mysql from 'mysql2/promise';

const connector = new Connector();

// bootstraps a secure tunnel + TLS for you
const clientOpts = await connector.getOptions({
    instanceConnectionName: process.env.CLOUD_SQL_CONNECTION_NAME,
    ipType: process.env.PRIVATE_IP ? 'PRIVATE' : 'PUBLIC',
});

export const pool = mysql.createPool({
    ...clientOpts,
    user:     process.env.DB_USER,
    password: process.env.DB_PASS,
    database: process.env.DB_NAME,
    waitForConnections: true,
    connectionLimit: 10,
});
