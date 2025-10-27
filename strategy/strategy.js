import {requireAuth} from "../auth-middleware.js";
import {pool} from "../db.js";

export class Strategy {
    constructor(app) {
        this.app = app
        this.init()
    }

    init() {
        this.getters()
        this.deleters()
        this.updaters()
        this.posters()
    }

    getters() {
        this.app.get('/api/get-strategy', requireAuth, async (req, res) => {
            const userId = req.user.id;
            let conn;
            try {
                conn = await pool.getConnection();

                const [tasks] = await conn.execute(
                    `
                        SELECT * FROM strategy_tasks WHERE userId = ${userId}
                    `
                );

                res.json({success: true, tasks: tasks});

            } catch (err) {
                console.error(err);
                res.status(500).json({success: false, error: err.message});
            } finally {
                if (conn) conn.release();
            }
        })
    }

    deleters() {

    }

    updaters() {

    }

    posters() {
        this.app.post('/api/patch-new-point/', requireAuth, async (req, res) => {
            const changes = JSON.parse(req.query.changes);
            const userId = req.user.id;
            console.log(changes.name, changes.projectPublicId, changes.pointType)
            let conn;
            try {
                conn = await pool.getConnection();
                const [result] = await conn.execute(
                    'INSERT INTO strategy_tasks (userId, name, projectId, taskType) VALUES (?, ?, (SELECT id FROM projects WHERE publicId = ?), ?)',
                    [userId, changes.name, changes.projectPublicId, changes.pointType]
                );

                res.json({success: true, goal: "XDD"});
            } catch (err) {
                console.error(err);
                res.status(500).json({success: false, error: err.message});
            } finally {
                if (conn) conn.release();
            }
        });
    }
}