// API Configuration
const API_BASE_URL = 'http://localhost:3000/api';

// Global state
let currentUser = null;
let currentGoals = [];

// Authentication
async function login(event) {
    event.preventDefault();
    
    const username = document.getElementById('username').value;
    const password = document.getElementById('password').value;
    
    try {
        const response = await fetch(`${API_BASE_URL}/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ username, password })
        });
        
        const data = await response.json();
        
        if (data.success) {
            currentUser = data.user;
            document.getElementById('loginScreen').style.display = 'none';
            document.getElementById('mainApp').style.display = 'block';
            document.getElementById('userInfo').innerHTML = `👤 ${currentUser.name} (${currentUser.role})`;
            
            // Show/hide tabs based on role
            if (currentUser.role === 'manager' || currentUser.role === 'admin') {
                document.getElementById('teamTabBtn').style.display = 'inline-block';
                document.getElementById('sharedTabBtn').style.display = 'inline-block';
            }
            
            // Load initial data
            await loadGoals();
            await loadCheckins();
            
            if (currentUser.role === 'manager' || currentUser.role === 'admin') {
                await loadTeamGoals();
                await loadSharedGoals();
            }
        } else {
            alert('Login failed: ' + data.error);
        }
    } catch (error) {
        console.error('Login error:', error);
        alert('Failed to login. Make sure the backend server is running.');
    }
}

async function logout() {
    await fetch(`${API_BASE_URL}/auth/logout`, {
        method: 'POST',
        credentials: 'include'
    });
    
    currentUser = null;
    document.getElementById('loginScreen').style.display = 'flex';
    document.getElementById('mainApp').style.display = 'none';
    document.getElementById('loginForm').reset();
}

// Goal Management
async function loadGoals() {
    try {
        const response = await fetch(`${API_BASE_URL}/goals`, {
            credentials: 'include'
        });
        
        if (response.ok) {
            currentGoals = await response.json();
            renderGoals();
        }
    } catch (error) {
        console.error('Error loading goals:', error);
    }
}

function renderGoals() {
    const goalsList = document.getElementById('goalsList');
    const warningDiv = document.getElementById('weightageWarning');
    
    if (!currentGoals || currentGoals.length === 0) {
        goalsList.innerHTML = '<p style="text-align:center; color:#718096;">No goals created yet. Click "Create New Goal" to get started!</p>';
        return;
    }
    
    // Calculate total weightage
    const totalWeight = currentGoals.reduce((sum, goal) => sum + (goal.weightage || 0), 0);
    if (Math.abs(totalWeight - 100) > 0.01 && totalWeight > 0) {
        warningDiv.innerHTML = `⚠️ Total weightage is ${totalWeight}%. It must equal 100%. Please adjust your goals.`;
    } else {
        warningDiv.innerHTML = '';
    }
    
    goalsList.innerHTML = currentGoals.map(goal => `
        <div class="goal-card">
            <div class="goal-header">
                <div>
                    <span class="goal-title">${escapeHtml(goal.title)}</span>
                    <span class="goal-thrust">${escapeHtml(goal.thrust_area)}</span>
                    <span class="status-badge status-${goal.status}">${goal.status.toUpperCase()}</span>
                </div>
                <div class="goal-weightage">Weightage: ${goal.weightage}%</div>
            </div>
            <p><strong>Description:</strong> ${escapeHtml(goal.description || '')}</p>
            <p><strong>UoM:</strong> ${goal.uom} | <strong>Target:</strong> ${goal.target}</p>
            ${goal.achievement ? `<p><strong>Achievement:</strong> ${goal.achievement}</p>` : ''}
            <div class="progress-bar">
                <div class="progress-fill" style="width: ${goal.progress_score}%">
                    ${goal.progress_score > 0 ? `${Math.round(goal.progress_score)}%` : ''}
                </div>
            </div>
            ${(currentUser.role === 'manager' || currentUser.role === 'admin') && goal.status === 'pending' ? `
                <div class="action-buttons">
                    <button onclick="approveGoal(${goal.id})" class="btn-approve">✓ Approve</button>
                    <button onclick="requestRework(${goal.id})" class="btn-rework">↺ Request Rework</button>
                    <button onclick="editGoal(${goal.id})" class="btn-edit">✎ Edit</button>
                </div>
            ` : ''}
        </div>
    `).join('');
}

async function createGoal(event) {
    event.preventDefault();
    
    const goalData = {
        thrustArea: document.getElementById('thrustArea').value,
        title: document.getElementById('goalTitle').value,
        description: document.getElementById('goalDescription').value,
        uom: document.getElementById('uom').value,
        target: document.getElementById('target').value,
        weightage: parseFloat(document.getElementById('weightage').value),
        quarter: document.getElementById('quarter').value
    };
    
    try {
        const response = await fetch(`${API_BASE_URL}/goals`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify(goalData)
        });
        
        const data = await response.json();
        
        if (response.ok) {
            alert('Goal created successfully! Waiting for manager approval.');
            closeCreateGoalModal();
            await loadGoals();
            document.getElementById('createGoalForm').reset();
        } else {
            alert('Error: ' + data.error);
        }
    } catch (error) {
        console.error('Error creating goal:', error);
        alert('Failed to create goal');
    }
}

async function approveGoal(goalId) {
    try {
        const response = await fetch(`${API_BASE_URL}/goals/${goalId}/approve`, {
            method: 'PUT',
            credentials: 'include'
        });
        
        if (response.ok) {
            alert('Goal approved successfully!');
            await loadGoals();
        } else {
            alert('Failed to approve goal');
        }
    } catch (error) {
        console.error('Error approving goal:', error);
    }
}

async function requestRework(goalId) {
    try {
        const response = await fetch(`${API_BASE_URL}/goals/${goalId}/rework`, {
            method: 'PUT',
            credentials: 'include'
        });
        
        if (response.ok) {
            alert('Rework requested. Employee will need to update the goal.');
            await loadGoals();
        } else {
            alert('Failed to request rework');
        }
    } catch (error) {
        console.error('Error requesting rework:', error);
    }
}

async function editGoal(goalId) {
    const newWeight = prompt('Enter new weightage (%):', '10');
    if (newWeight && parseFloat(newWeight) >= 10) {
        try {
            const response = await fetch(`${API_BASE_URL}/goals/${goalId}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({ weightage: parseFloat(newWeight) })
            });
            
            if (response.ok) {
                alert('Goal updated successfully!');
                await loadGoals();
            } else {
                const data = await response.json();
                alert('Error: ' + data.error);
            }
        } catch (error) {
            console.error('Error updating goal:', error);
        }
    }
}

// Check-in Functions
async function loadCheckins() {
    try {
        const response = await fetch(`${API_BASE_URL}/checkins`, {
            credentials: 'include'
        });
        
        if (response.ok) {
            const checkins = await response.json();
            renderCheckins(checkins);
        }
    } catch (error) {
        console.error('Error loading checkins:', error);
    }
}

function renderCheckins(checkins) {
    const container = document.getElementById('checkinsList');
    const approvedGoals = currentGoals.filter(g => g.status === 'approved');
    
    if (approvedGoals.length === 0) {
        container.innerHTML = '<p>No approved goals to track. Create and get approval for goals first!</p>';
        return;
    }
    
    container.innerHTML = approvedGoals.map(goal => {
        const checkin = checkins.find(c => c.goal_id === goal.id);
        return `
            <div class="checkin-card">
                <h3>${escapeHtml(goal.title)}</h3>
                <p>Target: ${goal.target} (${goal.uom})</p>
                <p>Current Achievement: ${goal.achievement || 'Not updated'}</p>
                <p>Progress: ${Math.round(goal.progress_score || 0)}%</p>
            </div>
        `;
    }).join('');
    
    // Load manager comments
    loadManagerComments();
}

async function loadManagerComments() {
    try {
        const response = await fetch(`${API_BASE_URL}/checkins/manager-comments/${currentUser.id}`, {
            credentials: 'include'
        });
        
        if (response.ok) {
            const comments = await response.json();
            const container = document.getElementById('managerCommentsList');
            
            if (comments.length > 0) {
                container.innerHTML = `
                    <h3>Manager Feedback</h3>
                    ${comments.map(comment => `
                        <div class="goal-card">
                            <p><strong>${comment.manager_name}</strong> on ${new Date(comment.created_at).toLocaleDateString()}</p>
                            <p><em>Goal: ${comment.goal_title}</em></p>
                            <p>${escapeHtml(comment.comment)}</p>
                        </div>
                    `).join('')}
                `;
            } else {
                container.innerHTML = '';
            }
        }
    } catch (error) {
        console.error('Error loading manager comments:', error);
    }
}

function showCheckinModal() {
    const approvedGoals = currentGoals.filter(g => g.status === 'approved');
    if (approvedGoals.length === 0) {
        alert('No approved goals to update. Please create and get approval for goals first.');
        return;
    }
    
    const container = document.getElementById('checkinGoalsList');
    container.innerHTML = approvedGoals.map(goal => `
        <div class="checkin-item">
            <label><strong>${escapeHtml(goal.title)}</strong> (Target: ${goal.target})</label>
            <input type="text" id="achievement_${goal.id}" placeholder="Actual Achievement" value="${goal.achievement || ''}">
            <select id="status_${goal.id}">
                <option value="Not Started">Not Started</option>
                <option value="On Track">On Track</option>
                <option value="Completed">Completed</option>
            </select>
        </div>
    `).join('');
    
    document.getElementById('checkinModal').style.display = 'block';
}

async function submitCheckin() {
    const approvedGoals = currentGoals.filter(g => g.status === 'approved');
    
    for (const goal of approvedGoals) {
        const achievement = document.getElementById(`achievement_${goal.id}`).value;
        const status = document.getElementById(`status_${goal.id}`).value;
        
        if (achievement) {
            // Update achievement
            await fetch(`${API_BASE_URL}/goals/${goal.id}/achievement`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({ achievement })
            });
            
            // Save check-in
            await fetch(`${API_BASE_URL}/checkins`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({
                    goalId: goal.id,
                    achievement,
                    status,
                    quarter: 'Q4-2024'
                })
            });
        }
    }
    
    alert('Quarterly update submitted successfully!');
    closeCheckinModal();
    await loadGoals();
    await loadCheckins();
}

// Team Management (Manager)
async function loadTeamGoals() {
    try {
        const response = await fetch(`${API_BASE_URL}/goals/team`, {
            credentials: 'include'
        });
        
        if (response.ok) {
            const teamData = await response.json();
            renderTeamGoals(teamData);
        }
    } catch (error) {
        console.error('Error loading team goals:', error);
    }
}

function renderTeamGoals(teamData) {
    const container = document.getElementById('teamMembersList');
    
    if (!teamData || teamData.length === 0) {
        container.innerHTML = '<p>No team members found.</p>';
        return;
    }
    
    container.innerHTML = teamData.map(team => `
        <div class="team-member">
            <h3>${escapeHtml(team.employee_name)}</h3>
            ${team.goals.map(goal => `
                <div class="goal-card">
                    <div class="goal-header">
                        <span class="goal-title">${escapeHtml(goal.title)}</span>
                        <span class="status-badge status-${goal.status}">${goal.status}</span>
                    </div>
                    <p>Target: ${goal.target} | Weightage: ${goal.weightage}%</p>
                    <p>Progress: ${Math.round(goal.progress_score || 0)}%</p>
                    <button onclick="openManagerCommentModal(${team.employee_id}, ${goal.id}, '${escapeHtml(goal.title)}')" class="btn-secondary">Add Check-in Comment</button>
                </div>
            `).join('')}
        </div>
    `).join('');
}

function openManagerCommentModal(employeeId, goalId, goalTitle) {
    const modal = document.getElementById('managerCommentModal');
    const content = document.getElementById('managerCommentContent');
    
    content.innerHTML = `
        <h3>${goalTitle}</h3>
        <div class="form-group">
            <label>Check-in Comment:</label>
            <textarea id="managerComment" rows="4" placeholder="Document discussion points, feedback, and action items..."></textarea>
        </div>
    `;
    
    modal.style.display = 'block';
    window.currentManagerCheckin = { employeeId, goalId };
}

async function saveManagerComment() {
    const comment = document.getElementById('managerComment').value;
    
    if (!comment) {
        alert('Please add a comment before saving.');
        return;
    }
    
    try {
        const response = await fetch(`${API_BASE_URL}/checkins/manager-comment`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({
                employeeId: window.currentManagerCheckin.employeeId,
                goalId: window.currentManagerCheckin.goalId,
                comment: comment,
                quarter: 'Q4-2024'
            })
        });
        
        if (response.ok) {
            alert('Check-in comment saved successfully!');
            closeManagerCommentModal();
        } else {
            alert('Failed to save comment');
        }
    } catch (error) {
        console.error('Error saving comment:', error);
        alert('Failed to save comment');
    }
}

// Shared Goals
async function loadSharedGoals() {
    try {
        const response = await fetch(`${API_BASE_URL}/shared-goals`, {
            credentials: 'include'
        });
        
        if (response.ok) {
            const sharedGoals = await response.json();
            renderSharedGoals(sharedGoals);
        }
    } catch (error) {
        console.error('Error loading shared goals:', error);
    }
}

function renderSharedGoals(sharedGoals) {
    const container = document.getElementById('sharedGoalsList');
    
    if (!sharedGoals || sharedGoals.length === 0) {
        container.innerHTML = '<p>No shared KPIs yet.</p>';
        return;
    }
    
    container.innerHTML = sharedGoals.map(sg => `
        <div class="shared-card">
            <h3>${escapeHtml(sg.title)}</h3>
            <p>${escapeHtml(sg.description || '')}</p>
            <p><strong>Target:</strong> ${sg.target} (${sg.uom})</p>
            <p><strong>Primary Owner:</strong> ${sg.primary_owner_name}</p>
            <p><strong>Assigned to:</strong> ${sg.assignedTo.map(a => a.name).join(', ')}</p>
            ${sg.primary_owner_id === currentUser?.id ? `
                <button onclick="updateSharedAchievement(${sg.id})" class="btn-primary">Update Achievement</button>
            ` : ''}
        </div>
    `).join('');
}

async function updateSharedAchievement(sharedGoalId) {
    const achievement = prompt('Enter achievement value:');
    if (achievement) {
        try {
            const response = await fetch(`${API_BASE_URL}/shared-goals/${sharedGoalId}/achievement`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({ achievement })
            });
            
            if (response.ok) {
                alert('Achievement updated and synced to all team members!');
                await loadGoals();
                await loadSharedGoals();
            } else {
                alert('Failed to update achievement');
            }
        } catch (error) {
            console.error('Error updating achievement:', error);
        }
    }
}

async function showSharedGoalModal() {
    try {
        // Load employees
        const response = await fetch(`${API_BASE_URL}/shared-goals/employees/${currentUser.department}`, {
            credentials: 'include'
        });
        
        if (response.ok) {
            const employees = await response.json();
            const container = document.getElementById('employeeCheckboxes');
            const primaryOwnerSelect = document.getElementById('primaryOwner');
            
            primaryOwnerSelect.innerHTML = '<option value="">Select Primary Owner</option>';
            container.innerHTML = '';
            
            employees.forEach(emp => {
                primaryOwnerSelect.innerHTML += `<option value="${emp.id}">${emp.name}</option>`;
                container.innerHTML += `
                    <div>
                        <input type="checkbox" id="emp_${emp.id}" value="${emp.id}">
                        <label for="emp_${emp.id}">${emp.name}</label>
                    </div>
                `;
            });
        }
        
        document.getElementById('sharedGoalModal').style.display = 'block';
    } catch (error) {
        console.error('Error loading employees:', error);
    }
}

async function createSharedGoal(event) {
    event.preventDefault();
    
    const selectedEmployees = [];
    document.querySelectorAll('#employeeCheckboxes input:checked').forEach(cb => {
        selectedEmployees.push(parseInt(cb.value));
    });
    
    if (selectedEmployees.length === 0) {
        alert('Please select at least one employee');
        return;
    }
    
    const primaryOwnerId = parseInt(document.getElementById('primaryOwner').value);
    if (!primaryOwnerId) {
        alert('Please select a primary owner');
        return;
    }
    
    const sharedGoalData = {
        title: document.getElementById('sharedTitle').value,
        description: document.getElementById('sharedDescription').value,
        uom: document.getElementById('sharedUom').value,
        target: document.getElementById('sharedTarget').value,
        department: currentUser.department,
        assignedTo: selectedEmployees,
        primaryOwnerId: primaryOwnerId
    };
    
    try {
        const response = await fetch(`${API_BASE_URL}/shared-goals`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify(sharedGoalData)
        });
        
        if (response.ok) {
            alert('Department KPI shared successfully!');
            closeSharedGoalModal();
            await loadSharedGoals();
            await loadGoals();
            document.getElementById('sharedGoalForm').reset();
        } else {
            const data = await response.json();
            alert('Error: ' + data.error);
        }
    } catch (error) {
        console.error('Error creating shared goal:', error);
        alert('Failed to share KPI');
    }
}

// UI Helpers
function showTab(tabName) {
    document.querySelectorAll('.tab-content').forEach(tab => {
        tab.classList.remove('active');
    });
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.classList.remove('active');
    });
    
    document.getElementById(`${tabName}Tab`).classList.add('active');
    event.target.classList.add('active');
    
    // Refresh content
    if (tabName === 'goals') loadGoals();
    else if (tabName === 'checkins') loadCheckins();
    else if (tabName === 'team') loadTeamGoals();
    else if (tabName === 'shared') loadSharedGoals();
}

function showCreateGoalModal() {
    document.getElementById('createGoalModal').style.display = 'block';
}

function closeCreateGoalModal() {
    document.getElementById('createGoalModal').style.display = 'none';
}

function closeCheckinModal() {
    document.getElementById('checkinModal').style.display = 'none';
}

function closeManagerCommentModal() {
    document.getElementById('managerCommentModal').style.display = 'none';
}

function closeSharedGoalModal() {
    document.getElementById('sharedGoalModal').style.display = 'none';
}

function updateTargetPlaceholder() {
    const uom = document.getElementById('uom').value;
    const hint = document.getElementById('targetHint');
    if (uom === 'numeric') hint.textContent = 'e.g., 1000000';
    else if (uom === 'percentage') hint.textContent = 'e.g., 85 (for 85%)';
    else if (uom === 'timeline') hint.textContent = 'e.g., 2024-12-31';
    else hint.textContent = 'e.g., 0 (zero incidents)';
}

function escapeHtml(str) {
    if (!str) return '';
    return str.replace(/[&<>]/g, function(m) {
        if (m === '&') return '&amp;';
        if (m === '<') return '&lt;';
        if (m === '>') return '&gt;';
        return m;
    });
}

// Event Listeners
document.getElementById('loginForm')?.addEventListener('submit', login);
document.getElementById('createGoalForm')?.addEventListener('submit', createGoal);
document.getElementById('sharedGoalForm')?.addEventListener('submit', createSharedGoal);

// Close modals when clicking outside
window.onclick = function(event) {
    if (event.target.classList.contains('modal')) {
        event.target.style.display = 'none';
    }
}

// Check authentication on load
async function checkAuth() {
    try {
        const response = await fetch(`${API_BASE_URL}/auth/me`, {
            credentials: 'include'
        });
        
        const data = await response.json();
        
        if (data.authenticated) {
            currentUser = data.user;
            document.getElementById('loginScreen').style.display = 'none';
            document.getElementById('mainApp').style.display = 'block';
            document.getElementById('userInfo').innerHTML = `👤 ${currentUser.name} (${currentUser.role})`;
            
            if (currentUser.role === 'manager' || currentUser.role === 'admin') {
                document.getElementById('teamTabBtn').style.display = 'inline-block';
                document.getElementById('sharedTabBtn').style.display = 'inline-block';
            }
            
            await loadGoals();
            await loadCheckins();
            
            if (currentUser.role === 'manager' || currentUser.role === 'admin') {
                await loadTeamGoals();
                await loadSharedGoals();
            }
        }
    } catch (error) {
        console.error('Auth check error:', error);
    }
}

// Initialize
checkAuth();