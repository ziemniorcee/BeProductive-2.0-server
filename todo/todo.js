import {requireAuth} from "../auth-middleware.js";
import {pool} from "../db.js";

export class Todo {
    constructor(app) {
        this.app = app
        this.init()
    }

    init() {
        this.getters()
    }

    getters() {
        this.app.get('/api/get-deadlines', requireAuth, async (req, res) => {

            const userId = req.user.id;
            let conn;

            try {
                conn = await pool.getConnection();

                const [tasks] = await conn.execute(
                    `SELECT 
                            T.publicId   AS taskPublicId,
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
                console.log(project_order)

                const [tasks] = await conn.execute(
                    `(
                      SELECT
                        T.id               AS taskId,
                        T.publicId         AS taskPublicId,
                        T.name             AS name,
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
            console.log(req.query)
            console.log(req.query.dates[0])
            console.log(req.query.dates[6])

            let dates_split = req.query.dates.split(',')

            console.log(dates_split)
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
            console.log(req.query)
            console.log(req.query.dates[0])
            console.log(req.query.dates[6])

            let dates_split = req.query.dates.split(',')

            console.log(dates_split)
            try {
                conn = await pool.getConnection();

                const [tasks] = await conn.execute(
                    `SELECT 
                            T.publicId   AS taskPublicId,
                            C.publicId AS categoryPublicId,
                            T.name       AS name,
                            T.addDate    AS addDate
                     FROM todo_tasks T
                              LEFT JOIN categories C ON T.categoryId = C.id
                     WHERE T.userId = ${userId}
                       AND T.addDate between '${dates_split[0]}' and '${dates_split[6]}'
                       and T.dateType IN (0,1) and T.checkState = 0
                        
                     ORDER BY addDate, goalPos`
                );

                let goals_dict = {}
                for (let i = 0; i < tasks.length; i++) {
                    let day = Number(tasks[i].addDate.slice(-2))

                    if (day in goals_dict) goals_dict[day].push(tasks[i])
                    else goals_dict[day] = [tasks[i]]
                }
                res.json({success: true, tasks: goals_dict});

            } catch (err) {
                console.error(err);
                res.status(500).json({success: false, error: err.message});
            } finally {
                if (conn) conn.release();
            }
        })
    }




}