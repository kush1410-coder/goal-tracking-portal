const express = require('express');
const bcrypt = require('bcryptjs');
const db = require('../database');
const { isAdmin } = require('../middleware/auth');

const router = express.Router();

// Login
router.post('/login', (req, res) => {
  const { username, password } = req.body;
  
  db.get("SELECT * FROM users WHERE username = ?", [username], (err, user) => {
    if (err) {
      return res.status(500).json({ error: 'Database error' });
    }
    
    if (!user) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    
    const isValidPassword = bcrypt.compareSync(password, user.password);
    
    if (!isValidPassword) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    
    // Store user info in session
    req.session.userId = user.id;
    req.session.username = user.username;
    req.session.role = user.role;
    req.session.department = user.department;
    req.session.name = user.name;
    
    res.json({
      success: true,
      user: {
        id: user.id,
        username: user.username,
        name: user.name,
        role: user.role,
        department: user.department
      }
    });
  });
});

// Azure AD / SSO login simulation
router.post('/azure-login', (req, res) => {
  const { email, groups } = req.body;
  if (!email) {
    return res.status(400).json({ error: 'Email is required for Azure AD login' });
  }

  const normalizedEmail = email.toLowerCase();
  const requestedGroups = Array.isArray(groups) ? groups.map(g => g.toLowerCase()) : [];
  let role = 'employee';
  let department = 'Sales';

  if (requestedGroups.includes('admin') || requestedGroups.includes('admins')) {
    role = 'admin';
    department = 'All';
  } else if (requestedGroups.includes('hr')) {
    role = 'hr';
    department = 'All';
  } else if (requestedGroups.includes('manager') || requestedGroups.includes('managers')) {
    role = 'manager';
  }

  if (requestedGroups.includes('marketing')) department = 'Marketing';
  if (requestedGroups.includes('product')) department = 'Product';
  if (requestedGroups.includes('engineering')) department = 'Engineering';
  if (requestedGroups.includes('finance')) department = 'Finance';
  if (requestedGroups.includes('hr')) department = 'All';
  if (requestedGroups.includes('sales')) department = 'Sales';

  db.get('SELECT * FROM users WHERE email = ?', [normalizedEmail], (err, user) => {
    if (err) {
      return res.status(500).json({ error: 'Database error' });
    }

    const signInUser = (userRecord) => {
      req.session.userId = userRecord.id;
      req.session.username = userRecord.username;
      req.session.role = userRecord.role;
      req.session.department = userRecord.department;
      req.session.name = userRecord.name;

      res.json({
        success: true,
        user: {
          id: userRecord.id,
          username: userRecord.username,
          name: userRecord.name,
          role: userRecord.role,
          department: userRecord.department
        }
      });
    };

    if (user) {
      const shouldUpdate = user.role !== role || user.department !== department;
      if (shouldUpdate) {
        db.run('UPDATE users SET role = ?, department = ? WHERE id = ?', [role, department, user.id], err => {
          if (err) console.error('Failed to sync Azure AD role/department', err);
        });
        user.role = role;
        user.department = department;
      }
      return signInUser(user);
    }

    const generatedUsername = normalizedEmail.split('@')[0];
    const generatedName = generatedUsername.replace('.', ' ').replace('-', ' ');
    const placeholderPassword = bcrypt.hashSync('azure-sso', 10);

    db.run(
      'INSERT INTO users (username, password, name, email, role, department) VALUES (?, ?, ?, ?, ?, ?)',
      [generatedUsername, placeholderPassword, generatedName, normalizedEmail, role, department],
      function(err) {
        if (err) {
          return res.status(500).json({ error: 'Database error' });
        }
        signInUser({
          id: this.lastID,
          username: generatedUsername,
          name: generatedName,
          role,
          department
        });
      }
    );
  });
});

// Logout
router.post('/logout', (req, res) => {
  req.session.destroy();
  res.json({ success: true });
});

// Get current user
router.get('/me', (req, res) => {
  if (req.session && req.session.userId) {
    res.json({
      authenticated: true,
      user: {
        id: req.session.userId,
        username: req.session.username,
        name: req.session.name,
        role: req.session.role,
        department: req.session.department
      }
    });
  } else {
    res.json({ authenticated: false });
  }
});

// Get all users (admin/HR only)
router.get('/users', isAdmin, (req, res) => {
  db.all("SELECT id, username, name, role, department FROM users ORDER BY department, role", (err, users) => {
    if (err) {
      return res.status(500).json({ error: 'Database error' });
    }
    res.json(users);
  });
});

module.exports = router;