import {requireAuth} from "./auth-middleware.js";
import {pool} from "./db.js";

export class Settings {
    constructor(app) {
        this.app = app
        this.init()
    }

    init() {
        this.getters()
    }

    getters() {
        this.app.get('/api/get-categories', requireAuth, async (req, res) => {
            const userId = req.user.id;
            let conn;

            try {
                conn = await pool.getConnection();

                const [categories] = await conn.execute(
                    `SELECT name, publicId, r, g, b
                     FROM categories
                     WHERE userId = ${userId}
                     ORDER BY id `
                );

                res.json({success: true, categories: categories});

            } catch (err) {
                console.error(err);
                res.status(500).json({success: false, error: err.message});
            } finally {
                if (conn) conn.release();
            }
        })

        this.app.get('/api/get-projects', requireAuth, async (req, res) => {
            const userId = req.user.id;
            let conn;

            try {
                conn = await pool.getConnection();

                const [projects] = await conn.execute(
                    `SELECT P.name as name,
                    P.publicId as publicId,
                    C.publicId AS categoryPublicId,
                    P.x as x,
                    P.y as y,
                    I.svg as svgIcon
             FROM projects P
                      LEFT JOIN categories C ON P.categoryId = C.id
                      LEFT JOIN icons I ON P.iconId = I.id
             WHERE P.userId = ${userId}
             ORDER BY C.publicId `
                );

                res.json({success: true, projects: projects});

            } catch (err) {
                console.error(err);
                res.status(500).json({success: false, error: err.message});
            } finally {
                if (conn) conn.release();
            }
        })

    }
}