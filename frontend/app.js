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
            if (currentUser.role === 'manager' || currentUser.role === 'admin' || currentUser.role === 'hr') {
                document.getElementById('teamTabBtn').style.display = 'inline-block';
                document.getElementById('sharedTabBtn').style.display = 'inline-block';
            }

            if (currentUser.role === 'admin' || currentUser.role === 'hr') {
                document.getElementById('adminTabBtn').style.display = 'inline-block';
            }
            
            // Load initial data
            await loadGoals();
            await loadCheckins();
            
            if (currentUser.role === 'manager' || currentUser.role === 'admin' || currentUser.role === 'hr') {
                await loadTeamGoals();
                await loadSharedGoals();
            }

            if (currentUser.role === 'admin' || currentUser.role === 'hr') {
                await loadAdminDashboard();
            }
        } else {
            alert('Login failed: ' + data.error);
        }
    } catch (error) {
        console.error('Login error:', error);
        alert('Failed to login. Make sure the backend server is running.');
    }
}

async function loginWithAzureAD() {
    const email = prompt('Enter Azure AD email to simulate SSO:', 'john@example.com');
    if (!email) return;
    const groupsText = prompt('Enter Azure AD group names (comma separated), e.g. Employees,Managers,HR:', 'Employees');
    const groups = groupsText ? groupsText.split(',').map(g => g.trim()) : [];

    try {
        const response = await fetch(`${API_BASE_URL}/auth/azure-login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ email, groups })
        });

        const data = await response.json();
        if (data.success) {
            currentUser = data.user;
            document.getElementById('loginScreen').style.display = 'none';
            document.getElementById('mainApp').style.display = 'block';
            document.getElementById('userInfo').innerHTML = `👤 ${currentUser.name} (${currentUser.role})`;

            if (currentUser.role === 'manager' || currentUser.role === 'admin' || currentUser.role === 'hr') {
                document.getElementById('teamTabBtn').style.display = 'inline-block';
                document.getElementById('sharedTabBtn').style.display = 'inline-block';
            }

            if (currentUser.role === 'admin' || currentUser.role === 'hr') {
                document.getElementById('adminTabBtn').style.display = 'inline-block';
            }

            await loadGoals();
            await loadCheckins();

            if (currentUser.role === 'manager' || currentUser.role === 'admin' || currentUser.role === 'hr') {
                await loadTeamGoals();
                await loadSharedGoals();
            }

            if (currentUser.role === 'admin' || currentUser.role === 'hr') {
                await loadAdminDashboard();
            }
        } else {
            alert('Azure AD login failed: ' + data.error);
        }
    } catch (error) {
        console.error('Azure login error:', error);
        alert('Failed to login with Azure AD.');
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
    
    const thrustArea = document.getElementById('thrustArea').value;
    const title = document.getElementById('goalTitle').value.trim();
    const target = document.getElementById('target').value.trim();
    const weightage = parseFloat(document.getElementById('weightage').value);

    if (!title || !target || isNaN(weightage)) {
        alert('Please complete the goal form with valid values.');
        return;
    }

    if (weightage < 10 || weightage > 100) {
        alert('Weightage must be a number between 10 and 100.');
        return;
    }

    const goalData = {
        thrustArea,
        title,
        description: document.getElementById('goalDescription').value,
        uom: document.getElementById('uom').value,
        target,
        weightage,
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
function showTab(event, tabName) {
    document.querySelectorAll('.tab-content').forEach(tab => {
        tab.classList.remove('active');
    });
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.classList.remove('active');
    });
    
    document.getElementById(`${tabName}Tab`).classList.add('active');
    if (event && event.currentTarget) {
        event.currentTarget.classList.add('active');
    }
    
    // Refresh content
    if (tabName === 'goals') loadGoals();
    else if (tabName === 'checkins') loadCheckins();
    else if (tabName === 'team') loadTeamGoals();
    else if (tabName === 'shared') loadSharedGoals();
    else if (tabName === 'admin') loadAdminDashboard();
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
document.getElementById('adminCycleForm')?.addEventListener('submit', saveCycleSetting);

// Close modals when clicking outside
window.onclick = function(event) {
    if (event.target.classList.contains('modal')) {
        event.target.style.display = 'none';
    }
}

async function loadAdminDashboard() {
    try {
        const [summaryRes, orgRes, cycleRes, goalsRes, auditRes, analyticsRes, escalationRes] = await Promise.all([
            fetch(`${API_BASE_URL}/admin/summary`, { credentials: 'include' }),
            fetch(`${API_BASE_URL}/admin/org`, { credentials: 'include' }),
            fetch(`${API_BASE_URL}/admin/cycles`, { credentials: 'include' }),
            fetch(`${API_BASE_URL}/admin/goals`, { credentials: 'include' }),
            fetch(`${API_BASE_URL}/admin/audit`, { credentials: 'include' }),
            fetch(`${API_BASE_URL}/admin/analytics/overview`, { credentials: 'include' }),
            fetch(`${API_BASE_URL}/admin/escalations`, { credentials: 'include' })
        ]);

        if (!summaryRes.ok || !orgRes.ok || !cycleRes.ok) {
            console.warn('Admin dashboard failed to load.');
            return;
        }

        const summary = await summaryRes.json();
        const orgUsers = await orgRes.json();
        const cycle = await cycleRes.json();
        const adminGoals = goalsRes.ok ? await goalsRes.json() : [];
        const auditLogs = auditRes.ok ? await auditRes.json() : [];
        const analyticsData = analyticsRes.ok ? await analyticsRes.json() : null;
            const trendData = await fetch(`${API_BASE_URL}/admin/analytics/trends`, { credentials: 'include' }).then(r => r.ok ? r.json() : null);
            const rulesData = await fetch(`${API_BASE_URL}/admin/escalation-rules`, { credentials: 'include' }).then(r => r.ok ? r.json() : []);
        const qoqData = await fetch(`${API_BASE_URL}/admin/analytics/qoq`, { credentials: 'include' }).then(r => r.ok ? r.json() : null);
        const heatmapData = await fetch(`${API_BASE_URL}/admin/analytics/heatmap`, { credentials: 'include' }).then(r => r.ok ? r.json() : []);
        const distributionData = await fetch(`${API_BASE_URL}/admin/analytics/distribution`, { credentials: 'include' }).then(r => r.ok ? r.json() : null);
        const managerEffectiveness = await fetch(`${API_BASE_URL}/admin/analytics/manager-effectiveness`, { credentials: 'include' }).then(r => r.ok ? r.json() : []);
        const escalations = escalationRes.ok ? await escalationRes.json() : [];

            renderAdminDashboard(summary, orgUsers, cycle, adminGoals, auditLogs, analyticsData, escalations, trendData, rulesData, qoqData, heatmapData, distributionData, managerEffectiveness);
    } catch (error) {
        console.error('Error loading admin dashboard:', error);
    }
}

async function runEscalationCheck() {
    try {
        const response = await fetch(`${API_BASE_URL}/admin/escalations/run`, {
            method: 'POST',
            credentials: 'include'
        });

        if (response.ok) {
            alert('Escalation check completed. Refreshing dashboard...');
            await loadAdminDashboard();
        } else {
            const data = await response.json();
            alert('Failed to run escalation checks: ' + (data.error || 'Unknown error'));
        }
    } catch (error) {
        console.error('Error running escalation check:', error);
        alert('Failed to run escalation checks.');
    }
}

async function runReminderCheck() {
    try {
        const response = await fetch(`${API_BASE_URL}/admin/reminders/run`, {
            method: 'POST',
            credentials: 'include'
        });

        if (response.ok) {
            const data = await response.json();
            alert('Reminders sent. See admin logs for details.');
            await loadAdminDashboard();
        } else {
            const data = await response.json();
            alert('Failed to send reminders: ' + (data.error || 'Unknown error'));
        }
    } catch (err) {
        console.error('Error running reminders:', err);
        alert('Failed to run reminders.');
    }
}

function openEditEscalationModalById(ruleId) {
    const rules = window.latestEscalationRules || [];
    const rule = rules.find(r => r.id === parseInt(ruleId));
    if (!rule) return alert('Rule not found');
    document.getElementById('editRuleKey').value = rule.rule_key || '';
    document.getElementById('editRuleDescription').value = rule.description || '';
    document.getElementById('editThreshold').value = rule.threshold_days || 0;
    document.getElementById('editActive').value = rule.active ? '1' : '0';
    document.getElementById('editEscalationModal').style.display = 'block';
    window._editingEscalationId = rule.id;
}

function closeEditEscalationModal() {
    document.getElementById('editEscalationModal').style.display = 'none';
    window._editingEscalationId = null;
}

async function saveEscalationRule(event) {
    event.preventDefault();
    const id = window._editingEscalationId;
    if (!id) return alert('No rule selected');
    const threshold_days = parseInt(document.getElementById('editThreshold').value || '0');
    const active = document.getElementById('editActive').value === '1';

    try {
        const response = await fetch(`${API_BASE_URL}/admin/escalation-rules/${id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ threshold_days, active })
        });

        if (response.ok) {
            alert('Escalation rule updated');
            closeEditEscalationModal();
            await loadAdminDashboard();
        } else {
            const data = await response.json();
            alert('Failed to update: ' + (data.error || 'Unknown'));
        }
    } catch (err) {
        console.error('Error updating rule', err);
        alert('Failed to update rule');
    }
}

document.getElementById('editEscalationForm')?.addEventListener('submit', saveEscalationRule);

function renderAdminDashboard(summary, orgUsers, cycle, adminGoals = [], auditLogs = [], analyticsData = null, escalations = [], trendData = null, rulesData = [], qoqData = null, heatmapData = [], distributionData = null, managerEffectiveness = []) {
    document.getElementById('adminSummary').innerHTML = `
        <div class="admin-summary-card">
            <div><strong>Total Goals</strong><span>${summary.total_goals}</span></div>
            <div><strong>Approved</strong><span>${summary.approved_goals}</span></div>
            <div><strong>Pending</strong><span>${summary.pending_goals}</span></div>
            <div><strong>Average Progress</strong><span>${Math.round(summary.avg_progress || 0)}%</span></div>
        </div>
        <div class="admin-summary-card">
            <h3>Department Progress</h3>
            ${summary.department_stats.map(dep => `
                <div class="admin-department-row">
                    <span>${escapeHtml(dep.department)}</span>
                    <span>${Math.round(dep.avg_progress || 0)}%</span>
                </div>
            `).join('')}
        </div>
    `;

    document.getElementById('adminOrgList').innerHTML = orgUsers.map(user => `
        <div class="admin-org-row">
            <span>${escapeHtml(user.name)}</span>
            <span>${escapeHtml(user.role)}</span>
            <span>${escapeHtml(user.department)}</span>
        </div>
    `).join('');

    document.getElementById('adminCycleInput').value = cycle.active_cycle || '';

    // Render analytics summary
    document.getElementById('adminAnalyticsSummary').innerHTML = analyticsData ? `
        <div><strong>Total Goals</strong>: ${analyticsData.overview.total_goals}</div>
        <div><strong>Approved</strong>: ${analyticsData.overview.approved_goals}</div>
        <div><strong>Pending</strong>: ${analyticsData.overview.pending_goals}</div>
        <div><strong>Average Progress</strong>: ${Math.round(analyticsData.overview.avg_progress || 0)}%</div>
        <div class="admin-analytics-block">
            <h4>By Thrust Area</h4>
            ${analyticsData.byThrust.map(item => `<div>${escapeHtml(item.thrust_area)}: ${item.count} goals</div>`).join('')}
        </div>
        <div class="admin-analytics-block">
            <h4>By Department</h4>
            ${analyticsData.byDepartment.map(item => `<div>${escapeHtml(item.department)}: ${Math.round(item.avg_progress || 0)}% avg progress</div>`).join('')}
        </div>
    ` : '<p>No analytics data available.</p>';

    // Render escalation alerts
    document.getElementById('adminEscalationList').innerHTML = escalations.length === 0 ? '<p>No escalation alerts yet.</p>' : escalations.map(e => `
        <div class="audit-row">
            <div><strong>${escapeHtml(e.rule_key)}</strong> — ${escapeHtml(e.triggered_for || e.department || 'N/A')}</div>
            <div>${escapeHtml(e.details || '')} <span class="muted">${new Date(e.created_at).toLocaleString()}</span></div>
        </div>
    `).join('');

    document.getElementById('adminRuleList').innerHTML = rulesData.length === 0 ? '<p>No escalation rules available.</p>' : `
        <div class="admin-analytics-block">
            ${rulesData.map(rule => `
                <div style="display:flex;justify-content:space-between;align-items:center;padding:8px 0;border-bottom:1px solid rgba(255,255,255,0.04);">
                    <div><strong>${escapeHtml(rule.rule_key)}</strong>: ${escapeHtml(rule.description)} — ${rule.threshold_days} days — <em>${rule.active ? 'Active' : 'Inactive'}</em></div>
                    <div><button class="btn-secondary" onclick="openEditEscalationModalById(${rule.id})">Edit</button></div>
                </div>
            `).join('')}
        </div>
    `;
    // keep latest rules for modal
    window.latestEscalationRules = rulesData;

    document.getElementById('adminTrendsList').innerHTML = trendData ? `
        <div class="admin-analytics-block">
            <h4>Goal Trend by Quarter</h4>
            ${trendData.trends.map(item => `<div>${escapeHtml(item.quarter)}: ${item.goal_count} goals, avg ${Math.round(item.avg_progress || 0)}%</div>`).join('')}
        </div>
        <div class="admin-analytics-block">
            <h4>Status Breakdown</h4>
            ${trendData.statusBreakdown.map(item => `<div>${escapeHtml(item.status)}: ${item.count}</div>`).join('')}
        </div>
    ` : '<p>No trend data available.</p>';

    // QoQ
    document.getElementById('adminQoQ').innerHTML = qoqData && qoqData.data && qoqData.data.length ? `
        <div>
            ${qoqData.data.map(q => `<div>${escapeHtml(q.quarter)}: avg ${Math.round(q.avg_progress || 0)}% (${q.count} goals)</div>`).join('')}
        </div>
    ` : '<p>No QoQ data available.</p>';

    // Heatmap (simple table)
    if (heatmapData && heatmapData.length) {
        const rows = heatmapData.map(h => `<tr><td>${escapeHtml(h.department)}</td><td>${escapeHtml(h.quarter)}</td><td>${Math.round(h.avg_progress || 0)}%</td><td>${h.count}</td></tr>`).join('');
        document.getElementById('adminHeatmap').innerHTML = `<table class="simple-table"><thead><tr><th>Department</th><th>Quarter</th><th>Avg Progress</th><th>Goals</th></tr></thead><tbody>${rows}</tbody></table>`;
    } else {
        document.getElementById('adminHeatmap').innerHTML = '<p>No heatmap data available.</p>';
    }

    // Distribution
    if (distributionData) {
        document.getElementById('adminDistribution').innerHTML = `
            <div><strong>By Thrust Area</strong>${distributionData.byThrust.map(b => `<div>${escapeHtml(b.thrust_area)}: ${b.count} (${Math.round(b.avg_progress||0)}% avg)</div>`).join('')}</div>
            <div><strong>By UoM</strong>${distributionData.byUom.map(b => `<div>${escapeHtml(b.uom)}: ${b.count} (${Math.round(b.avg_progress||0)}% avg)</div>`).join('')}</div>
            <div><strong>By Status</strong>${distributionData.byStatus.map(b => `<div>${escapeHtml(b.status)}: ${b.count}</div>`).join('')}</div>
        `;
    } else {
        document.getElementById('adminDistribution').innerHTML = '<p>No distribution data available.</p>';
    }

    // Manager Effectiveness
    if (managerEffectiveness && managerEffectiveness.length) {
        const mgrRows = managerEffectiveness.map(m => `<tr><td>${escapeHtml(m.manager_name)}</td><td>${m.employee_count}</td><td>${m.checked_in_count}</td><td>${m.checkin_completion_rate}%</td><td>${Math.round(m.avg_progress||0)}%</td></tr>`).join('');
        document.getElementById('adminManagerEffectiveness').innerHTML = `<table class="simple-table"><thead><tr><th>Manager</th><th>Employees</th><th>Checked-in</th><th>Completion %</th><th>Avg Progress</th></tr></thead><tbody>${mgrRows}</tbody></table>`;
    } else {
        document.getElementById('adminManagerEffectiveness').innerHTML = '<p>No manager effectiveness data available.</p>';
    }

    // Render goals list
    document.getElementById('adminGoalsList').innerHTML = adminGoals.length === 0 ? '<p>No goals found.</p>' : adminGoals.map(g => `
        <div class="admin-goal-row">
            <div><strong>${escapeHtml(g.title)}</strong> — ${escapeHtml(g.user_name || '')}</div>
            <div>Weight: ${g.weightage}% | Status: ${escapeHtml(g.status)}</div>
        </div>
    `).join('');

    // Render audit logs
    document.getElementById('adminAuditList').innerHTML = auditLogs.length === 0 ? '<p>No audit entries yet.</p>' : auditLogs.map(a => `
        <div class="audit-row">
            <div><strong>${escapeHtml(a.action)}</strong> by ${escapeHtml(a.user_name || 'System')}</div>
            <div>${escapeHtml(a.details || '')} <span class="muted">${new Date(a.created_at).toLocaleString()}</span></div>
        </div>
    `).join('');
}

async function saveCycleSetting(event) {
    event.preventDefault();
    const activeCycle = document.getElementById('adminCycleInput').value.trim();

    if (!activeCycle) {
        alert('Please enter an active cycle.');
        return;
    }

    try {
        const response = await fetch(`${API_BASE_URL}/admin/cycles`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ active_cycle: activeCycle })
        });

        if (response.ok) {
            alert('Active cycle updated successfully!');
            await loadAdminDashboard();
        } else {
            const data = await response.json();
            alert('Error: ' + (data.error || 'Failed to update cycle')); 
        }
    } catch (error) {
        console.error('Error updating cycle:', error);
        alert('Failed to update cycle');
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
            
            if (currentUser.role === 'manager' || currentUser.role === 'admin' || currentUser.role === 'hr') {
                document.getElementById('teamTabBtn').style.display = 'inline-block';
                document.getElementById('sharedTabBtn').style.display = 'inline-block';
            }

            if (currentUser.role === 'admin' || currentUser.role === 'hr') {
                document.getElementById('adminTabBtn').style.display = 'inline-block';
            }
            
            await loadGoals();
            await loadCheckins();
            
            if (currentUser.role === 'manager' || currentUser.role === 'admin' || currentUser.role === 'hr') {
                await loadTeamGoals();
                await loadSharedGoals();
            }

            if (currentUser.role === 'admin' || currentUser.role === 'hr') {
                await loadAdminDashboard();
            }
        }
    } catch (error) {
        console.error('Auth check error:', error);
    }
}

// Initialize
checkAuth();

// Charts helper
window.adminCharts = {};

function destroyAdminCharts() {
    Object.values(window.adminCharts || {}).forEach(c => {
        try { c.destroy(); } catch (e) {}
    });
    window.adminCharts = {};
}

function renderAdminCharts(qoqData, distributionData, managerEffectiveness) {
    destroyAdminCharts();

    // QoQ line chart
    const qoqEl = document.getElementById('adminQoQ');
    if (qoqData && qoqData.data && qoqData.data.length) {
        qoqEl.innerHTML = '<canvas id="chartQoQ" style="height:180px"></canvas>';
        const labels = qoqData.data.slice().reverse().map(d => d.quarter);
        const series = qoqData.data.slice().reverse().map(d => Number((d.avg_progress||0).toFixed(1)));
        const ctx = document.getElementById('chartQoQ').getContext('2d');
        window.adminCharts.qoq = new Chart(ctx, {
            type: 'line',
            data: { labels, datasets: [{ label: 'Avg Progress %', data: series, borderColor: '#7c3aed', backgroundColor: 'rgba(124,58,237,0.12)', tension: 0.3 }] },
            options: { responsive: true, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true, max: 100 } } }
        });
    }

    // Distribution bar chart (by thrust area)
    const distEl = document.getElementById('adminDistribution');
    if (distributionData && distributionData.byThrust && distributionData.byThrust.length) {
        // create a canvas above the textual breakdown
        distEl.insertAdjacentHTML('afterbegin', '<canvas id="chartDistribution" style="height:200px;margin-bottom:12px"></canvas>');
        const labels = distributionData.byThrust.map(b => b.thrust_area);
        const series = distributionData.byThrust.map(b => b.count);
        const ctx2 = document.getElementById('chartDistribution').getContext('2d');
        window.adminCharts.distribution = new Chart(ctx2, {
            type: 'bar',
            data: { labels, datasets: [{ label: 'Goals', data: series, backgroundColor: '#22d3ee' }] },
            options: { responsive: true, plugins: { legend: { display: false } } }
        });
    }

    // Manager effectiveness chart
    const mgrEl = document.getElementById('adminManagerEffectiveness');
    if (managerEffectiveness && managerEffectiveness.length) {
        mgrEl.insertAdjacentHTML('afterbegin', '<canvas id="chartManagers" style="height:200px;margin-bottom:12px"></canvas>');
        const labels = managerEffectiveness.map(m => m.manager_name);
        const series = managerEffectiveness.map(m => Number(m.checkin_completion_rate || 0));
        const ctx3 = document.getElementById('chartManagers').getContext('2d');
        window.adminCharts.managers = new Chart(ctx3, {
            type: 'bar',
            data: { labels, datasets: [{ label: 'Check-in Completion %', data: series, backgroundColor: '#34d399' }] },
            options: { responsive: true, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true, max: 100 } } }
        });
    }
}