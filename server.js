import express from 'express';
import cors from 'cors';
import {pool} from './db.js';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import {requireAuth} from "./auth-middleware.js";
import {Todo} from "./todo/todo.js";
import {Settings} from "./settings.js";

export class Server {
    constructor() {
        this.app = express();
        this.todo = new Todo(this.app)
        this.settings = new Settings(this.app)
        this.init()
    }

    init() {
        const port = process.env.PORT || 8080;

        this.app.use(cors({
            origin: process.env.CLIENT_ORIGIN || '*'
        }));

        this.app.use(express.json());

        this.app.listen(port, '0.0.0.0', () => {
            console.log(`API server listening on http://localhost:${port}`);
        });

        this.getters()
    }

    getters() {
        // Example: GET /api/time → returns current DB time
        this.app.get('/api/time', async (req, res) => {
            let conn;
            try {
                conn = await pool.getConnection();
                const [rows] = await conn.query('SELECT NOW() AS now');
                res.json({success: true, time: rows[0].now});
            } catch (err) {
                console.error(err);
                res.status(500).json({success: false, error: err.message});
            } finally {
                if (conn) conn.release();
            }
        });

        // POST /api/users — register a new user
        this.app.post('/api/users', async (req, res) => {
            const {email, password, first_name, last_name} = req.body;

            // 1) Basic validation
            if (!email || !password || !first_name) {
                return res
                    .status(400)
                    .json({success: false, error: 'Email, password and first name are required'});
            }

            let conn;
            try {
                conn = await pool.getConnection();

                // 2) Check for existing email
                const [existing] = await conn.execute(
                    'SELECT id FROM users WHERE email = ?',
                    [email]
                );
                if (existing.length > 0) {
                    return res
                        .status(409)
                        .json({success: false, error: 'Email already in use'});
                }

                // 3) Hash the password
                const saltRounds = 10;
                const password_hash = await bcrypt.hash(password, saltRounds);

                // 4) Insert new user
                const [result] = await conn.execute(
                    `INSERT INTO users
                 (email, password_hash, first_name, last_name)
             VALUES (?, ?, ?, ?)`,
                    [email, password_hash, first_name, last_name || null]
                );

                // 5) Don’t return the hash to the client!
                res
                    .status(201)
                    .json({success: true, userId: result.insertId});
            } catch (err) {
                console.error('Error creating user:', err);
                res
                    .status(500)
                    .json({success: false, error: 'Server error'});
            } finally {
                if (conn) conn.release();
            }
        });

        this.app.post('/api/login', async (req, res) => {
            const {email, password} = req.body;

            // 1) Basic validation
            if (!email || !password) {
                return res
                    .status(400)
                    .json({success: false, error: 'Email and password are required'});
            }

            let conn;
            try {
                conn = await pool.getConnection();

                // 2) Find the user by email
                const [rows] = await conn.execute(
                    'SELECT id, password_hash, first_name, last_name FROM users WHERE email = ?',
                    [email]
                );
                if (rows.length === 0) {
                    return res
                        .status(401)
                        .json({success: false, error: 'Invalid credentials'});
                }
                const user = rows[0];

                // 3) Compare the password
                const valid = await bcrypt.compare(password, user.password_hash);
                if (!valid) {
                    return res
                        .status(401)
                        .json({success: false, error: 'Invalid credentials'});
                }

                // 4) Create a JWT
                const payload = {sub: user.id, name: user.first_name, email};
                const token = jwt.sign(payload, process.env.JWT_SECRET, {
                    expiresIn: process.env.JWT_EXPIRES_IN || '1h'
                });

                // 5) Send it back
                res.json({success: true, token});
            } catch (err) {
                console.error('Login error:', err);
                res.status(500).json({success: false, error: 'Server error'});
            } finally {
                if (conn) conn.release();
            }
        });
    }


}



















