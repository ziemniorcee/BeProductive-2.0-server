import {requireAuth} from "../auth-middleware.js";
import {pool} from "../db.js";

export class Todo {
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
        this.app.get('/api/get-deadlines', requireAuth, async (req, res) => {

            const userId = req.user.id;
            let conn;

            try {
                conn = await pool.getConnection();

                const [tasks] = await conn.execute(
                    `SELECT T.publicId   AS taskPublicId,
                            T.name       AS name,
                            T.checkState AS checkState,
                            T.goalPos    AS goalPos,
                            T.importance AS importance,
                            T.addDate    AS addDate,
                            T.dateType   AS dateType
                     FROM todo_tasks T
                     WHERE T.userId = ${userId}
                       and T.addDate > "${req.query.date}"
                       and T.dateType = 1

                     ORDER BY addDate, goalPos`
                );
                res.json({success: true, tasks: tasks});

            } catch (err) {
                console.error(err);
                res.status(500).json({success: false, error: err.message});
            } finally {
                if (conn) conn.release();
            }
        })

        this.app.get('/api/get-my-day', requireAuth, async (req, res) => {
            const userId = req.user.id;
            let conn;

            try {
                conn = await pool.getConnection();

                let project_order = ""
                let project_where = "AND 1 = 0 "
                let split = req.query.queue_order.split(',').map(x => `"${x}"`)

                if (req.query.queue_order !== "") {
                    project_order = `FIELD(P.publicId, ${split.join(',')}),`
                    project_where = `AND P.publicId IN (${split.join(',')})`
                }

                const [tasks] = await conn.execute(
                    `(
                      SELECT
                        T.id               AS taskId,
                        T.publicId         AS taskPublicId,
                        T.name             AS name,
                        T.note             AS note,
                        T.checkState       AS checkState,
                        T.goalPos          AS goalPos,
                        C.publicId         AS categoryPublicId,
                        T.importance       AS importance,
                        P.publicId         AS projectPublicId,
                        T.addDate          AS addDate,
                        T.dateType         AS dateType
                      FROM todo_tasks T
                        LEFT JOIN categories C ON T.categoryId = C.id
                        LEFT JOIN projects  P ON T.projectId   = P.id
                      WHERE
                        T.userId       = ${userId}
                        ${project_where}
                        AND T.checkState = 0
                        AND T.dateType = 0
                        AND (T.addDate IS NULL OR T.addDate = '')
                      ORDER BY
                        ${project_order}
                        T.importance DESC,
                        T.goalPos
                      LIMIT 10
                    )
                    UNION ALL
                    (
                      SELECT
                        T.id               AS taskId,
                        T.publicId         AS taskPublicId,
                        T.name             AS name,
                        T.note             AS note,
                        T.checkState       AS checkState,
                        T.goalPos          AS goalPos,
                        C.publicId         AS categoryPublicId,
                        T.importance       AS importance,
                        P.publicId         AS projectPublicId,
                        T.addDate          AS addDate,
                        T.dateType         AS dateType
                      FROM todo_tasks T
                        LEFT JOIN categories C ON T.categoryId = C.id
                        LEFT JOIN projects  P ON T.projectId   = P.id
                      WHERE
                        T.userId       = ${userId}
                        AND T.checkState = 0
                        AND T.addDate   > '${req.query.date}'
                        AND T.dateType  = 1
                      ORDER BY
                        T.addDate
                      LIMIT 10
                    )
                    UNION ALL
                    (
                      SELECT
                        T.id               AS taskId,
                        T.publicId         AS taskPublicId,
                        T.name             AS name,
                        T.note             AS note,
                        T.checkState       AS checkState,
                        T.goalPos          AS goalPos,
                        C.publicId         AS categoryPublicId,
                        T.importance       AS importance,
                        P.publicId         AS projectPublicId,
                        T.addDate          AS addDate,
                        T.dateType         AS dateType
                      FROM todo_tasks T
                        LEFT JOIN categories C ON T.categoryId = C.id
                        LEFT JOIN projects  P ON T.projectId   = P.id
                      WHERE
                        T.userId       = ${userId}
                        AND T.checkState = 0
                        AND (T.dateType IN (2,3) or T.dateType IN (0, 1) and T.addDate = '${req.query.date}')
                      ORDER BY
                        T.goalPos
                      LIMIT 10
                    ) ORDER BY FIELD(dateType, 2, 1, 0, 3)`
                );

                if (tasks.length === 0) {
                    return res.json({success: true, tasks: []});
                }

                // Fetch all steps for those tasks in one go
                const taskIds = tasks.map(t => t.taskId);
                const [steps] = await conn.execute(
                    `SELECT id, goalId, name, stepCheck, publicId
                     FROM steps
                     WHERE goalId IN (${taskIds.join(',')})`,
                );

                // Group steps by task_id
                const stepsByTask = steps.reduce((acc, step) => {
                    acc[step.goalId] = acc[step.goalId] || [];
                    acc[step.goalId].push({
                        publicId: step.publicId,
                        name: step.name,
                        stepCheck: !!step.stepCheck
                    });
                    return acc;
                }, {});
                const tasksWithSteps = tasks.map(task => ({
                    publicId: task.taskPublicId,
                    name: task.name,
                    note: task.note,
                    addDate: task.addDate,
                    checkState: task.checkState,
                    categoryPublicId: task.categoryPublicId,
                    importance: task.importance,
                    projectPublicId: task.projectPublicId,
                    goalPos: task.goalPos,
                    dateType: task.dateType,
                    steps: stepsByTask[task.taskId] || []
                }));
                res.json({success: true, tasks: tasksWithSteps});

            } catch (err) {
                console.error(err);
                res.status(500).json({success: false, error: err.message});
            } finally {
                if (conn) conn.release();
            }
        })

        this.app.get('/api/get-day-view', requireAuth, async (req, res) => {
            const userId = req.user.id;
            let conn;

            try {
                conn = await pool.getConnection();

                const [tasks] = await conn.execute(
                    `
                        SELECT T.id         AS taskId,
                               T.publicId   AS taskPublicId,
                               T.name       AS name,
                               T.checkState AS checkState,
                               T.goalPos    AS goalPos,
                               C.publicId   AS categoryPublicId,
                               T.importance AS importance,
                               P.publicId   AS projectPublicId,
                               T.addDate    AS addDate,
                               T.dateType   AS dateType
                        FROM todo_tasks T
                                 LEFT JOIN categories C ON T.categoryId = C.id
                                 LEFT JOIN projects P ON T.projectId = P.id
                        WHERE T.userId = ${userId}
                          AND T.addDate = '${req.query.date}'
                          AND T.dateType IN (0, 1)
                        ORDER BY T.goalPos
                    `
                );

                if (tasks.length === 0) {
                    return res.json({success: true, tasks: []});
                }

                // Fetch all steps for those tasks in one go
                const taskIds = tasks.map(t => t.taskId);
                const [steps] = await conn.execute(
                    `SELECT id, goalId, name, stepCheck, publicId
                     FROM steps
                     WHERE goalId IN (${taskIds.join(',')})`,
                );

                // Group steps by task_id
                const stepsByTask = steps.reduce((acc, step) => {
                    acc[step.goalId] = acc[step.goalId] || [];
                    acc[step.goalId].push({
                        publicId: step.publicId,
                        name: step.name,
                        stepCheck: !!step.stepCheck
                    });
                    return acc;
                }, {});
                const tasksWithSteps = tasks.map(task => ({
                    publicId: task.taskPublicId,
                    name: task.name,
                    addDate: task.addDate,
                    checkState: task.checkState,
                    categoryPublicId: task.categoryPublicId,
                    importance: task.importance,
                    projectPublicId: task.projectPublicId,
                    goalPos: task.goalPos,
                    dateType: task.dateType,
                    steps: stepsByTask[task.taskId] || []
                }));
                res.json({success: true, tasks: tasksWithSteps});

            } catch (err) {
                console.error(err);
                res.status(500).json({success: false, error: err.message});
            } finally {
                if (conn) conn.release();
            }
        })

        this.app.get('/api/get-week-view', requireAuth, async (req, res) => {
            const userId = req.user.id;
            let conn;

            let dates_split = req.query.dates.split(',')

            try {
                conn = await pool.getConnection();

                const [tasks] = await conn.execute(
                    `
                        SELECT T.id         AS taskId,
                               T.publicId   AS taskPublicId,
                               T.name       AS name,
                               T.checkState AS checkState,
                               T.goalPos    AS goalPos,
                               C.publicId   AS categoryPublicId,
                               T.importance AS importance,
                               P.publicId   AS projectPublicId,
                               T.addDate    AS addDate,
                               T.dateType   AS dateType
                        FROM todo_tasks T
                                 LEFT JOIN categories C ON T.categoryId = C.id
                                 LEFT JOIN projects P ON T.projectId = P.id
                        WHERE T.userId = ${userId}
                          AND T.addDate between '${dates_split[0]}' and '${dates_split[6]}'
                          AND T.dateType IN (0, 1)
                          and T.checkState = 0
                        ORDER BY T.goalPos
                    `
                );

                if (tasks.length === 0) {
                    return res.json({success: true, tasks: []});
                }

                // Fetch all steps for those tasks in one go
                const taskIds = tasks.map(t => t.taskId);
                const [steps] = await conn.execute(
                    `SELECT id, goalId, name, stepCheck, publicId
                     FROM steps
                     WHERE goalId IN (${taskIds.join(',')})`,
                );

                // Group steps by task_id
                const stepsByTask = steps.reduce((acc, step) => {
                    acc[step.goalId] = acc[step.goalId] || [];
                    acc[step.goalId].push({
                        publicId: step.publicId,
                        name: step.name,
                        stepCheck: !!step.stepCheck
                    });
                    return acc;
                }, {});
                const tasksWithSteps = tasks.map(task => ({
                    publicId: task.taskPublicId,
                    name: task.name,
                    addDate: task.addDate,
                    checkState: task.checkState,
                    categoryPublicId: task.categoryPublicId,
                    importance: task.importance,
                    projectPublicId: task.projectPublicId,
                    goalPos: task.goalPos,
                    dateType: task.dateType,
                    steps: stepsByTask[task.taskId] || []
                }));
                res.json({success: true, tasks: tasksWithSteps});

            } catch (err) {
                console.error(err);
                res.status(500).json({success: false, error: err.message});
            } finally {
                if (conn) conn.release();
            }
        })

        this.app.get('/api/get-month-view', requireAuth, async (req, res) => {
            const userId = req.user.id;
            let conn;

            let dates_split = req.query.dates.split(',')

            try {
                conn = await pool.getConnection();

                const [tasks] = await conn.execute(
                    `SELECT T.publicId AS publicId,
                            C.publicId AS categoryPublicId,
                            T.name     AS name,
                            T.addDate  AS addDate,
                            T.importance AS importance,
                            T.dateType AS dateType
                     FROM todo_tasks T
                              LEFT JOIN categories C ON T.categoryId = C.id
                     WHERE T.userId = ${userId}
                       AND T.addDate between '${dates_split[0]}' and '${dates_split[6]}'
                       and T.dateType IN (0, 1)
                       and T.checkState = 0

                     ORDER BY addDate, goalPos`
                );

                res.json({success: true, tasks: tasks});

            } catch (err) {
                console.error(err);
                res.status(500).json({success: false, error: err.message});
            } finally {
                if (conn) conn.release();
            }
        })

        this.app.get('/api/get-project-view', requireAuth, async (req, res) => {
            const userId = req.user.id;
            let conn;
            try {
                conn = await pool.getConnection();

                const [tasks] = await conn.execute(
                    `
                        SELECT T.id         AS taskId,
                               T.publicId   AS taskPublicId,
                               T.name       AS name,
                               T.checkState AS checkState,
                               T.goalPos    AS goalPos,
                               C.publicId   AS categoryPublicId,
                               T.importance AS importance,
                               P.publicId   AS projectPublicId,
                               T.addDate    AS addDate,
                               T.dateType   AS dateType
                        FROM todo_tasks T
                                 LEFT JOIN categories C ON T.categoryId = C.id
                                 LEFT JOIN projects P ON T.projectId = P.id
                        WHERE T.userId = ${userId}
                          AND P.publicId = "${req.query.project_id}"
                        ORDER BY T.goalPos
                    `
                );
                if (tasks.length === 0) {
                    return res.json({success: true, tasks: []});
                }

                // Fetch all steps for those tasks in one go
                const taskIds = tasks.map(t => t.taskId);
                const [steps] = await conn.execute(
                    `SELECT id, goalId, name, stepCheck, publicId
                     FROM steps
                     WHERE goalId IN (${taskIds.join(',')})`,
                );

                // Group steps by task_id
                const stepsByTask = steps.reduce((acc, step) => {
                    acc[step.goalId] = acc[step.goalId] || [];
                    acc[step.goalId].push({
                        publicId: step.publicId,
                        name: step.name,
                        stepCheck: !!step.stepCheck
                    });
                    return acc;
                }, {});
                const tasksWithSteps = tasks.map(task => ({
                    publicId: task.taskPublicId,
                    name: task.name,
                    addDate: task.addDate,
                    checkState: task.checkState,
                    categoryPublicId: task.categoryPublicId,
                    importance: task.importance,
                    projectPublicId: task.projectPublicId,
                    goalPos: task.goalPos,
                    dateType: task.dateType,
                    steps: stepsByTask[task.taskId] || []
                }));
                res.json({success: true, tasks: tasksWithSteps});

            } catch (err) {
                console.error(err);
                res.status(500).json({success: false, error: err.message});
            } finally {
                if (conn) conn.release();
            }
        })

        this.app.get('/api/get-asap', requireAuth, async (req, res) => {
            const userId = req.user.id;
            let conn;
            try {
                conn = await pool.getConnection();

                const [tasks] = await conn.execute(
                    `
                        SELECT T.id         AS taskId,
                               T.publicId   AS taskPublicId,
                               T.name       AS name,
                               T.checkState AS checkState,
                               C.publicId   AS categoryPublicId,
                               T.importance AS importance,
                               P.publicId   AS projectPublicId,
                               T.addDate    AS addDate,
                               T.dateType   AS dateType
                        FROM todo_tasks T
                                 LEFT JOIN categories C ON T.categoryId = C.id
                                 LEFT JOIN projects P ON T.projectId = P.id
                        WHERE T.userId = ${userId}
                          AND T.dateType IN (2, 3)
                          AND T.checkState = 0
                        ORDER BY T.dateType ASC, T.id DESC
                    `
                );

                if (tasks.length === 0) {
                    return res.json({success: true, tasks: []});
                }

                // Fetch all steps for those tasks in one go
                const taskIds = tasks.map(t => t.taskId);
                const [steps] = await conn.execute(
                    `SELECT id, goalId, name, stepCheck, publicId
                     FROM steps
                     WHERE goalId IN (${taskIds.join(',')})`,
                );

                // Group steps by task_id
                const stepsByTask = steps.reduce((acc, step) => {
                    acc[step.goalId] = acc[step.goalId] || [];
                    acc[step.goalId].push({
                        publicId: step.publicId,
                        name: step.name,
                        stepCheck: !!step.stepCheck
                    });
                    return acc;
                }, {});
                const tasksWithSteps = tasks.map(task => ({
                    publicId: task.taskPublicId,
                    name: task.name,
                    addDate: task.addDate,
                    checkState: task.checkState,
                    categoryPublicId: task.categoryPublicId,
                    importance: task.importance,
                    projectPublicId: task.projectPublicId,
                    goalPos: task.goalPos,
                    dateType: task.dateType,
                    steps: stepsByTask[task.taskId] || []
                }));
                res.json({success: true, tasks: tasksWithSteps});

            } catch (err) {
                console.error(err);
                res.status(500).json({success: false, error: err.message});
            } finally {
                if (conn) conn.release();
            }
        })

        this.app.get('/api/get-inbox', requireAuth, async (req, res) => {
            const userId = req.user.id;
            let conn;
            try {
                conn = await pool.getConnection();

                const [tasks] = await conn.execute(
                    `
                        SELECT T.id         AS taskId,
                               T.publicId   AS taskPublicId,
                               T.name       AS name,
                               T.checkState AS checkState,
                               C.publicId   AS categoryPublicId,
                               T.importance AS importance,
                               P.publicId   AS projectPublicId,
                               T.addDate    AS addDate,
                               T.dateType   AS dateType
                        FROM todo_tasks T
                                 LEFT JOIN categories C ON T.categoryId = C.id
                                 LEFT JOIN projects P ON T.projectId = P.id
                        WHERE T.userId = ${userId}
                          AND T.dateType = 4
                          AND T.checkState = 0
                        ORDER BY T.dateType ASC, T.id DESC
                    `
                );

                if (tasks.length === 0) {
                    return res.json({success: true, tasks: []});
                }

                // Fetch all steps for those tasks in one go
                const taskIds = tasks.map(t => t.taskId);
                const [steps] = await conn.execute(
                    `SELECT id, goalId, name, stepCheck, publicId
                     FROM steps
                     WHERE goalId IN (${taskIds.join(',')})`,
                );

                // Group steps by task_id
                const stepsByTask = steps.reduce((acc, step) => {
                    acc[step.goalId] = acc[step.goalId] || [];
                    acc[step.goalId].push({
                        publicId: step.publicId,
                        name: step.name,
                        stepCheck: !!step.stepCheck
                    });
                    return acc;
                }, {});
                const tasksWithSteps = tasks.map(task => ({
                    publicId: task.taskPublicId,
                    name: task.name,
                    addDate: task.addDate,
                    checkState: task.checkState,
                    categoryPublicId: task.categoryPublicId,
                    importance: task.importance,
                    projectPublicId: task.projectPublicId,
                    goalPos: task.goalPos,
                    dateType: task.dateType,
                    steps: stepsByTask[task.taskId] || []
                }));
                res.json({success: true, tasks: tasksWithSteps});

            } catch (err) {
                console.error(err);
                res.status(500).json({success: false, error: err.message});
            } finally {
                if (conn) conn.release();
            }
        })

        this.app.get('/api/ask-edit-goal', requireAuth, async (req, res) => {
            const todo_id = req.query.id;
            const userId = req.user.id;

            let conn;
            try {
                conn = await pool.getConnection();

                const [tasks] = await conn.execute(
                    `
                        SELECT T.id         AS taskId,
                               T.publicId   AS taskPublicId,
                               T.name       AS name,
                               T.checkState AS checkState,
                               C.publicId   AS categoryPublicId,
                               T.importance AS importance,
                               P.publicId   AS projectPublicId,
                               T.addDate    AS addDate,
                               T.dateType   AS dateType
                        FROM todo_tasks T
                                 LEFT JOIN categories C ON T.categoryId = C.id
                                 LEFT JOIN projects P ON T.projectId = P.id
                        WHERE T.userId = ${userId}
                          AND T.publicId = "${todo_id}"
                    `
                );

                if (tasks.length === 0) {
                    return res.json({success: true, tasks: []});
                }

                // Fetch all steps for those tasks in one go
                const taskIds = tasks.map(t => t.taskId);
                const [steps] = await conn.execute(
                    `SELECT id, goalId, name, stepCheck, publicId
                     FROM steps
                     WHERE goalId IN (${taskIds.join(',')})`,
                );

                // Group steps by task_id
                const stepsByTask = steps.reduce((acc, step) => {
                    acc[step.goalId] = acc[step.goalId] || [];
                    acc[step.goalId].push({
                        publicId: step.publicId,
                        name: step.name,
                        stepCheck: !!step.stepCheck
                    });
                    return acc;
                }, {});
                const tasksWithSteps = tasks.map(task => ({
                    publicId: task.taskPublicId,
                    name: task.name,
                    addDate: task.addDate,
                    checkState: task.checkState,
                    categoryPublicId: task.categoryPublicId,
                    importance: task.importance,
                    projectPublicId: task.projectPublicId,
                    goalPos: task.goalPos,
                    dateType: task.dateType,
                    steps: stepsByTask[task.taskId] || []
                }));
                res.json({success: true, tasks: tasksWithSteps[0]});

            } catch (err) {
                console.error(err);
                res.status(500).json({success: false, error: err.message});
            } finally {
                if (conn) conn.release();
            }
        })

        this.app.get('/api/ask-project-sidebar', requireAuth, async (req, res) => {
            const current_dates_str = req.query.current_dates.split(',').map(date => `'${date}'`).join(', ');
            const userId = req.user.id;
            let conn;

            try {
                conn = await pool.getConnection();

                const [tasks] = await conn.execute(
                    `SELECT T.publicId                                                      AS publicId,
                            C.publicId                                                      AS categoryPublicId,
                            T.checkState                                                    AS checkState,
                            T.goalPos                                                       AS goalPos,
                            T.importance                                                    AS importance,
                            T.name                                                          AS name,
                            T.addDate                                                       AS addDate,
                            T.dateType                                                      AS dateType,
                            CASE WHEN T.addDate IN (${current_dates_str}) THEN 1 ELSE 0 END as "already"
                     FROM todo_tasks T
                              LEFT JOIN categories C ON T.categoryId = C.id
                              LEFT JOIN projects P ON T.projectId = P.id
                     WHERE T.userId = ${userId}
                       AND P.publicId = "${req.query.id}"
                       AND T.checkState = 0
                       AND T.addDate is NULL
                     ORDER BY addDate, goalPos`
                );

                res.json({success: true, tasks: tasks});
            } catch (err) {
                console.error(err);
                res.status(500).json({success: false, error: err.message});
            } finally {
                if (conn) conn.release();
            }


        })

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

        this.app.get('/api/get-icons', requireAuth, async (req, res) => {
            const userId = req.user.id;
            let conn;

            try {
                conn = await pool.getConnection();

                const [tasks] = await conn.execute(
                    `SELECT *
                     FROM icons WHERE userId = ? or userId IS NULL`, [userId]
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
        this.app.delete('/api/delete-goal/', requireAuth, async (req, res) => {
            const userId = req.user.id;

            let conn;
            try {
                conn = await pool.getConnection();

                // Use a placeholder so the driver escapes the value for you
                const [result] = await conn.execute(
                    `DELETE
                     FROM todo_tasks T
                     WHERE T.userId = ${userId} and T.publicId = '${req.query.id}'`,
                );

                // `affectedRows` lets you know whether anything was deleted
                res.json({success: true, deleted: result.affectedRows});
            } catch (err) {
                console.error(err);
                res.status(500).json({success: false, error: err.message});
            } finally {
                if (conn) conn.release();
            }
        });

        this.app.delete('/api/remove-category/', requireAuth, async (req, res) => {
            const userId = req.user.id;
            const id = req.query.id;

            let conn;
            try {
                conn = await pool.getConnection();

                // Use a placeholder so the driver escapes the value for you
                const [result] = await conn.execute(
                    `DELETE
                     FROM categories
                     WHERE userId = ?
                       and publicId = ?`, [userId, id]
                );

                // `affectedRows` lets you know whether anything was deleted
                res.json({success: true, deleted: result.affectedRows});
            } catch (err) {
                console.error(err);
                res.status(500).json({success: false, error: err.message});
            } finally {
                if (conn) conn.release();
            }
        });

        this.app.delete('/api/remove-project/', requireAuth, async (req, res) => {
            const userId = req.user.id;
            const id = req.query.id;

            let conn;
            try {
                conn = await pool.getConnection();

                // Use a placeholder so the driver escapes the value for you
                const [result] = await conn.execute(
                    `DELETE
                     FROM projects 
                     WHERE userId = ${userId} and publicId = '${req.query.id}'`,
                );

                // `affectedRows` lets you know whether anything was deleted
                res.json({success: true, deleted: result.affectedRows});
            } catch (err) {
                console.error(err);
                res.status(500).json({success: false, error: err.message});
            } finally {
                if (conn) conn.release();
            }
        });
    }

    updaters() {
        this.app.put('/api/goals-reorder/', requireAuth, async (req, res) => {
            const order = req.query.order.split(',');
            const userId = req.user.id;
            let conn;
            try {
                conn = await pool.getConnection();
                await conn.beginTransaction();
                const sql = 'UPDATE todo_tasks SET goalPos = ? WHERE publicId = ? AND userId = ?';

                for (let i = 0; i < order.length; i++) {
                    await conn.execute(sql, [i + 1, order[i], userId]);
                }

                await conn.commit();

                res.json({success: true, updated: order.length});
            } catch (err) {
                if (conn) await conn.rollback();
                console.error(err);
                res.status(500).json({success: false, error: err.message});
            } finally {
                if (conn) conn.release();
            }
        });

        this.app.patch('/api/change-checks-goal/', requireAuth, async (req, res) => {
            const id = req.query.id;
            const state = Number(req.query.state);          // will turn "0"/"1" → 0/1
            const userId = req.user.id;                     // from your auth middleware

            if (!id || ![0, 1].includes(state)) {
                return res.status(400).json({success: false, error: 'Invalid id or state (must be 0 or 1)'});
            }

            let conn;
            try {
                conn = await pool.getConnection();

                // 2 ▸ parameterised query (keeps SQL-injection out)
                const [result] = await conn.execute(
                    'UPDATE todo_tasks SET checkState = ? WHERE publicId = ? AND userId = ?',
                    [state, id, userId]
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

        this.app.patch('/api/change-checks-step/', requireAuth, async (req, res) => {
            const id = req.query.id;
            const state = Number(req.query.state);          // will turn "0"/"1" → 0/1
            const userId = req.user.id;                     // from your auth middleware

            if (!id || ![0, 1].includes(state)) {
                return res.status(400).json({success: false, error: 'Invalid id or state (must be 0 or 1)'});
            }

            let conn;
            try {
                conn = await pool.getConnection();

                // 2 ▸ parameterised query (keeps SQL-injection out)
                const [result] = await conn.execute(
                    'UPDATE steps SET stepCheck = ? WHERE publicId = ? AND userId = ?',
                    [state, id, userId]
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

        this.app.patch('/api/edit-goal/', requireAuth, async (req, res) => {
            const id = req.query.id;
            const changes = JSON.parse(req.query.changes);
            const userId = req.user.id;

            let conn;
            try {
                conn = await pool.getConnection();

                let sql = `
                    UPDATE todo_tasks AS T
                        LEFT JOIN categories AS C
                    ON C.publicId = ?
                        LEFT JOIN projects AS P ON P.publicId = ?
                        SET T.checkState = ?, T.name = ?, T.categoryId = C.id, T.importance = ?, T.note = ?, 
                            T.projectId = P.id, T.addDate = ?, T.dateType = ?
                    WHERE T.publicId = ?
                      AND T.userId = ?
                `

                const values = [
                    changes.categoryPublicId,
                    changes.projectPublicId,
                    changes.checkState,
                    changes.name,
                    changes.importance,
                    changes.note,
                    changes.addDate,
                    changes.dateType,
                    id,
                    userId
                ];

                const [tasks] = await conn.execute(
                    sql,
                    values
                );

                const [task_id] = await conn.execute(
                    `SELECT id
                     FROM todo_tasks
                     WHERE publicId = ?
                       AND userId = ?`,
                    [id, userId]
                );

                await conn.execute(
                    `DELETE
                     FROM steps
                     WHERE goalId = ?
                       AND userId = ?`, [task_id[0].id, userId]
                );

                if (changes['steps'].length === 0) {
                    return res.json({success: true, tasks: []});
                }
                let steps_values = ""
                for (let j = 0; j < changes['steps'].length; j++) {
                    steps_values += `("${changes['steps'][j].name}", ${task_id[0].id}, ${changes['steps'][j].stepCheck}, ${userId})`
                    if (j < changes['steps'].length - 1) steps_values += ","
                }
                steps_values += ";"

                await conn.execute(
                    `INSERT INTO steps (name, goalId, stepCheck, userId)
                     VALUES ${steps_values} `
                );
                const [steps] = await conn.execute(
                    `SELECT S.id, S.goalId, S.name, S.stepCheck, S.publicId
                     FROM steps S
                              JOIN todo_tasks T ON T.id = S.goalId
                     WHERE T.publicId = "${id}"`,
                );

                res.json({success: true, steps: steps});
            } catch (err) {
                console.error(err);
                res.status(500).json({success: false, error: err.message});
            } finally {
                if (conn) conn.release();
            }
        });

        this.app.patch('/api/change-date/', requireAuth, async (req, res) => {
            const id = req.query.id;
            const addDate = req.query.date;
            const userId = req.user.id;                     // from your auth middleware
            const order = req.query.order.split(',');

            let conn;
            try {
                conn = await pool.getConnection();

                // 2 ▸ parameterised query (keeps SQL-injection out)
                const [result] = await conn.execute(
                    'UPDATE todo_tasks SET addDate = ? WHERE publicId = ? AND userId = ?',
                    [addDate, id, userId]
                );

                await conn.beginTransaction();
                const sql = 'UPDATE todo_tasks SET goalPos = ? WHERE publicId = ? AND userId = ?';

                for (let i = 0; i < order.length; i++) {
                    await conn.execute(sql, [i + 1, order[i], userId]);
                }

                await conn.commit();

                res.json({success: true, updated: result.affectedRows});
            } catch (err) {
                console.error(err);
                res.status(500).json({success: false, error: err.message});
            } finally {
                if (conn) conn.release();
            }
        });

        this.app.patch('/api/change-week-goal-check/', requireAuth, async (req, res) => {
            const id = req.query.id;
            const state = Number(req.query.state);          // will turn "0"/"1" → 0/1
            const userId = req.user.id;                     // from your auth middleware

            if (!id || ![0, 1].includes(state)) {
                return res.status(400).json({success: false, error: 'Invalid id or state (must be 0 or 1)'});
            }

            let conn;
            try {
                conn = await pool.getConnection();

                // 2 ▸ parameterised query (keeps SQL-injection out)
                const [result] = await conn.execute(
                    'UPDATE todo_tasks SET checkState = ? WHERE publicId = ? AND userId = ?',
                    [state, id, userId]
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

        this.app.patch('/api/goal-remove-date/', requireAuth, async (req, res) => {
            const id = req.query.id;
            const userId = req.user.id;

            let conn;
            try {
                conn = await pool.getConnection();

                // 2 ▸ parameterised query (keeps SQL-injection out)
                const [result] = await conn.execute(
                    'UPDATE todo_tasks SET addDate=null, checkState = 0 WHERE publicId = ? AND userId = ?',
                    [id, userId]
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

        this.app.patch('/api/get-from-project/', requireAuth, async (req, res) => {
            const id = req.query.id;
            const new_date = req.query.new_date;
            const userId = req.user.id;                     // from your auth middleware


            let conn;
            try {
                conn = await pool.getConnection();

                // 2 ▸ parameterised query (keeps SQL-injection out)
                const [result] = await conn.execute(
                    'UPDATE todo_tasks SET addDate = ? WHERE publicId = ? AND userId = ?',
                    [new_date, id, userId]
                );

                const [steps] = await conn.execute(
                    `SELECT S.name as name, S.stepCheck as stepCheck, S.publicId as publicId
                     FROM steps S
                              JOIN todo_tasks T ON T.id = S.goalId
                     WHERE T.publicId = ?
                       and S.userId = ?`,
                    [id, userId]
                );
                res.json({success: true, steps: steps});
            } catch (err) {
                console.error(err);
                res.status(500).json({success: false, error: err.message});
            } finally {
                if (conn) conn.release();
            }
        });

        this.app.patch('/api/check-inbox-goal/', requireAuth, async (req, res) => {
            const id = req.query.id;
            const userId = req.user.id;

            let conn;
            try {
                conn = await pool.getConnection();

                const [result] = await conn.execute(
                    'UPDATE inbox SET checkState=1 WHERE publicId = ? AND userId = ?',
                    [id, userId]
                );

                res.json({success: true, updated: result.affectedRows});
            } catch (err) {
                console.error(err);
                res.status(500).json({success: false, error: err.message});
            } finally {
                if (conn) conn.release();
            }
        });

        this.app.patch('/api/check-asap-goal/', requireAuth, async (req, res) => {
            const id = req.query.id;
            const userId = req.user.id;

            let conn;
            try {
                conn = await pool.getConnection();

                const [result] = await conn.execute(
                    'UPDATE todo_tasks SET checkState=1 WHERE publicId = ? AND userId = ?',
                    [id, userId]
                );

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
        this.app.post('/api/add-category/', requireAuth, async (req, res) => {
            const name = req.query.name;
            const r = req.query.r;
            const g = req.query.g;
            const b = req.query.b;

            const userId = req.user.id;
            let conn;
            try {
                conn = await pool.getConnection();
                const [result] = await conn.execute(
                    'INSERT INTO categories (userId, name, r, g, b) VALUES (?, ?, ?, ?, ?)',
                    [userId, name, r, g, b]
                );
                res.json({success: true, id: result.insertId});
            } catch (err) {
                console.error(err);
                res.status(500).json({success: false, error: err.message});
            } finally {
                if (conn) conn.release();
            }
        });

        this.app.post('/api/add-goal/', requireAuth, async (req, res) => {
            const userId = req.user.id;
            const changes = JSON.parse(req.query.changes);

            if (!changes['categoryPublicId']){
                changes['categoryPublicId'] = null
            }

            if (!changes['projectPublicId']){
                changes['projectPublicId'] = null
            }

            let conn;
            try {
                conn = await pool.getConnection();
                const sql = `
                    INSERT INTO todo_tasks
                        (publicId, name, addDate, categoryId, importance, projectId, note, dateType, userId)
                    VALUES (?,?, ?, (SELECT id FROM categories WHERE publicId = ?), ?, (SELECT id FROM projects WHERE publicId = ?), ?, ?, ?)
                `;
                const params = [
                    changes['publicId'],
                    changes['name'],
                    changes['addDate'],
                    changes['categoryPublicId'],
                    changes['importance'],
                    changes['projectPublicId'],
                    changes['note'],
                    changes['dateType'],
                    userId
                ];
                const [result] = await conn.execute(
                    sql, params
                );

                const [[{ publicId }]] = await conn.execute(
                    'SELECT publicId FROM todo_tasks WHERE id = ?',
                    [ result.insertId ]
                );
                if (!changes['steps'].length) {
                    return res.json({success: true, result: [publicId, []]});
                }

                let steps_values = ""
                for (let j = 0; j < changes['steps'].length; j++) {
                    steps_values += `("${changes['steps'][j].name}", ${result.insertId}, ${changes['steps'][j].stepCheck}, ${userId})`
                    if (j < changes['steps'].length - 1) steps_values += ","
                }
                steps_values += ";"

                await conn.execute(
                    `INSERT INTO steps (name, goalId, stepCheck, userId)
                     VALUES ${steps_values} `
                );

                let [steps] = await conn.execute(
                    `SELECT name, publicId, stepCheck FROM steps WHERE goalId = ? and userId = ?`,
                    [result.insertId, userId]
                );

                res.json({success: true, result: [publicId, steps]});
            } catch (err) {
                console.error(err);
                res.status(500).json({success: false, error: err.message});
            } finally {
                if (conn) conn.release();
            }
        });

        this.app.post('/api/new-project/', requireAuth, async (req, res) => {
            const name = req.query.name;
            const category_id = req.query.category;
            const icon = req.query.icon;

            const userId = req.user.id;
            let conn;
            try {
                conn = await pool.getConnection();
                const [result] = await conn.execute(
                    'INSERT INTO projects (userId, name, categoryId, iconId) VALUES (?, ?, (SELECT id FROM categories WHERE publicId = ?), ?)',
                    [userId, name, category_id, icon]
                );

                const [project] = await conn.execute(
                    'SELECT publicId FROM projects WHERE id = ?',
                    [result.insertId]
                );

                res.json({success: true, id: project[0].publicId});
            } catch (err) {
                console.error(err);
                res.status(500).json({success: false, error: err.message});
            } finally {
                if (conn) conn.release();
            }
        });

        this.app.post('/api/new-inbox-goal/', requireAuth, async (req, res) => {
            const name = req.query.name;
            const add_date = req.query.addDate;
            const userId = req.user.id;

            let conn;
            try {
                conn = await pool.getConnection();
                const [result] = await conn.execute(
                    'INSERT INTO inbox (userId, name, addDate) VALUES (?, ?, ?)',
                    [userId, name, add_date]
                );

                const [goal] = await conn.execute(
                    'SELECT publicId, name, addDate FROM inbox WHERE userId = ? and id = ?',
                    [userId, result.insertId ]
                );
                res.json({success: true, goal: goal[0]});
            } catch (err) {
                console.error(err);
                res.status(500).json({success: false, error: err.message});
            } finally {
                if (conn) conn.release();
            }
        });

        this.app.post('/api/new-goal-from-inbox/', requireAuth, async (req, res) => {
            const userId = req.user.id;
            const id = req.query.id;
            const changes = JSON.parse(req.query.changes);

            let conn;
            try {
                conn = await pool.getConnection();
                const sql = `
                    INSERT INTO todo_tasks
                        (name, addDate, categoryId, projectId, note, dateType, userId)
                    VALUES (?, ?, (SELECT id FROM categories WHERE publicId = ?), (SELECT id FROM projects WHERE publicId = ?), ?, ?, ?)
                `;
                const params = [
                    changes['name'],
                    changes['addDate'],
                    changes['categoryPublicId'],
                    changes['projectPublicId'],
                    changes['note'],
                    changes['dateType'],
                    userId
                ];
                const [result] = await conn.execute(
                    sql, params
                );

                await conn.execute(
                    `DELETE FROM inbox WHERE userId = ? and publicId = ?`,
                    [ userId, id ]
                );

                if (!changes['steps'].length) {
                    return res.json({success: true, result: result});
                }

                let steps_values = ""
                for (let j = 0; j < changes['steps'].length; j++) {
                    steps_values += `("${changes['steps'][j].name}", ${result.insertId}, ${changes['steps'][j].stepCheck}, ${userId})`
                    if (j < changes['steps'].length - 1) steps_values += ","
                }
                steps_values += ";"

                await conn.execute(
                    `INSERT INTO steps (name, goalId, stepCheck, userId)
                     VALUES ${steps_values} `
                );



                res.json({success: true, result: result});
            } catch (err) {
                console.error(err);
                res.status(500).json({success: false, error: err.message});
            } finally {
                if (conn) conn.release();
            }
        });


        this.app.post('/api/new-asap-goal/', requireAuth, async (req, res) => {
            const userId = req.user.id;
            const name = req.query.name;
            const add_date = req.query.addDate;
            const date_type = req.query.dateType;

            let conn;
            try {
                conn = await pool.getConnection();
                const [result] = await conn.execute(
                    'INSERT INTO todo_tasks (name, addDate, dateType, userId) VALUES (?, ?, ?, ?)',
                    [name, add_date, date_type, userId]
                );

                const [tasks] = await conn.execute(
                    `SELECT T.publicId   AS publicId,
                            C.publicId   AS categoryPublicId,
                            P.publicId   AS projectPublicId,
                            T.checkState AS checkState,
                            T.goalPos    AS goalPos,
                            T.importance AS importance,
                            T.name       AS name,
                            T.addDate    AS addDate,
                            T.dateType   AS dateType
                     FROM todo_tasks T
                              LEFT JOIN categories C ON T.categoryId = C.id
                              LEFT JOIN projects P ON T.projectId = P.id
                     WHERE T.userId = ?
                       and T.id = ?
                     ORDER BY addDate, goalPos`, [userId ,result.insertId]
                );

                res.json({success: true, result: tasks[0]});
            } catch (err) {
                console.error(err);
                res.status(500).json({success: false, error: err.message});
            } finally {
                if (conn) conn.release();
            }
        });

        this.app.post('/api/add-icon/', requireAuth, async (req, res) => {
            const name = req.query.name;
            const svgIcon = req.query.svg;

            const userId = req.user.id;
            let conn;
            try {
                conn = await pool.getConnection();
                const [result] = await conn.execute(
                    'INSERT INTO icons (userId, svg) VALUES (?, ?)',
                    [userId, svgIcon]
                );
                res.json({success: true, id: result.insertId});
            } catch (err) {
                console.error(err);
                res.status(500).json({success: false, error: err.message});
            } finally {
                if (conn) conn.release();
            }
        });
    }


}