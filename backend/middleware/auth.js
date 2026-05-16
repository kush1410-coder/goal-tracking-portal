function isAuthenticated(req, res, next) {
  if (req.session && req.session.userId) {
    return next();
  }
  res.status(401).json({ error: 'Unauthorized: Please login first' });
}

function isManager(req, res, next) {
  if (req.session && (req.session.role === 'manager' || req.session.role === 'admin')) {
    return next();
  }
  res.status(403).json({ error: 'Forbidden: Manager access required' });
}

function isAdmin(req, res, next) {
  if (req.session && req.session.role === 'admin') {
    return next();
  }
  res.status(403).json({ error: 'Forbidden: Admin access required' });
}

module.exports = { isAuthenticated, isManager, isAdmin };