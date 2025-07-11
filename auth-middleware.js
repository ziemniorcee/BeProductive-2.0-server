import jwt from 'jsonwebtoken';

export function requireAuth(req, res, next) {
    const auth = req.headers.authorization || '';
    const match = auth.match(/^Bearer (.+)$/);
    if (!match) return res.status(401).json({ success: false, error: 'No token' });

    const token = match[1];
    try {
        const payload = jwt.verify(token, process.env.JWT_SECRET);
        req.user = { id: payload.sub, name: payload.name };
        return next();
    } catch (e) {
        return res.status(401).json({ success: false, error: 'Invalid token' });
    }
}
