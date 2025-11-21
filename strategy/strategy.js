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
                        SELECT S.publicId,
                               S.name,
                               S.deadline,
                               S.checkState,
                               P.publicId AS projectPublicId,
                               S.x,
                               S.y,
                               S.taskType,
                               COALESCE(
                                       (SELECT JSON_ARRAYAGG(ST_child.publicId)
                                        FROM strategy_connections SC
                                                 JOIN strategy_tasks ST_child ON SC.taskToId = ST_child.id
                                        WHERE SC.taskFromId = S.id
                                       ),
                                       JSON_ARRAY()
                               ) AS children
                        FROM strategy_tasks S
                                 LEFT JOIN projects P ON S.projectId = P.id
                        WHERE S.userId = ${userId}
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
        this.app.delete('/api/remove-node/', requireAuth, async (req, res) => {
            const id = req.query.nodeId;
            const userId = req.user.id;
            let conn;
            try {
                conn = await pool.getConnection();
                const [result] = await conn.execute(
                    'DELETE FROM strategy_tasks WHERE publicId = ? AND userId = ?',
                    [id, userId]
                );
                res.json({success: true, deleted: result.affectedRows});
            }
            catch (err) {
                console.error(err);
                res.status(500).json({success: false, error: err.message});
            } finally {
                if (conn) conn.release();
            }
        })

        this.app.delete('/api/remove-edge/', requireAuth, async (req, res) => {
            const startNodeId = req.query.parentPublicId;
            const endNodeId = req.query.childPublicId;
            const userId = req.user.id;
            let conn;
            try {
                conn = await pool.getConnection();
                const [result] = await conn.execute(
                    'DELETE FROM strategy_connections WHERE taskFromId = (SELECT id FROM strategy_tasks WHERE publicId = ?) AND taskToId = (SELECT id FROM strategy_tasks WHERE publicId = ?) AND userId = ?',
                    [startNodeId, endNodeId, userId]
                );
                res.json({success: true, deleted: result.affectedRows});
            } catch (err) {
                console.error(err);
                res.status(500).json({success: false, error: err.message});
            } finally {
                if (conn) conn.release();
            }
        })
    }

    updaters() {
        this.app.patch('/api/change-point-position/', requireAuth, async (req, res) => {
            const id = req.query.id;
            const newPosition = JSON.parse(req.query.newPosition);
            const userId = req.user.id;
            let conn;
            try {
                conn = await pool.getConnection();

                // 2 ▸ parameterised query (keeps SQL-injection out)
                const [result] = await conn.execute(
                    'UPDATE strategy_tasks SET x = ?, y = ? WHERE publicId = ? AND userId = ?',
                    [newPosition["x"], newPosition["y"], id, userId]
                );

                // 3 ▸ report how many rows were touched
                res.json({success: true, updated: result.affectedRows});
            } catch (err) {
                console.error(err);
                res.status(500).json({success: false, error: err.message});
            } finally {
                if (conn) conn.release();
            }
        });
    }

    posters() {
        this.app.post('/api/save-new-point/', requireAuth, async (req, res) => {
            const changes = JSON.parse(req.query.changes);
            const userId = req.user.id;
            let conn;
            try {
                conn = await pool.getConnection();
                const [result] = await conn.execute(
                    'INSERT INTO strategy_tasks (publicId,userId, name, projectId, taskType, x, y) VALUES ' +
                    '(?,?, ?, (SELECT id FROM projects WHERE publicId = ?), ?, ?, ?)',
                    [changes.publicId,userId, changes.name, changes.projectPublicId, changes.taskType, changes.x, changes.y]
                );

                res.json({success: true, goal: "XDD"});
            } catch (err) {
                console.error(err);
                res.status(500).json({success: false, error: err.message});
            } finally {
                if (conn) conn.release();
            }
        });

        this.app.post('/api/create-link/', requireAuth, async (req, res) => {
            const startNodeId = req.query.startNodeId;
            const endNodeId = req.query.endNodeId;

            const userId = req.user.id;
            let conn;
            try {
                conn = await pool.getConnection();
                const [result] = await conn.execute(
                    'INSERT INTO strategy_connections (userId, taskFromId, taskToId) VALUES ' +
                    '(?, (SELECT id FROM strategy_tasks WHERE publicId = ?), (SELECT id FROM strategy_tasks WHERE publicId = ?))',
                    [userId, startNodeId, endNodeId ]
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